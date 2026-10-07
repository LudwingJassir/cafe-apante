import { q } from '../db/conexion.js';

const TODOS = ['ADMIN', 'VENTAS', 'PRODUCCION'];

/**
 * Registra una notificación para los roles indicados.
 * Con `clave`, la misma notificación no se repite (recordatorios periódicos).
 */
export async function notificar({ tipo, nivel = 'INFO', titulo, mensaje, roles = TODOS, enlace = null, clave = null }, tx = null) {
  await q(
    `IF @clave IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.Notificacion WHERE clave = @clave)
       INSERT INTO dbo.Notificacion (tipo, nivel, titulo, mensaje, roles, enlace, clave)
       VALUES (@tipo, @nivel, @titulo, @mensaje, @roles, @enlace, @clave)`,
    { tipo, nivel, titulo: titulo.slice(0, 120), mensaje: mensaje.slice(0, 400), roles: roles.join(','), enlace, clave },
    tx,
  );
}

export async function registrarBitacora({ usuario = null, accion, detalle = null }, tx = null) {
  await q(
    'INSERT INTO dbo.Bitacora (idUsuario, usuario, accion, detalle) VALUES (@idUsuario, @nombre, @accion, @detalle)',
    { idUsuario: usuario?.idUsuario ?? null, nombre: usuario?.nombre ?? null, accion, detalle: detalle?.slice(0, 400) ?? null },
    tx,
  );
}
