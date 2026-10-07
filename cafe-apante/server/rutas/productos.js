import { Router } from 'express';
import { z } from 'zod';
import { permitir } from '../auth.js';
import { q, transaccion, uno } from '../db/conexion.js';
import { actualizarSemaforo } from '../servicios/inventario.js';
import { registrarBitacora } from '../servicios/notificaciones.js';
import { dinero, ErrorApp, id, idDeRuta, numero, texto, textoOpcional, validar } from '../util.js';

const router = Router();

const presentacion = z.object({
  idPresentacion: id.nullish(),
  nombre: texto(40),
  pesoLibras: numero().pipe(z.number().positive('El peso debe ser mayor que cero').max(1000)),
  precio: dinero,
  precioMayorista: dinero,
});

const datosProducto = z.object({
  nombre: texto(100),
  tipo: z.enum(['MOLIDO', 'GRANO']),
  descripcion: textoOpcional(200),
  puntoReorden: numero().pipe(z.number().min(0, 'No puede ser negativo').max(999999)),
  aplicaIVA: z.boolean(),
  estado: z.enum(['ACTIVO', 'INACTIVO']).default('ACTIVO'),
  presentaciones: z.array(presentacion).min(1, 'Agregue al menos una presentación de venta').max(10),
});

export async function listarProductos({ incluirInactivos = false } = {}) {
  const productos = await q(
    `SELECT idProducto, nombre, tipo, descripcion, stockActual, puntoReorden, estadoSemaforo, aplicaIVA, estado
     FROM dbo.Producto ${incluirInactivos ? '' : "WHERE estado = 'ACTIVO'"}
     ORDER BY estado, nombre`,
  );
  const presentaciones = await q(
    `SELECT idPresentacion, idProducto, nombre, pesoLibras, precio, precioMayorista
     FROM dbo.Presentacion WHERE estado = 'ACTIVO' ORDER BY pesoLibras`,
  );
  return productos.map((p) => ({ ...p, presentaciones: presentaciones.filter((pr) => pr.idProducto === p.idProducto) }));
}

router.get('/', async (req, res) => {
  const incluirInactivos = req.query.todos === '1' && req.usuario.rol === 'ADMIN';
  res.json(await listarProductos({ incluirInactivos }));
});

async function guardarPresentaciones(tx, idProducto, presentaciones) {
  const conservadas = presentaciones.filter((p) => p.idPresentacion).map((p) => p.idPresentacion);
  // Las presentaciones quitadas se desactivan: las ventas pasadas las siguen referenciando.
  const existentes = await q("SELECT idPresentacion FROM dbo.Presentacion WHERE idProducto = @idProducto AND estado = 'ACTIVO'", { idProducto }, tx);
  for (const { idPresentacion } of existentes) {
    if (!conservadas.includes(idPresentacion)) {
      await q("UPDATE dbo.Presentacion SET estado = 'INACTIVO' WHERE idPresentacion = @idPresentacion", { idPresentacion }, tx);
    }
  }
  for (const p of presentaciones) {
    const valores = { idProducto, nombre: p.nombre, peso: p.pesoLibras, precio: p.precio, mayorista: p.precioMayorista };
    if (p.idPresentacion) {
      await q(
        `UPDATE dbo.Presentacion SET nombre = @nombre, pesoLibras = @peso, precio = @precio, precioMayorista = @mayorista
         WHERE idPresentacion = @idPresentacion AND idProducto = @idProducto`,
        { ...valores, idPresentacion: p.idPresentacion },
        tx,
      );
    } else {
      await q(
        `INSERT INTO dbo.Presentacion (idProducto, nombre, pesoLibras, precio, precioMayorista)
         VALUES (@idProducto, @nombre, @peso, @precio, @mayorista)`,
        valores,
        tx,
      );
    }
  }
}

router.post('/', permitir('ADMIN'), async (req, res) => {
  const datos = validar(datosProducto, req.body);
  const idProducto = await transaccion(async (tx) => {
    const creado = await uno(
      `INSERT INTO dbo.Producto (nombre, tipo, descripcion, puntoReorden, aplicaIVA, estado)
       OUTPUT inserted.idProducto
       VALUES (@nombre, @tipo, @descripcion, @puntoReorden, @aplicaIVA, @estado)`,
      { nombre: datos.nombre, tipo: datos.tipo, descripcion: datos.descripcion ?? null, puntoReorden: datos.puntoReorden, aplicaIVA: datos.aplicaIVA, estado: datos.estado },
      tx,
    );
    await guardarPresentaciones(tx, creado.idProducto, datos.presentaciones);
    await registrarBitacora({ usuario: req.usuario, accion: 'PRODUCTO_CREADO', detalle: datos.nombre }, tx);
    return creado.idProducto;
  });
  const productos = await listarProductos({ incluirInactivos: true });
  res.status(201).json(productos.find((p) => p.idProducto === idProducto));
});

router.put('/:id', permitir('ADMIN'), async (req, res) => {
  const idProducto = idDeRuta(req);
  const datos = validar(datosProducto, req.body);
  await transaccion(async (tx) => {
    const actualizado = await uno(
      `UPDATE dbo.Producto SET nombre = @nombre, tipo = @tipo, descripcion = @descripcion,
              puntoReorden = @puntoReorden, aplicaIVA = @aplicaIVA, estado = @estado
       OUTPUT inserted.stockActual AS stock, deleted.estadoSemaforo AS anterior
       WHERE idProducto = @idProducto`,
      { idProducto, nombre: datos.nombre, tipo: datos.tipo, descripcion: datos.descripcion ?? null, puntoReorden: datos.puntoReorden, aplicaIVA: datos.aplicaIVA, estado: datos.estado },
      tx,
    );
    if (!actualizado) throw new ErrorApp(404, 'El producto no existe.');
    await guardarPresentaciones(tx, idProducto, datos.presentaciones);
    // Cambiar el punto de reorden puede mover el semáforo aunque el stock no cambie.
    await actualizarSemaforo(tx, { idProducto, nombre: datos.nombre, stock: actualizado.stock, puntoReorden: datos.puntoReorden, anterior: actualizado.anterior });
    await registrarBitacora({ usuario: req.usuario, accion: 'PRODUCTO_EDITADO', detalle: datos.nombre }, tx);
  });
  const productos = await listarProductos({ incluirInactivos: true });
  res.json(productos.find((p) => p.idProducto === idProducto));
});

export default router;
