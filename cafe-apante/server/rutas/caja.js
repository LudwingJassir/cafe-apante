import { Router } from 'express';
import { z } from 'zod';
import { calcularArqueo } from '../../shared/calculos.js';
import { q, transaccion, uno } from '../db/conexion.js';
import { notificar, registrarBitacora } from '../servicios/notificaciones.js';
import { dinero, ErrorApp, moneda, textoOpcional, validar } from '../util.js';

const router = Router();

export async function sesionAbierta(tx = null) {
  return uno(
    `SELECT s.idSesion, s.fechaApertura, s.montoInicial, u.nombre AS abiertaPor
     FROM dbo.SesionCaja s JOIN dbo.Usuario u ON u.idUsuario = s.idUsuarioApertura
     WHERE s.estado = 'ABIERTA'`,
    {},
    tx,
  );
}

/**
 * Totales de la sesión. Las ventas anuladas de esta misma caja no cuentan (el dinero
 * se devolvió). Las devoluciones por ventas en efectivo de cajas anteriores sí salen
 * de esta gaveta y se restan aparte.
 */
async function movimientosDeSesion(idSesion, tx = null) {
  return uno(
    `SELECT COUNT(CASE WHEN estado = 'COMPLETADA' THEN 1 END) AS ventas,
            COUNT(CASE WHEN estado = 'ANULADA' THEN 1 END) AS anuladas,
            ISNULL(SUM(CASE WHEN estado = 'COMPLETADA' THEN totalCobrar END), 0) AS totalVentas,
            ISNULL(SUM(CASE WHEN estado = 'COMPLETADA' AND metodoPago = 'EFECTIVO' AND monedaPago = 'NIO' THEN totalCobrar END), 0) AS efectivoNIO,
            ISNULL(SUM(CASE WHEN estado = 'COMPLETADA' AND metodoPago = 'EFECTIVO' AND monedaPago = 'USD' THEN montoRecibido END), 0) AS recibidoUSD,
            ISNULL(SUM(CASE WHEN estado = 'COMPLETADA' AND metodoPago = 'EFECTIVO' AND monedaPago = 'USD' THEN vuelto END), 0) AS vueltoPorUSD,
            ISNULL(SUM(CASE WHEN estado = 'COMPLETADA' AND metodoPago = 'DEPOSITO' THEN totalCobrar END), 0) AS totalDepositos,
            (SELECT ISNULL(SUM(d.totalCobrar), 0) FROM dbo.Venta d
              WHERE d.idSesionAnulacion = @idSesion AND d.idSesionCaja <> @idSesion AND d.metodoPago = 'EFECTIVO') AS devolucionesNIO
     FROM dbo.Venta WHERE idSesionCaja = @idSesion`,
    { idSesion },
    tx,
  );
}

router.get('/actual', async (_req, res) => {
  const sesion = await sesionAbierta();
  if (!sesion) return res.json({ sesion: null });
  const resumen = await movimientosDeSesion(sesion.idSesion);
  res.json({ sesion, resumen, arqueo: calcularArqueo({ montoInicial: sesion.montoInicial, ...resumen }) });
});

router.post('/abrir', async (req, res) => {
  const { montoInicial } = validar(z.object({ montoInicial: dinero }), req.body);
  try {
    await q('INSERT INTO dbo.SesionCaja (idUsuarioApertura, montoInicial) VALUES (@idUsuario, @montoInicial)', { idUsuario: req.usuario.idUsuario, montoInicial });
  } catch (error) {
    // El índice único impide dos cajas abiertas aunque dos personas pulsen a la vez.
    if (/UX_SesionCaja_Abierta/.test(error.message)) throw new ErrorApp(409, 'Ya hay una caja abierta. Ciérrela antes de abrir otra.');
    throw error;
  }
  await registrarBitacora({ usuario: req.usuario, accion: 'CAJA_ABIERTA', detalle: `Fondo inicial ${moneda(montoInicial)}` });
  await notificar({ tipo: 'CAJA', nivel: 'INFO', titulo: 'Caja abierta', mensaje: `${req.usuario.nombre} abrió la caja con un fondo de ${moneda(montoInicial)}.`, roles: ['ADMIN'], enlace: '/arqueo' });
  res.status(201).json({ sesion: await sesionAbierta() });
});

router.post('/cerrar', async (req, res) => {
  const datos = validar(z.object({ contadoNIO: dinero, contadoUSD: dinero.default(0), observacion: textoOpcional(300) }), req.body);
  const cierre = await transaccion(async (tx) => {
    const sesion = await uno("SELECT idSesion, montoInicial FROM dbo.SesionCaja WITH (UPDLOCK) WHERE estado = 'ABIERTA'", {}, tx);
    if (!sesion) throw new ErrorApp(409, 'No hay ninguna caja abierta.');
    const resumen = await movimientosDeSesion(sesion.idSesion, tx);
    const arqueo = calcularArqueo({ montoInicial: sesion.montoInicial, ...resumen, contadoNIO: datos.contadoNIO, contadoUSD: datos.contadoUSD });
    await q(
      `UPDATE dbo.SesionCaja SET estado = 'CERRADA', idUsuarioCierre = @idUsuario, fechaCierre = SYSDATETIME(),
              esperadoNIO = @esperadoNIO, esperadoUSD = @esperadoUSD, contadoNIO = @contadoNIO, contadoUSD = @contadoUSD,
              diferenciaNIO = @diferenciaNIO, diferenciaUSD = @diferenciaUSD,
              totalVentas = @totalVentas, totalDepositos = @totalDepositos, observacion = @observacion
       WHERE idSesion = @idSesion`,
      {
        idSesion: sesion.idSesion, idUsuario: req.usuario.idUsuario, ...arqueo,
        contadoNIO: datos.contadoNIO, contadoUSD: datos.contadoUSD,
        totalVentas: resumen.totalVentas, totalDepositos: resumen.totalDepositos, observacion: datos.observacion ?? null,
      },
      tx,
    );
    const cuadra = arqueo.diferenciaNIO === 0 && arqueo.diferenciaUSD === 0;
    const diferencias = [
      arqueo.diferenciaNIO !== 0 ? `${arqueo.diferenciaNIO > 0 ? 'sobran' : 'faltan'} ${moneda(Math.abs(arqueo.diferenciaNIO))}` : null,
      arqueo.diferenciaUSD !== 0 ? `${arqueo.diferenciaUSD > 0 ? 'sobran' : 'faltan'} US$ ${Math.abs(arqueo.diferenciaUSD).toFixed(2)}` : null,
    ].filter(Boolean);
    await notificar(
      {
        tipo: 'CAJA',
        nivel: cuadra ? 'EXITO' : 'ADVERTENCIA',
        titulo: cuadra ? 'Caja cerrada: todo cuadra' : 'Caja cerrada con diferencia',
        mensaje: `${req.usuario.nombre} cerró la caja con ${resumen.ventas} venta(s) por ${moneda(resumen.totalVentas)}.${cuadra ? '' : ` En el conteo ${diferencias.join(' y ')}.`}`,
        roles: ['ADMIN'],
        enlace: '/arqueo',
      },
      tx,
    );
    await registrarBitacora({ usuario: req.usuario, accion: 'CAJA_CERRADA', detalle: cuadra ? 'Sin diferencias' : `Diferencia: ${diferencias.join(' y ')}` }, tx);
    return { idSesion: sesion.idSesion, resumen, arqueo };
  });
  res.json(cierre);
});

router.get('/sesiones', async (_req, res) => {
  res.json(
    await q(
      `SELECT TOP 90 s.idSesion, s.fechaApertura, s.fechaCierre, s.montoInicial, s.esperadoNIO, s.esperadoUSD,
              s.contadoNIO, s.contadoUSD, s.diferenciaNIO, s.diferenciaUSD, s.totalVentas, s.totalDepositos, s.observacion,
              a.nombre AS abiertaPor, c.nombre AS cerradaPor
       FROM dbo.SesionCaja s
       JOIN dbo.Usuario a ON a.idUsuario = s.idUsuarioApertura
       LEFT JOIN dbo.Usuario c ON c.idUsuario = s.idUsuarioCierre
       WHERE s.estado = 'CERRADA'
       ORDER BY s.fechaCierre DESC`,
    ),
  );
});

export default router;
