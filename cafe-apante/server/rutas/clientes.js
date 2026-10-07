import { Router } from 'express';
import { z } from 'zod';
import { q, uno } from '../db/conexion.js';
import { notificar, registrarBitacora } from '../servicios/notificaciones.js';
import { ErrorApp, idDeRuta, texto, textoOpcional, validar } from '../util.js';

const router = Router();
const NOMBRE_CATEGORIA = { GRANDE: 'Grande (mayorista)', PEQUENO: 'Pequeño (minorista)' };

const datosCliente = z.object({
  nombre: texto(120),
  telefono: textoOpcional(30),
  direccion: textoOpcional(200),
  identificacion: textoOpcional(30),
  categoria: z.enum(['GRANDE', 'PEQUENO']),
  esRetenedor: z.boolean().default(false),
  estado: z.enum(['ACTIVO', 'INACTIVO']).default('ACTIVO'),
});

router.get('/', async (req, res) => {
  const filtros = validar(z.object({ buscar: z.string().trim().max(60).optional(), todos: z.string().optional() }), req.query);
  res.json(
    await q(
      `SELECT c.idCliente, c.nombre, c.telefono, c.direccion, c.identificacion, c.categoria, c.esRetenedor, c.estado,
              COUNT(v.idVenta) AS compras, ISNULL(SUM(v.total), 0) AS totalComprado,
              ISNULL(SUM(v.totalLibras), 0) AS librasCompradas, MAX(v.fecha) AS ultimaCompra
       FROM dbo.Cliente c
       LEFT JOIN dbo.Venta v ON v.idCliente = c.idCliente AND v.estado = 'COMPLETADA'
       WHERE (@todos = 1 OR c.estado = 'ACTIVO')
         AND (@buscar IS NULL OR c.nombre LIKE '%' + @buscar + '%' OR c.telefono LIKE '%' + @buscar + '%' OR c.identificacion LIKE '%' + @buscar + '%')
       GROUP BY c.idCliente, c.nombre, c.telefono, c.direccion, c.identificacion, c.categoria, c.esRetenedor, c.estado
       ORDER BY c.nombre`,
      { buscar: filtros.buscar || null, todos: filtros.todos === '1' ? 1 : 0 },
    ),
  );
});

router.get('/:id', async (req, res) => {
  const idCliente = idDeRuta(req);
  const cliente = await uno('SELECT idCliente, nombre, telefono, direccion, identificacion, categoria, esRetenedor, estado, creadoEn FROM dbo.Cliente WHERE idCliente = @idCliente', { idCliente });
  if (!cliente) throw new ErrorApp(404, 'El cliente no existe.');

  const [resumen, favoritos, ventas] = await Promise.all([
    uno(
      `SELECT COUNT(*) AS compras, ISNULL(SUM(total), 0) AS totalComprado, ISNULL(SUM(totalLibras), 0) AS librasCompradas,
              MIN(fecha) AS primeraCompra, MAX(fecha) AS ultimaCompra
       FROM dbo.Venta WHERE idCliente = @idCliente AND estado = 'COMPLETADA'`,
      { idCliente },
    ),
    q(
      `SELECT TOP 5 d.descripcion, SUM(d.cantidad) AS bolsas, SUM(d.cantidadLibras) AS libras
       FROM dbo.DetalleVenta d JOIN dbo.Venta v ON v.idVenta = d.idVenta
       WHERE v.idCliente = @idCliente AND v.estado = 'COMPLETADA'
       GROUP BY d.descripcion ORDER BY SUM(d.cantidadLibras) DESC`,
      { idCliente },
    ),
    q(
      `SELECT TOP 50 v.idVenta, v.fecha, v.total, v.totalLibras, v.metodoPago, v.monedaPago, v.estado, f.numeroFactura
       FROM dbo.Venta v LEFT JOIN dbo.Factura f ON f.idVenta = v.idVenta
       WHERE v.idCliente = @idCliente ORDER BY v.fecha DESC`,
      { idCliente },
    ),
  ]);

  // Hábito de consumo: cada cuántos días vuelve a comprar, en promedio.
  let diasEntreCompras = null;
  if (resumen.compras > 1) {
    const dias = (new Date(resumen.ultimaCompra) - new Date(resumen.primeraCompra)) / 86400000;
    diasEntreCompras = Math.round((dias / (resumen.compras - 1)) * 10) / 10;
  }
  res.json({ ...cliente, resumen: { ...resumen, diasEntreCompras }, favoritos, ventas });
});

router.post('/', async (req, res) => {
  const d = validar(datosCliente, req.body);
  const creado = await uno(
    `INSERT INTO dbo.Cliente (nombre, telefono, direccion, identificacion, categoria, esRetenedor, estado)
     OUTPUT inserted.*
     VALUES (@nombre, @telefono, @direccion, @identificacion, @categoria, @esRetenedor, @estado)`,
    { nombre: d.nombre, telefono: d.telefono ?? null, direccion: d.direccion ?? null, identificacion: d.identificacion ?? null, categoria: d.categoria, esRetenedor: d.esRetenedor, estado: d.estado },
  );
  res.status(201).json(creado);
});

router.put('/:id', async (req, res) => {
  const idCliente = idDeRuta(req);
  const d = validar(datosCliente, req.body);
  const actualizado = await uno(
    `UPDATE dbo.Cliente SET nombre = @nombre, telefono = @telefono, direccion = @direccion, identificacion = @identificacion,
            categoria = @categoria, esRetenedor = @esRetenedor, estado = @estado
     OUTPUT inserted.*, deleted.categoria AS categoriaAnterior, deleted.esRetenedor AS retenedorAnterior
     WHERE idCliente = @idCliente`,
    { idCliente, nombre: d.nombre, telefono: d.telefono ?? null, direccion: d.direccion ?? null, identificacion: d.identificacion ?? null, categoria: d.categoria, esRetenedor: d.esRetenedor, estado: d.estado },
  );
  if (!actualizado) throw new ErrorApp(404, 'El cliente no existe.');

  // La categoría decide el precio (mayorista) y la retención reduce lo que se cobra:
  // esos dos cambios dejan rastro y se le avisan al Dueño.
  const { categoriaAnterior, retenedorAnterior, ...cliente } = actualizado;
  const cambios = [];
  if (categoriaAnterior !== cliente.categoria) cambios.push(`tipo: ${NOMBRE_CATEGORIA[categoriaAnterior]} → ${NOMBRE_CATEGORIA[cliente.categoria]}`);
  if (Boolean(retenedorAnterior) !== Boolean(cliente.esRetenedor)) cambios.push(cliente.esRetenedor ? 'ahora retiene IR' : 'ya no retiene IR');
  if (cambios.length) {
    await registrarBitacora({ usuario: req.usuario, accion: 'CLIENTE_EDITADO', detalle: `${cliente.nombre} (${cambios.join(', ')})` });
    await notificar({ tipo: 'VENTA', nivel: 'INFO', titulo: `Cambio de condiciones de un cliente`, mensaje: `${req.usuario.nombre} modificó a "${cliente.nombre}": ${cambios.join(', ')}. Esto cambia el precio o lo que se le cobra.`, roles: ['ADMIN'], enlace: '/clientes' });
  }
  res.json(cliente);
});

export default router;
