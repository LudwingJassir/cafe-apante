import { Router } from 'express';
import { z } from 'zod';
import { calcularVenta, calcularVuelto, redondear } from '../../shared/calculos.js';
import { permitir } from '../auth.js';
import { q, transaccion, uno } from '../db/conexion.js';
import { configTributaria } from '../servicios/impuestos.js';
import { moverStock } from '../servicios/inventario.js';
import { notificar, registrarBitacora } from '../servicios/notificaciones.js';
import { dinero, entero, ErrorApp, fechaISO, id, idDeRuta, moneda, texto, textoOpcional, validar } from '../util.js';

const router = Router();

const datosVenta = z
  .object({
    idCliente: id.nullish(),
    items: z.array(z.object({ idPresentacion: id, cantidad: entero.pipe(z.number().positive('La cantidad debe ser mayor que cero').max(9999)) })).min(1, 'Agregue al menos un producto').max(50),
    metodoPago: z.enum(['EFECTIVO', 'DEPOSITO']),
    monedaPago: z.enum(['NIO', 'USD']).default('NIO'),
    montoRecibido: dinero.optional(),
    referenciaDeposito: textoOpcional(40),
  })
  // Sin referencia, un depósito no se puede cotejar con el banco: alguien podría cobrar
  // en efectivo, registrarlo como depósito y el arqueo cuadraría igual.
  .refine((d) => d.metodoPago !== 'DEPOSITO' || (d.referenciaDeposito ?? '').length >= 4, {
    message: 'Anote el número de referencia del depósito (al menos 4 caracteres).',
    path: ['referenciaDeposito'],
  });

export async function obtenerVenta(idVenta, tx = null) {
  const venta = await uno(
    `SELECT v.idVenta, v.fecha, v.subtotal, v.ivaCalculado, v.retencionDGI, v.total, v.totalCobrar, v.totalLibras,
            v.metodoPago, v.monedaPago, v.montoRecibido, v.tipoCambio, v.vuelto, v.referenciaDeposito,
            v.estado, v.motivoAnulacion, v.fechaAnulacion, f.numeroFactura,
            u.nombre AS vendedor, c.idCliente, c.nombre AS cliente, c.identificacion AS clienteIdentificacion, c.categoria AS clienteCategoria
     FROM dbo.Venta v
     JOIN dbo.Usuario u ON u.idUsuario = v.idUsuario
     LEFT JOIN dbo.Factura f ON f.idVenta = v.idVenta
     LEFT JOIN dbo.Cliente c ON c.idCliente = v.idCliente
     WHERE v.idVenta = @idVenta`,
    { idVenta },
    tx,
  );
  if (!venta) return null;
  venta.detalles = await q(
    'SELECT descripcion, cantidad, cantidadLibras, precioUnitario, subtotal, iva, importe FROM dbo.DetalleVenta WHERE idVenta = @idVenta ORDER BY idDetalle',
    { idVenta },
    tx,
  );
  return venta;
}

/** Junta líneas repetidas de la misma presentación para validar el stock una sola vez. */
function consolidar(items) {
  const cantidades = new Map();
  for (const item of items) cantidades.set(item.idPresentacion, (cantidades.get(item.idPresentacion) ?? 0) + item.cantidad);
  return [...cantidades].map(([idPresentacion, cantidad]) => ({ idPresentacion, cantidad }));
}

router.post('/', async (req, res) => {
  const datos = validar(datosVenta, req.body);
  const items = consolidar(datos.items);

  const idVenta = await transaccion(async (tx) => {
    // UPDLOCK: un cierre de caja simultáneo espera a que esta venta termine (y viceversa).
    const sesion = await uno("SELECT idSesion FROM dbo.SesionCaja WITH (UPDLOCK) WHERE estado = 'ABIERTA'", {}, tx);
    if (!sesion) throw new ErrorApp(409, 'La caja está cerrada. Abra la caja para poder vender.');

    const tributaria = await configTributaria(tx);
    const { tipoCambio } = await uno('SELECT tipoCambio FROM dbo.ConfiguracionNegocio WHERE idConfig = 1', {}, tx);

    let cliente = null;
    if (datos.idCliente) {
      cliente = await uno("SELECT idCliente, categoria, esRetenedor FROM dbo.Cliente WHERE idCliente = @id AND estado = 'ACTIVO'", { id: datos.idCliente }, tx);
      if (!cliente) throw new ErrorApp(400, 'El cliente seleccionado no existe o está inactivo.');
    }

    // Los nombres @p1, @p2... los reserva el controlador ODBC; por eso se usa otro prefijo.
    const parametros = Object.fromEntries(items.map((item, i) => [`pres${i}`, item.idPresentacion]));
    const presentaciones = await q(
      `SELECT pr.idPresentacion, pr.idProducto, pr.nombre, pr.pesoLibras, pr.precio, pr.precioMayorista, p.nombre AS producto, p.aplicaIVA
       FROM dbo.Presentacion pr JOIN dbo.Producto p ON p.idProducto = pr.idProducto
       WHERE pr.estado = 'ACTIVO' AND p.estado = 'ACTIVO' AND pr.idPresentacion IN (${items.map((_, i) => `@pres${i}`).join(', ')})`,
      parametros,
      tx,
    );

    // Los precios siempre salen de la base de datos: lo que envía el navegador no se usa para cobrar.
    const lineas = items.map((item) => {
      const pr = presentaciones.find((p) => p.idPresentacion === item.idPresentacion);
      if (!pr) throw new ErrorApp(400, 'Uno de los productos ya no está disponible. Actualice la pantalla.');
      return {
        ...pr,
        cantidad: item.cantidad,
        precioUnitario: cliente?.categoria === 'GRANDE' ? pr.precioMayorista : pr.precio,
        aplicaIVA: Boolean(pr.aplicaIVA),
        cantidadLibras: redondear(pr.pesoLibras * item.cantidad, 3),
      };
    });

    const calculo = calcularVenta(lineas, tributaria, cliente);
    if (calculo.totalCobrar <= 0) throw new ErrorApp(400, 'El total de la venta debe ser mayor que cero. Revise los precios.');

    let pago;
    if (datos.metodoPago === 'EFECTIVO') {
      if (datos.montoRecibido == null) throw new ErrorApp(400, 'Indique cuánto dinero entregó el cliente.');
      const vuelto = calcularVuelto({ totalCobrar: calculo.totalCobrar, moneda: datos.monedaPago, montoRecibido: datos.montoRecibido, tipoCambio });
      if (!vuelto.suficiente) throw new ErrorApp(400, `El pago no alcanza: faltan ${moneda(vuelto.faltante)}.`);
      pago = { montoRecibido: datos.montoRecibido, vuelto: vuelto.vuelto, referencia: null };
    } else {
      const monto = datos.monedaPago === 'USD' ? redondear(calculo.totalCobrar / tipoCambio) : calculo.totalCobrar;
      pago = { montoRecibido: monto, vuelto: 0, referencia: datos.referenciaDeposito ?? null };
    }

    const totalLibras = redondear(lineas.reduce((s, l) => s + l.cantidadLibras, 0), 3);
    const venta = await uno(
      `INSERT INTO dbo.Venta (idCliente, idUsuario, idSesionCaja, subtotal, ivaCalculado, retencionDGI, total, totalCobrar, totalLibras,
                              metodoPago, monedaPago, montoRecibido, tipoCambio, vuelto, referenciaDeposito)
       OUTPUT inserted.idVenta
       VALUES (@idCliente, @idUsuario, @idSesion, @subtotal, @iva, @retencion, @total, @totalCobrar, @totalLibras,
               @metodoPago, @monedaPago, @montoRecibido, @tipoCambio, @vuelto, @referencia)`,
      {
        idCliente: cliente?.idCliente ?? null, idUsuario: req.usuario.idUsuario, idSesion: sesion.idSesion,
        subtotal: calculo.subtotal, iva: calculo.iva, retencion: calculo.retencion, total: calculo.total, totalCobrar: calculo.totalCobrar,
        totalLibras, metodoPago: datos.metodoPago, monedaPago: datos.monedaPago, tipoCambio, ...pago,
      },
      tx,
    );

    for (const [i, linea] of lineas.entries()) {
      await q(
        `INSERT INTO dbo.DetalleVenta (idVenta, idProducto, idPresentacion, descripcion, cantidad, cantidadLibras, precioUnitario, subtotal, iva, importe)
         VALUES (@idVenta, @idProducto, @idPresentacion, @descripcion, @cantidad, @cantidadLibras, @precioUnitario, @subtotal, @iva, @importe)`,
        {
          idVenta: venta.idVenta, idProducto: linea.idProducto, idPresentacion: linea.idPresentacion,
          descripcion: `${linea.producto} · ${linea.nombre}`, cantidad: linea.cantidad, cantidadLibras: linea.cantidadLibras,
          precioUnitario: linea.precioUnitario, ...calculo.lineas[i],
        },
        tx,
      );
    }

    const consecutivo = await uno(
      `UPDATE dbo.ConfiguracionNegocio SET siguienteNumero = siguienteNumero + 1
       OUTPUT deleted.siguienteNumero AS numero, deleted.seriePrefijo AS prefijo WHERE idConfig = 1`,
      {},
      tx,
    );
    const numeroFactura = `${consecutivo.prefijo}-${String(consecutivo.numero).padStart(6, '0')}`;
    await q(
      `INSERT INTO dbo.Factura (idVenta, numeroFactura, subtotal, iva, retencionDGI, total)
       VALUES (@idVenta, @numeroFactura, @subtotal, @iva, @retencion, @total)`,
      { idVenta: venta.idVenta, numeroFactura, subtotal: calculo.subtotal, iva: calculo.iva, retencion: calculo.retencion, total: calculo.total },
      tx,
    );

    // Un movimiento de inventario por producto, aunque se venda en varias presentaciones.
    const librasPorProducto = new Map();
    for (const l of lineas) librasPorProducto.set(l.idProducto, redondear((librasPorProducto.get(l.idProducto) ?? 0) + l.cantidadLibras, 3));
    for (const [idProducto, cantidad] of librasPorProducto) {
      await moverStock(tx, { idProducto, delta: -cantidad, tipo: 'VENTA', idUsuario: req.usuario.idUsuario, motivo: `Venta ${numeroFactura}`, idVenta: venta.idVenta });
    }
    return venta.idVenta;
  }).catch((error) => {
    // El índice único impide que una misma referencia bancaria respalde dos ventas.
    if (/UX_Venta_referencia/.test(error.message)) {
      throw new ErrorApp(409, 'Ya hay otra venta registrada con ese número de referencia. Revise el comprobante del depósito.');
    }
    throw error;
  });

  res.status(201).json(await obtenerVenta(idVenta));
});

router.get('/', async (req, res) => {
  const filtros = validar(
    z.object({
      desde: fechaISO.optional(),
      hasta: fechaISO.optional(),
      buscar: z.string().trim().max(60).optional(),
      estado: z.enum(['COMPLETADA', 'ANULADA']).optional(),
    }),
    req.query,
  );
  res.json(
    await q(
      `SELECT TOP 300 v.idVenta, v.fecha, v.total, v.totalCobrar, v.totalLibras, v.metodoPago, v.monedaPago, v.estado,
              f.numeroFactura, u.nombre AS vendedor, ISNULL(c.nombre, N'Consumidor final') AS cliente
       FROM dbo.Venta v
       JOIN dbo.Usuario u ON u.idUsuario = v.idUsuario
       LEFT JOIN dbo.Factura f ON f.idVenta = v.idVenta
       LEFT JOIN dbo.Cliente c ON c.idCliente = v.idCliente
       WHERE (@desde IS NULL OR v.fecha >= @desde)
         AND (@hasta IS NULL OR v.fecha < DATEADD(DAY, 1, CAST(@hasta AS DATE)))
         AND (@estado IS NULL OR v.estado = @estado)
         AND (@buscar IS NULL OR f.numeroFactura LIKE '%' + @buscar + '%' OR c.nombre LIKE '%' + @buscar + '%')
       ORDER BY v.fecha DESC, v.idVenta DESC`,
      { desde: filtros.desde ?? null, hasta: filtros.hasta ?? null, estado: filtros.estado ?? null, buscar: filtros.buscar || null },
    ),
  );
});

router.get('/:id', async (req, res) => {
  const venta = await obtenerVenta(idDeRuta(req));
  if (!venta) throw new ErrorApp(404, 'La venta no existe.');
  res.json(venta);
});

router.post('/:id/anular', permitir('ADMIN'), async (req, res) => {
  const idVenta = idDeRuta(req);
  const { motivo } = validar(z.object({ motivo: texto(200, 5) }), req.body);
  await transaccion(async (tx) => {
    const abierta = await uno("SELECT idSesion FROM dbo.SesionCaja WITH (UPDLOCK) WHERE estado = 'ABIERTA'", {}, tx);
    const original = await uno('SELECT idSesionCaja, metodoPago FROM dbo.Venta WHERE idVenta = @idVenta', { idVenta }, tx);
    // Si la venta fue en efectivo y su caja ya se cerró, el dinero que se devuelve sale de la gaveta
    // de hoy: debe quedar anotado en la caja abierta para que el arqueo no muestre un faltante falso.
    const devuelveDeOtraCaja = original?.metodoPago === 'EFECTIVO' && original.idSesionCaja !== abierta?.idSesion;
    if (devuelveDeOtraCaja && !abierta) {
      throw new ErrorApp(409, 'Esta venta en efectivo es de una caja ya cerrada. Abra la caja antes de anularla, porque el dinero devuelto sale de la gaveta de hoy.');
    }
    const venta = await uno(
      `UPDATE dbo.Venta SET estado = 'ANULADA', motivoAnulacion = @motivo, idUsuarioAnula = @idUsuario, fechaAnulacion = SYSDATETIME(),
              idSesionAnulacion = @idSesionAnulacion
       OUTPUT inserted.total, inserted.idSesionCaja
       WHERE idVenta = @idVenta AND estado = 'COMPLETADA'`,
      { idVenta, motivo, idUsuario: req.usuario.idUsuario, idSesionAnulacion: devuelveDeOtraCaja ? abierta.idSesion : null },
      tx,
    );
    if (!venta) throw new ErrorApp(409, 'La venta no existe o ya fue anulada.');
    const { numeroFactura } = await uno('SELECT numeroFactura FROM dbo.Factura WHERE idVenta = @idVenta', { idVenta }, tx);
    const devoluciones = await q('SELECT idProducto, SUM(cantidadLibras) AS libras FROM dbo.DetalleVenta WHERE idVenta = @idVenta GROUP BY idProducto', { idVenta }, tx);
    for (const d of devoluciones) {
      await moverStock(tx, { idProducto: d.idProducto, delta: redondear(d.libras, 3), tipo: 'ANULACION', idUsuario: req.usuario.idUsuario, motivo: `Anulación de ${numeroFactura}`, idVenta });
    }
    await registrarBitacora({ usuario: req.usuario, accion: 'VENTA_ANULADA', detalle: `${numeroFactura} por ${moneda(venta.total)}. Motivo: ${motivo}` }, tx);
    await notificar({ tipo: 'VENTA', nivel: 'ADVERTENCIA', titulo: `Venta anulada: ${numeroFactura}`, mensaje: `${req.usuario.nombre} anuló una venta de ${moneda(venta.total)} y el café volvió al inventario. Motivo: ${motivo}`, roles: ['ADMIN', 'VENTAS'], enlace: '/ventas' }, tx);
  });
  res.json(await obtenerVenta(idVenta));
});

export default router;
