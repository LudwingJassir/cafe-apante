import { nivelStock, redondear } from '../../shared/calculos.js';
import { q, uno } from '../db/conexion.js';
import { ErrorApp } from '../util.js';
import { notificar } from './notificaciones.js';

const GRAVEDAD = { OK: 0, MEDIO: 1, BAJO: 2, AGOTADO: 3 };

const AVISOS = {
  AGOTADO: { nivel: 'CRITICO', titulo: (n) => `Sin existencias: ${n}`, texto: 'Ya no queda producto para vender. Registre una entrada lo antes posible.' },
  BAJO: { nivel: 'CRITICO', titulo: (n) => `Stock bajo: ${n}`, texto: 'El stock llegó al punto de reorden. Conviene procesar más café.' },
  MEDIO: { nivel: 'ADVERTENCIA', titulo: (n) => `Stock medio: ${n}`, texto: 'El stock se acerca al punto de reorden. Vaya planificando la producción.' },
};

async function avisarCambioDeNivel(tx, { nombre, stock, puntoReorden, anterior, nuevo }) {
  const detalle = `Quedan ${redondear(stock, 1)} lb (punto de reorden: ${redondear(puntoReorden, 1)} lb).`;
  if (GRAVEDAD[nuevo] > GRAVEDAD[anterior]) {
    const aviso = AVISOS[nuevo];
    await notificar({ tipo: 'STOCK', nivel: aviso.nivel, titulo: aviso.titulo(nombre), mensaje: `${aviso.texto} ${detalle}`, enlace: '/inventario' }, tx);
  } else if (nuevo === 'OK') {
    await notificar({ tipo: 'STOCK', nivel: 'EXITO', titulo: `Stock repuesto: ${nombre}`, mensaje: `El inventario volvió a un nivel saludable. ${detalle}`, enlace: '/inventario' }, tx);
  }
}

/**
 * Suma o resta libras al stock de un producto dentro de una transacción,
 * deja el movimiento en el historial y actualiza el semáforo.
 * @returns {Promise<number>} stock resultante en libras
 */
export async function moverStock(tx, { idProducto, delta, tipo, idUsuario, motivo = null, lote = null, idVenta = null }) {
  // Se convierte a DECIMAL antes de operar: con punto flotante, restar todo el
  // stock podría dar -0.0000001 y rechazar una venta válida.
  const fila = await uno(
    `DECLARE @libras DECIMAL(12,3) = @delta;
     UPDATE dbo.Producto SET stockActual = stockActual + @libras
     OUTPUT inserted.stockActual AS stock, inserted.puntoReorden, inserted.nombre, deleted.estadoSemaforo AS anterior
     WHERE idProducto = @idProducto AND stockActual + @libras >= 0`,
    { idProducto, delta },
    tx,
  );
  if (!fila) {
    const producto = await uno('SELECT nombre, stockActual FROM dbo.Producto WHERE idProducto = @idProducto', { idProducto }, tx);
    if (!producto) throw new ErrorApp(404, 'El producto no existe.');
    throw new ErrorApp(409, `No hay suficiente "${producto.nombre}". Solo quedan ${redondear(producto.stockActual, 2)} lb.`);
  }

  await q(
    `INSERT INTO dbo.MovimientoInventario (idProducto, idUsuario, tipo, cantidadLibras, stockResultante, motivo, lote, idVenta)
     VALUES (@idProducto, @idUsuario, @tipo, @delta, @stock, @motivo, @lote, @idVenta)`,
    { idProducto, idUsuario, tipo, delta, stock: fila.stock, motivo, lote, idVenta },
    tx,
  );

  await actualizarSemaforo(tx, { idProducto, nombre: fila.nombre, stock: fila.stock, puntoReorden: fila.puntoReorden, anterior: fila.anterior });
  return fila.stock;
}

/** Recalcula el semáforo de un producto y notifica si cambió de nivel. */
export async function actualizarSemaforo(tx, { idProducto, nombre, stock, puntoReorden, anterior }) {
  const { factorStockMedio } = await uno('SELECT factorStockMedio FROM dbo.ConfiguracionNegocio WHERE idConfig = 1', {}, tx);
  const nuevo = nivelStock(stock, puntoReorden, factorStockMedio);
  if (nuevo === anterior) return nuevo;
  await q('UPDATE dbo.Producto SET estadoSemaforo = @nuevo WHERE idProducto = @idProducto', { nuevo, idProducto }, tx);
  await avisarCambioDeNivel(tx, { nombre, stock, puntoReorden, anterior, nuevo });
  return nuevo;
}
