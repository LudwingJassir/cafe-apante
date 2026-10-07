import { Router } from 'express';
import { z } from 'zod';
import { redondear } from '../../shared/calculos.js';
import { q, transaccion, uno } from '../db/conexion.js';
import { moverStock } from '../servicios/inventario.js';
import { notificar } from '../servicios/notificaciones.js';
import { ErrorApp, fechaISO, id, libras, numero, texto, textoOpcional, validar } from '../util.js';

const router = Router();

router.get('/movimientos', async (req, res) => {
  const filtros = validar(
    z.object({
      idProducto: id.optional(),
      tipo: z.enum(['ENTRADA', 'MERMA', 'AJUSTE', 'VENTA', 'ANULACION']).optional(),
      desde: fechaISO.optional(),
      hasta: fechaISO.optional(),
    }),
    req.query,
  );
  res.json(
    await q(
      `SELECT TOP 300 m.idMovimiento, m.fecha, m.tipo, m.cantidadLibras, m.stockResultante, m.motivo, m.lote, m.idVenta,
              p.nombre AS producto, u.nombre AS usuario
       FROM dbo.MovimientoInventario m
       JOIN dbo.Producto p ON p.idProducto = m.idProducto
       JOIN dbo.Usuario u ON u.idUsuario = m.idUsuario
       WHERE (@idProducto IS NULL OR m.idProducto = @idProducto)
         AND (@tipo IS NULL OR m.tipo = @tipo)
         AND (@desde IS NULL OR m.fecha >= @desde)
         AND (@hasta IS NULL OR m.fecha < DATEADD(DAY, 1, CAST(@hasta AS DATE)))
       ORDER BY m.fecha DESC, m.idMovimiento DESC`,
      { idProducto: filtros.idProducto ?? null, tipo: filtros.tipo ?? null, desde: filtros.desde ?? null, hasta: filtros.hasta ?? null },
    ),
  );
});

router.post('/entrada', async (req, res) => {
  const datos = validar(z.object({ idProducto: id, cantidadLibras: libras, lote: textoOpcional(40), motivo: textoOpcional(200) }), req.body);
  const stock = await transaccion(async (tx) => {
    const nuevo = await moverStock(tx, { idProducto: datos.idProducto, delta: redondear(datos.cantidadLibras, 3), tipo: 'ENTRADA', idUsuario: req.usuario.idUsuario, motivo: datos.motivo ?? 'Entrada de café procesado', lote: datos.lote ?? null });
    const { nombre } = await uno('SELECT nombre FROM dbo.Producto WHERE idProducto = @id', { id: datos.idProducto }, tx);
    await notificar({ tipo: 'STOCK', nivel: 'INFO', titulo: `Entrada de café: ${nombre}`, mensaje: `${req.usuario.nombre} registró ${redondear(datos.cantidadLibras, 2)} lb${datos.lote ? ` (lote ${datos.lote})` : ''}. Stock actual: ${redondear(nuevo, 1)} lb.`, roles: ['ADMIN'], enlace: '/inventario' }, tx);
    return nuevo;
  });
  res.status(201).json({ stockActual: stock });
});

router.post('/merma', async (req, res) => {
  const datos = validar(z.object({ idProducto: id, cantidadLibras: libras, motivo: texto(200, 3) }), req.body);
  const stock = await transaccion(async (tx) => {
    const nuevo = await moverStock(tx, { idProducto: datos.idProducto, delta: -redondear(datos.cantidadLibras, 3), tipo: 'MERMA', idUsuario: req.usuario.idUsuario, motivo: datos.motivo });
    const { nombre } = await uno('SELECT nombre FROM dbo.Producto WHERE idProducto = @id', { id: datos.idProducto }, tx);
    await notificar({ tipo: 'STOCK', nivel: 'ADVERTENCIA', titulo: `Merma registrada: ${nombre}`, mensaje: `${req.usuario.nombre} dio de baja ${redondear(datos.cantidadLibras, 2)} lb. Motivo: ${datos.motivo}`, roles: ['ADMIN'], enlace: '/inventario' }, tx);
    return nuevo;
  });
  res.status(201).json({ stockActual: stock });
});

// Ajuste por conteo físico: se indica lo que realmente hay y el sistema registra la diferencia.
router.post('/ajuste', async (req, res) => {
  const datos = validar(
    z.object({ idProducto: id, stockFisico: numero().pipe(z.number().min(0, 'No puede ser negativo').max(999999)), motivo: texto(200, 3) }),
    req.body,
  );
  const stock = await transaccion(async (tx) => {
    const producto = await uno('SELECT nombre, stockActual FROM dbo.Producto WITH (UPDLOCK) WHERE idProducto = @id', { id: datos.idProducto }, tx);
    if (!producto) throw new ErrorApp(404, 'El producto no existe.');
    const delta = redondear(datos.stockFisico - producto.stockActual, 3);
    if (delta === 0) throw new ErrorApp(400, 'El conteo coincide con el sistema: no hay nada que ajustar.');
    const nuevo = await moverStock(tx, { idProducto: datos.idProducto, delta, tipo: 'AJUSTE', idUsuario: req.usuario.idUsuario, motivo: datos.motivo });
    await notificar({ tipo: 'STOCK', nivel: 'ADVERTENCIA', titulo: `Ajuste de inventario: ${producto.nombre}`, mensaje: `${req.usuario.nombre} ajustó el stock de ${redondear(producto.stockActual, 2)} a ${redondear(nuevo, 2)} lb (${delta > 0 ? '+' : ''}${delta} lb). Motivo: ${datos.motivo}`, roles: ['ADMIN'], enlace: '/inventario' }, tx);
    return nuevo;
  });
  res.status(201).json({ stockActual: stock });
});

export default router;
