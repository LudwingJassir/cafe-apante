// Carga datos de demostración (productos, clientes y ~4 meses de ventas ficticias)
// en una base APARTE, para presentar el sistema sin tocar la información real.
//
//   Uso (PowerShell):  $env:SQL_BASE = 'CafeApante_Demo'; npm run db:demo
//   Luego, para abrirla: $env:SQL_BASE = 'CafeApante_Demo'; npm start
import { calcularVenta, gramosALibras, nivelStock, redondear } from '../../shared/calculos.js';
import { SQL_BASE } from '../config.js';
import { configTributaria } from '../servicios/impuestos.js';
import { fechaLocal, sumarDias } from '../util.js';
import { cerrarPool, q, transaccion, uno } from './conexion.js';
import { inicializarBase } from './init.js';

const DIAS_DE_HISTORIA = 125;

if (SQL_BASE === 'CafeApante') {
  console.error('Por seguridad, los datos de demostración no se cargan en la base real "CafeApante".');
  console.error("Indique otra base, por ejemplo:  $env:SQL_BASE = 'CafeApante_Demo'; npm run db:demo");
  process.exit(1);
}

// Generador pseudoaleatorio con semilla fija: la demostración sale igual cada vez.
let semilla = 20260819;
function azar() {
  semilla = (semilla * 1664525 + 1013904223) % 4294967296;
  return semilla / 4294967296;
}
const entre = (min, max) => Math.floor(azar() * (max - min + 1)) + min;
const elegir = (lista) => lista[Math.floor(azar() * lista.length)];

const PRODUCTOS = [
  { nombre: 'Café Molido Tueste Medio', tipo: 'MOLIDO', descripcion: 'Balanceado, notas de chocolate', reorden: 40, p400: 320, p1lb: 360, peso: 5 },
  { nombre: 'Café Molido Tueste Oscuro', tipo: 'MOLIDO', descripcion: 'Intenso, cuerpo completo', reorden: 30, p400: 330, p1lb: 370, peso: 3 },
  { nombre: 'Café Molido Tueste Claro', tipo: 'MOLIDO', descripcion: 'Suave, notas cítricas', reorden: 20, p400: 345, p1lb: 390, peso: 2 },
  { nombre: 'Café en Grano Selecto', tipo: 'GRANO', descripcion: 'Grano entero de altura', reorden: 15, p400: 350, p1lb: 395, peso: 1 },
];
const CLIENTES = [
  { nombre: 'Distribuidora El Buen Sabor', categoria: 'GRANDE', esRetenedor: true, identificacion: 'J0310000000001', telefono: '2222-0101' },
  { nombre: 'Cafetería La Esquina', categoria: 'GRANDE', esRetenedor: false, identificacion: 'J0310000000002', telefono: '2222-0102' },
  { nombre: 'Pulpería Doña Marta', categoria: 'GRANDE', esRetenedor: false, telefono: '8888-0103' },
  { nombre: 'Carlos Mendoza', categoria: 'PEQUENO', esRetenedor: false, telefono: '8888-0104' },
  { nombre: 'Ana Lucía Rivas', categoria: 'PEQUENO', esRetenedor: false, telefono: '8888-0105' },
  { nombre: 'Oficina Contable Pérez', categoria: 'PEQUENO', esRetenedor: false, telefono: '2222-0106' },
];

async function sembrarCatalogo(idAdmin) {
  const productos = [];
  for (const p of PRODUCTOS) {
    const { idProducto } = await uno(
      'INSERT INTO dbo.Producto (nombre, tipo, descripcion, puntoReorden) OUTPUT inserted.idProducto VALUES (@nombre, @tipo, @descripcion, @reorden)',
      { nombre: p.nombre, tipo: p.tipo, descripcion: p.descripcion, reorden: p.reorden },
    );
    const presentaciones = [];
    for (const [nombre, pesoLibras, precio] of [['Bolsa 400 g', gramosALibras(400), p.p400], ['Bolsa 1 lb', 1, p.p1lb]]) {
      const fila = await uno(
        'INSERT INTO dbo.Presentacion (idProducto, nombre, pesoLibras, precio, precioMayorista) OUTPUT inserted.idPresentacion VALUES (@idProducto, @nombre, @pesoLibras, @precio, @mayorista)',
        { idProducto, nombre, pesoLibras, precio, mayorista: Math.round(precio * 0.9) },
      );
      presentaciones.push({ idPresentacion: fila.idPresentacion, nombre, pesoLibras, precio, precioMayorista: Math.round(precio * 0.9) });
    }
    productos.push({ ...p, idProducto, presentaciones, stock: 0 });
  }
  const clientes = [];
  for (const c of CLIENTES) {
    const fila = await uno(
      'INSERT INTO dbo.Cliente (nombre, telefono, identificacion, categoria, esRetenedor) OUTPUT inserted.idCliente VALUES (@nombre, @telefono, @identificacion, @categoria, @esRetenedor)',
      { nombre: c.nombre, telefono: c.telefono, identificacion: c.identificacion ?? null, categoria: c.categoria, esRetenedor: c.esRetenedor },
    );
    clientes.push({ ...c, idCliente: fila.idCliente });
  }
  await q(
    `UPDATE dbo.ConfiguracionNegocio SET ruc = N'J0000000000000', direccion = N'Managua, Nicaragua (datos de demostración)', telefono = N'0000-0000',
            banco = N'Banco de Ejemplo', titularCuenta = N'Café Apante (demostración)', cuentaNIO = N'000-000000-0', cuentaUSD = N'000-000000-1'`,
  );
  // En la demostración se entra directo con las contraseñas iniciales, sin cambio obligatorio.
  await q('UPDATE dbo.Usuario SET debeCambiarContrasena = 0');
  await q(
    "INSERT INTO dbo.Bitacora (idUsuario, usuario, accion, detalle) VALUES (@id, N'Sistema', 'CONFIG_NEGOCIO', N'Carga de datos de demostración')",
    { id: idAdmin },
  );
  return { productos, clientes };
}

async function moverStockDemo(tx, producto, { delta, tipo, fecha, idUsuario, motivo, lote = null, idVenta = null }) {
  producto.stock = redondear(producto.stock + delta, 3);
  await q(
    `INSERT INTO dbo.MovimientoInventario (idProducto, idUsuario, tipo, cantidadLibras, stockResultante, fecha, motivo, lote, idVenta)
     VALUES (@idProducto, @idUsuario, @tipo, @delta, @stock, @fecha, @motivo, @lote, @idVenta)`,
    { idProducto: producto.idProducto, idUsuario, tipo, delta, stock: producto.stock, fecha, motivo, lote, idVenta },
    tx,
  );
}

async function sembrarDia(dia, indice, contexto) {
  const { productos, clientes, usuarios, tributaria, tipoCambio } = contexto;
  const fechaDia = fechaLocal(dia);
  const hora = (h, m) => `${fechaDia}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;

  await transaccion(async (tx) => {
    // Producción repone los lunes y cuando un producto queda corto.
    for (const p of productos) {
      if (dia.getDay() === 1 || p.stock < p.reorden) {
        contexto.lote += 1;
        await moverStockDemo(tx, p, { delta: p.peso * entre(22, 34), tipo: 'ENTRADA', fecha: hora(7, entre(5, 50)), idUsuario: usuarios.PRODUCCION, motivo: 'Entrada de café procesado', lote: `L-${String(contexto.lote).padStart(3, '0')}` });
      }
    }
    if (indice % 17 === 5) {
      const p = elegir(productos);
      await moverStockDemo(tx, p, { delta: -entre(1, 3), tipo: 'MERMA', fecha: hora(16, 20), idUsuario: usuarios.PRODUCCION, motivo: elegir(['Bolsa rota en bodega', 'Muestra para catación', 'Café humedecido']) });
    }

    const fondo = 500;
    const { idSesion } = await uno(
      'INSERT INTO dbo.SesionCaja (idUsuarioApertura, fechaApertura, montoInicial) OUTPUT inserted.idSesion VALUES (@idUsuario, @apertura, @fondo)',
      { idUsuario: usuarios.VENTAS, apertura: hora(8, 0), fondo },
      tx,
    );

    // Las ventas crecen poco a poco y los sábados se vende más.
    const tendencia = 1 + indice / (DIAS_DE_HISTORIA * 1.6);
    const cantidadVentas = Math.round(entre(4, 8) * tendencia * (dia.getDay() === 6 ? 1.5 : 1));
    const caja = { ventas: 0, efectivoNIO: 0, recibidoUSD: 0, vueltoPorUSD: 0, depositos: 0 };

    for (let i = 0; i < cantidadVentas; i += 1) {
      const cliente = azar() < 0.28 ? elegir(clientes) : null;
      const mayorista = cliente?.categoria === 'GRANDE';
      const lineas = [];
      for (let j = 0, total = entre(1, mayorista ? 3 : 2); j < total; j += 1) {
        const producto = productos[[0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 3][entre(0, 10)]];
        const pr = producto.presentaciones[azar() < 0.62 ? 0 : 1];
        if (lineas.some((l) => l.idPresentacion === pr.idPresentacion)) continue;
        const cantidad = mayorista ? entre(6, 20) : entre(1, 3);
        const cantidadLibras = redondear(pr.pesoLibras * cantidad, 3);
        if (producto.stock - cantidadLibras < 0) continue;
        lineas.push({ ...pr, producto, cantidad, cantidadLibras, aplicaIVA: true, precioUnitario: mayorista ? pr.precioMayorista : pr.precio });
      }
      if (lineas.length === 0) continue;

      const c = calcularVenta(lineas, tributaria, cliente);
      const metodo = mayorista ? (azar() < 0.7 ? 'DEPOSITO' : 'EFECTIVO') : azar() < 0.22 ? 'DEPOSITO' : 'EFECTIVO';
      const moneda = metodo === 'EFECTIVO' && azar() < 0.12 ? 'USD' : 'NIO';
      let recibido = c.totalCobrar;
      let vuelto = 0;
      if (metodo === 'EFECTIVO' && moneda === 'USD') {
        recibido = Math.ceil(c.totalCobrar / tipoCambio / 5) * 5;
        vuelto = redondear(recibido * tipoCambio - c.totalCobrar);
        caja.recibidoUSD += recibido;
        caja.vueltoPorUSD += vuelto;
      } else if (metodo === 'EFECTIVO') {
        recibido = Math.ceil(c.totalCobrar / 100) * 100;
        vuelto = redondear(recibido - c.totalCobrar);
        caja.efectivoNIO += c.totalCobrar;
      } else {
        caja.depositos += c.totalCobrar;
      }
      caja.ventas += c.totalCobrar;

      const fecha = hora(entre(8, 17), entre(0, 59));
      const { idVenta } = await uno(
        `INSERT INTO dbo.Venta (fecha, idCliente, idUsuario, idSesionCaja, subtotal, ivaCalculado, retencionDGI, total, totalCobrar, totalLibras,
                                metodoPago, monedaPago, montoRecibido, tipoCambio, vuelto, referenciaDeposito)
         OUTPUT inserted.idVenta
         VALUES (@fecha, @idCliente, @idUsuario, @idSesion, @subtotal, @iva, @retencion, @total, @totalCobrar, @totalLibras,
                 @metodo, @moneda, @recibido, @tipoCambio, @vuelto, @referencia)`,
        {
          fecha, idCliente: cliente?.idCliente ?? null, idUsuario: usuarios.VENTAS, idSesion, subtotal: c.subtotal, iva: c.iva, retencion: c.retencion,
          total: c.total, totalCobrar: c.totalCobrar, totalLibras: redondear(lineas.reduce((s, l) => s + l.cantidadLibras, 0), 3),
          metodo, moneda, recibido, tipoCambio, vuelto, referencia: metodo === 'DEPOSITO' ? `TRX-${500000 + (contexto.deposito += 1)}` : null,
        },
        tx,
      );
      for (const [k, l] of lineas.entries()) {
        await q(
          `INSERT INTO dbo.DetalleVenta (idVenta, idProducto, idPresentacion, descripcion, cantidad, cantidadLibras, precioUnitario, subtotal, iva, importe)
           VALUES (@idVenta, @idProducto, @idPresentacion, @descripcion, @cantidad, @cantidadLibras, @precioUnitario, @subtotal, @iva, @importe)`,
          { idVenta, idProducto: l.producto.idProducto, idPresentacion: l.idPresentacion, descripcion: `${l.producto.nombre} · ${l.nombre}`, cantidad: l.cantidad, cantidadLibras: l.cantidadLibras, precioUnitario: l.precioUnitario, ...c.lineas[k] },
          tx,
        );
        await moverStockDemo(tx, l.producto, { delta: -l.cantidadLibras, tipo: 'VENTA', fecha, idUsuario: usuarios.VENTAS, motivo: 'Venta', idVenta });
      }
      contexto.factura += 1;
      await q(
        'INSERT INTO dbo.Factura (idVenta, numeroFactura, fechaEmision, subtotal, iva, retencionDGI, total) VALUES (@idVenta, @numero, @fecha, @subtotal, @iva, @retencion, @total)',
        { idVenta, numero: `A-${String(contexto.factura).padStart(6, '0')}`, fecha, subtotal: c.subtotal, iva: c.iva, retencion: c.retencion, total: c.total },
        tx,
      );
    }

    const esperadoNIO = redondear(fondo + caja.efectivoNIO - caja.vueltoPorUSD);
    const diferencia = indice % 23 === 11 ? -20 : 0;
    await q(
      `UPDATE dbo.SesionCaja SET estado = 'CERRADA', idUsuarioCierre = @idUsuario, fechaCierre = @cierre, esperadoNIO = @esperadoNIO, esperadoUSD = @usd,
              contadoNIO = @contado, contadoUSD = @usd, diferenciaNIO = @diferencia, diferenciaUSD = 0, totalVentas = @ventas, totalDepositos = @depositos,
              observacion = @observacion
       WHERE idSesion = @idSesion`,
      { idSesion, idUsuario: usuarios.VENTAS, cierre: hora(18, 5), esperadoNIO, usd: caja.recibidoUSD, contado: esperadoNIO + diferencia, diferencia, ventas: redondear(caja.ventas), depositos: redondear(caja.depositos), observacion: diferencia ? 'Faltó cambio al entregar un vuelto' : null },
      tx,
    );
  });
}

async function sembrarGastos(inicio, hoy, idAdmin) {
  for (let mes = new Date(inicio.getFullYear(), inicio.getMonth(), 1); mes <= hoy; mes = new Date(mes.getFullYear(), mes.getMonth() + 1, 1)) {
    const gastos = [
      [1, 'Alquiler', 'Alquiler del local y la bodega', 12000, 0],
      [3, 'Compra de café', 'Café oro, proveedores de Matagalpa y Jinotega', entre(205000, 240000), 0],
      [5, 'Empaque y etiquetas', 'Bolsas con válvula y etiquetas', entre(18000, 24000), 0.15],
      [15, 'Salarios', 'Planilla del mes', 48000, 0],
      [18, 'Servicios básicos', 'Energía, agua e internet', entre(6000, 8000), 0.15],
      [20, 'Transporte', 'Flete de café y entregas', entre(6000, 9000), 0],
    ];
    for (const [dia, categoria, descripcion, monto, tasaIVA] of gastos) {
      const fecha = new Date(mes.getFullYear(), mes.getMonth(), dia);
      if (fecha < inicio || fecha > hoy) continue;
      await q(
        'INSERT INTO dbo.Gasto (fecha, categoria, descripcion, monto, ivaAcreditable, idUsuario) VALUES (@fecha, @categoria, @descripcion, @monto, @iva, @idUsuario)',
        { fecha: fechaLocal(fecha), categoria, descripcion, monto, iva: redondear(monto * tasaIVA), idUsuario: idAdmin },
      );
    }
  }
}

try {
  await inicializarBase();
  if ((await uno('SELECT COUNT(*) AS total FROM dbo.Producto')).total > 0) {
    console.error(`La base "${SQL_BASE}" ya tiene productos. La demostración solo se carga en una base vacía.`);
    process.exit(1);
  }

  const usuarios = Object.fromEntries((await q('SELECT idUsuario, rol FROM dbo.Usuario')).map((u) => [u.rol, u.idUsuario]));
  const { productos, clientes } = await sembrarCatalogo(usuarios.ADMIN);
  const tributaria = await configTributaria();
  const { tipoCambio, factorStockMedio } = await uno('SELECT tipoCambio, factorStockMedio FROM dbo.ConfiguracionNegocio');
  const contexto = { productos, clientes, usuarios, tributaria, tipoCambio, lote: 0, factura: 0, deposito: 0 };

  const hoy = new Date();
  const inicio = sumarDias(hoy, -DIAS_DE_HISTORIA);
  for (let i = 0; i < DIAS_DE_HISTORIA; i += 1) {
    const dia = sumarDias(inicio, i);
    if (dia.getDay() !== 0) await sembrarDia(dia, i, contexto); // domingos cerrado
    if (i % 25 === 0) console.log(`  … ${fechaLocal(dia)}`);
  }
  await sembrarGastos(inicio, hoy, usuarios.ADMIN);

  // Un producto queda a propósito en stock bajo y otro en medio, para mostrar el semáforo y las notificaciones.
  const ajustes = [[productos[2], productos[2].reorden * 0.8], [productos[3], productos[3].reorden * 1.3]];
  for (const [p, objetivo] of ajustes) {
    await transaccion((tx) => moverStockDemo(tx, p, { delta: redondear(objetivo - p.stock, 3), tipo: 'AJUSTE', fecha: `${fechaLocal(hoy)}T07:30:00`, idUsuario: usuarios.PRODUCCION, motivo: 'Conteo físico semanal' }));
  }
  for (const p of productos) {
    const nivel = nivelStock(p.stock, p.reorden, factorStockMedio);
    await q('UPDATE dbo.Producto SET stockActual = @stock, estadoSemaforo = @nivel WHERE idProducto = @id', { stock: p.stock, nivel, id: p.idProducto });
    if (nivel === 'BAJO') await q("INSERT INTO dbo.Notificacion (tipo, nivel, titulo, mensaje, roles, enlace) VALUES ('STOCK', 'CRITICO', @titulo, @mensaje, 'ADMIN,VENTAS,PRODUCCION', '/inventario')", { titulo: `Stock bajo: ${p.nombre}`, mensaje: `El stock llegó al punto de reorden. Conviene procesar más café. Quedan ${redondear(p.stock, 1)} lb (punto de reorden: ${p.reorden} lb).` });
    if (nivel === 'MEDIO') await q("INSERT INTO dbo.Notificacion (tipo, nivel, titulo, mensaje, roles, enlace) VALUES ('STOCK', 'ADVERTENCIA', @titulo, @mensaje, 'ADMIN,VENTAS,PRODUCCION', '/inventario')", { titulo: `Stock medio: ${p.nombre}`, mensaje: `El stock se acerca al punto de reorden. Vaya planificando la producción. Quedan ${redondear(p.stock, 1)} lb (punto de reorden: ${p.reorden} lb).` });
  }
  await q('UPDATE dbo.ConfiguracionNegocio SET siguienteNumero = @siguiente', { siguiente: contexto.factura + 1 });

  console.log(`Demostración lista en "${SQL_BASE}": ${contexto.factura} ventas en ${DIAS_DE_HISTORIA} días.`);
  await cerrarPool();
  process.exit(0);
} catch (error) {
  console.error('No se pudo cargar la demostración:', error.message);
  process.exit(1);
}
