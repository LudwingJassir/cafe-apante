import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { autenticar, COOKIE_SESION, firmarSesion, opcionesCookie } from '../auth.js';
import { MAX_INTENTOS_LOGIN, MINUTOS_BLOQUEO } from '../config.js';
import { q, uno } from '../db/conexion.js';
import { notificar, registrarBitacora } from '../servicios/notificaciones.js';
import { ErrorApp, texto, validar } from '../util.js';

const router = Router();

// Hash de relleno: si el usuario no existe se compara igual, para que el tiempo
// de respuesta no revele qué nombres de usuario son válidos.
const HASH_RELLENO = bcrypt.hashSync('sin-usuario', 10);

const VENTANA_MS = 10 * 60 * 1000;
const MAX_POR_ORIGEN = 30;

// Freno general por dispositivo: nadie en la red puede probar contraseñas sin parar.
const intentosPorOrigen = new Map();
// Fallos por usuario Y dispositivo: quien se equivoca se bloquea a sí mismo,
// sin dejar fuera al dueño que entra desde otro equipo.
const fallosPorUsuarioYOrigen = new Map();

function frenarOrigen(req) {
  const ahora = Date.now();
  const registro = intentosPorOrigen.get(req.ip);
  if (!registro || ahora - registro.inicio > VENTANA_MS) {
    intentosPorOrigen.set(req.ip, { inicio: ahora, cuenta: 1 });
    return;
  }
  registro.cuenta += 1;
  if (registro.cuenta > MAX_POR_ORIGEN) throw new ErrorApp(429, 'Demasiados intentos. Espere unos minutos e intente de nuevo.');
}

setInterval(() => {
  const limite = Date.now() - VENTANA_MS;
  for (const [origen, registro] of intentosPorOrigen) if (registro.inicio < limite) intentosPorOrigen.delete(origen);
  for (const [clave, registro] of fallosPorUsuarioYOrigen) if (Math.max(registro.visto, registro.hasta) < limite) fallosPorUsuarioYOrigen.delete(clave);
}, VENTANA_MS).unref();

export const contrasenaNueva = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  // bcrypt solo usa los primeros 72 bytes: se mide en bytes para que las tildes no la recorten en silencio.
  .refine((c) => Buffer.byteLength(c, 'utf8') <= 72, 'La contraseña es demasiado larga')
  .refine((c) => /[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(c) && /\d/.test(c), 'La contraseña debe incluir letras y números');

/** Una contraseña que contiene el nombre de usuario es lo primero que alguien probaría. */
export function exigirContrasenaNoObvia(contrasena, nombreUsuario) {
  if (contrasena.toLowerCase().includes(String(nombreUsuario).toLowerCase())) {
    throw new ErrorApp(400, 'La contraseña no debe contener el nombre de usuario.');
  }
}

function datosPublicos(u) {
  return { idUsuario: u.idUsuario, nombre: u.nombre, usuario: u.usuario, correo: u.correo, rol: u.rol, debeCambiarContrasena: Boolean(u.debeCambiarContrasena) };
}

router.post('/login', async (req, res) => {
  frenarOrigen(req);
  const { usuario, contrasena } = validar(z.object({ usuario: texto(40), contrasena: z.string().min(1).max(200) }), req.body);

  const clave = `${usuario.toLowerCase()}|${req.ip}`;
  const bloqueo = fallosPorUsuarioYOrigen.get(clave);
  if (bloqueo?.hasta > Date.now()) {
    throw new ErrorApp(429, `Demasiados intentos fallidos. Espere ${Math.ceil((bloqueo.hasta - Date.now()) / 60000)} minuto(s) e intente de nuevo.`);
  }

  const fila = await uno(
    'SELECT idUsuario, nombre, usuario, correo, contrasena, rol, estado, debeCambiarContrasena, versionSesion FROM dbo.Usuario WHERE usuario = @usuario',
    { usuario },
  );
  const coincide = await bcrypt.compare(contrasena, fila?.contrasena ?? HASH_RELLENO);

  if (!fila || !coincide || fila.estado !== 'ACTIVO') {
    // Se vuelve a leer el contador aquí, sin ningún await en medio: varias peticiones
    // simultáneas no pueden contarse como un solo fallo.
    const cuenta = (fallosPorUsuarioYOrigen.get(clave)?.cuenta ?? 0) + 1;
    const ahora = Date.now();
    if (cuenta >= MAX_INTENTOS_LOGIN) {
      fallosPorUsuarioYOrigen.set(clave, { cuenta: 0, hasta: ahora + MINUTOS_BLOQUEO * 60000, visto: ahora });
      await registrarBitacora({ usuario: fila, accion: 'LOGIN_BLOQUEADO', detalle: `${MAX_INTENTOS_LOGIN} contraseñas incorrectas para "${usuario}" desde ${req.ip}` });
      await notificar({
        tipo: 'USUARIOS',
        nivel: 'ADVERTENCIA',
        titulo: 'Intentos fallidos de acceso',
        mensaje: `Alguien falló ${MAX_INTENTOS_LOGIN} veces la contraseña del usuario "${usuario}" desde el dispositivo ${req.ip}. Ese dispositivo quedó bloqueado ${MINUTOS_BLOQUEO} minutos para ese usuario.`,
        roles: ['ADMIN'],
        enlace: '/usuarios',
      });
    } else {
      fallosPorUsuarioYOrigen.set(clave, { cuenta, hasta: 0, visto: ahora });
    }
    throw new ErrorApp(401, 'Usuario o contraseña incorrectos.');
  }

  fallosPorUsuarioYOrigen.delete(clave);
  await q('UPDATE dbo.Usuario SET ultimoAcceso = SYSDATETIME() WHERE idUsuario = @id', { id: fila.idUsuario });
  await registrarBitacora({ usuario: fila, accion: 'LOGIN', detalle: 'Inicio de sesión' });
  res.cookie(COOKIE_SESION, firmarSesion(fila), opcionesCookie());
  res.json(datosPublicos(fila));
});

router.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE_SESION, opcionesCookie());
  res.json({ ok: true });
});

router.get('/yo', autenticar, (req, res) => {
  res.json(datosPublicos(req.usuario));
});

router.post('/cambiar-contrasena', autenticar, async (req, res) => {
  const { actual, nueva } = validar(z.object({ actual: z.string().min(1).max(200), nueva: contrasenaNueva }), req.body);
  const { contrasena } = await uno('SELECT contrasena FROM dbo.Usuario WHERE idUsuario = @id', { id: req.usuario.idUsuario });
  if (!(await bcrypt.compare(actual, contrasena))) throw new ErrorApp(400, 'La contraseña actual no es correcta.');
  if (actual === nueva) throw new ErrorApp(400, 'La contraseña nueva debe ser distinta de la actual.');
  exigirContrasenaNoObvia(nueva, req.usuario.usuario);

  // Subir la versión cierra cualquier otra sesión abierta con la contraseña anterior.
  const { versionSesion } = await uno(
    `UPDATE dbo.Usuario SET contrasena = @hash, debeCambiarContrasena = 0, versionSesion = versionSesion + 1
     OUTPUT inserted.versionSesion WHERE idUsuario = @id`,
    { id: req.usuario.idUsuario, hash: await bcrypt.hash(nueva, 10) },
  );
  await registrarBitacora({ usuario: req.usuario, accion: 'CAMBIO_CONTRASENA', detalle: 'Cambió su contraseña' });
  res.cookie(COOKIE_SESION, firmarSesion({ idUsuario: req.usuario.idUsuario, versionSesion }), opcionesCookie());
  res.json({ ok: true });
});

export default router;
