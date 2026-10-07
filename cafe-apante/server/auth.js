import jwt from 'jsonwebtoken';
import { HORAS_SESION, SECRETO_SESION } from './config.js';
import { uno } from './db/conexion.js';
import { ErrorApp } from './util.js';

export const COOKIE_SESION = 'sesion_apante';
export const ROLES = ['ADMIN', 'VENTAS', 'PRODUCCION'];

/** `v` es la versión de sesión del usuario: al cambiar la contraseña sube y las sesiones viejas dejan de valer. */
export function firmarSesion(usuario) {
  return jwt.sign({ id: usuario.idUsuario, v: usuario.versionSesion }, SECRETO_SESION, { expiresIn: `${HORAS_SESION}h`, algorithm: 'HS256' });
}

export function opcionesCookie() {
  // Cookie de sesión (sin fecha de vencimiento): se borra al cerrar el navegador, porque la laptop es compartida.
  // Sin `secure`: el sistema corre por HTTP dentro de la red local del negocio.
  return { httpOnly: true, sameSite: 'strict', path: '/' };
}

/** Exige sesión válida y vuelve a leer al usuario para que una desactivación surta efecto de inmediato. */
export async function autenticar(req, _res, next) {
  const token = req.cookies?.[COOKIE_SESION];
  if (!token) throw new ErrorApp(401, 'Inicie sesión para continuar.');
  let datos;
  try {
    datos = jwt.verify(token, SECRETO_SESION, { algorithms: ['HS256'] });
  } catch {
    throw new ErrorApp(401, 'Su sesión venció. Inicie sesión de nuevo.');
  }
  const usuario = await uno(
    `SELECT idUsuario, nombre, usuario, correo, rol, estado, debeCambiarContrasena, versionSesion
     FROM dbo.Usuario WHERE idUsuario = @id`,
    { id: datos.id },
  );
  if (!usuario || usuario.estado !== 'ACTIVO') throw new ErrorApp(401, 'Su usuario está desactivado.');
  if (datos.v !== usuario.versionSesion) throw new ErrorApp(401, 'Su sesión venció. Inicie sesión de nuevo.');
  req.usuario = usuario;
  next();
}

/** Restringe una ruta a los roles indicados (RBAC). */
export function permitir(...roles) {
  return (req, _res, next) => {
    if (!roles.includes(req.usuario.rol)) throw new ErrorApp(403, 'Su usuario no tiene permiso para esta acción.');
    next();
  };
}

/**
 * Defensa contra peticiones forjadas desde otros sitios: toda escritura debe traer
 * un encabezado propio, que un formulario ajeno no puede enviar. Depende de que el
 * servidor NO habilite CORS para otros orígenes.
 */
export function exigirEncabezadoPropio(req, _res, next) {
  const esLectura = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  if (!esLectura && req.get('X-Requested-With') !== 'cafe-apante') {
    throw new ErrorApp(403, 'Petición no permitida.');
  }
  next();
}
