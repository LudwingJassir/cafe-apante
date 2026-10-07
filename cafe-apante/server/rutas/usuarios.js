import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { ROLES } from '../auth.js';
import { q, uno } from '../db/conexion.js';
import { notificar, registrarBitacora } from '../servicios/notificaciones.js';
import { ErrorApp, idDeRuta, texto, validar } from '../util.js';
import { contrasenaNueva, exigirContrasenaNoObvia } from './auth.js';

const router = Router();

const NOMBRE_ROL = { ADMIN: 'Dueño / Administrador', VENTAS: 'Gerente de Ventas', PRODUCCION: 'Responsable de Producción' };
const CAMPOS = 'idUsuario, nombre, usuario, correo, rol, estado, debeCambiarContrasena, ultimoAcceso, creadoEn';

const datosUsuario = z.object({
  nombre: texto(100),
  correo: z.preprocess((v) => (v === '' ? null : v), z.email('Correo inválido').max(120).nullish()),
  rol: z.enum(ROLES),
});

router.get('/', async (_req, res) => {
  res.json(await q(`SELECT ${CAMPOS} FROM dbo.Usuario ORDER BY estado, nombre`));
});

router.get('/bitacora', async (_req, res) => {
  res.json(await q('SELECT TOP 150 idBitacora, fecha, usuario, accion, detalle FROM dbo.Bitacora ORDER BY fecha DESC, idBitacora DESC'));
});

router.post('/', async (req, res) => {
  const datos = validar(
    datosUsuario.extend({
      usuario: texto(40, 3).regex(/^[a-zA-Z0-9._-]+$/, 'Use solo letras, números, punto o guion (sin espacios)'),
      contrasena: contrasenaNueva,
    }),
    req.body,
  );
  if (await uno('SELECT 1 AS existe FROM dbo.Usuario WHERE usuario = @usuario', { usuario: datos.usuario })) {
    throw new ErrorApp(409, `Ya existe un usuario llamado "${datos.usuario}".`);
  }
  exigirContrasenaNoObvia(datos.contrasena, datos.usuario);
  const creado = await uno(
    `INSERT INTO dbo.Usuario (nombre, usuario, correo, contrasena, rol, debeCambiarContrasena)
     OUTPUT inserted.idUsuario
     VALUES (@nombre, @usuario, @correo, @hash, @rol, 1)`,
    { nombre: datos.nombre, usuario: datos.usuario.toLowerCase(), correo: datos.correo ?? null, hash: await bcrypt.hash(datos.contrasena, 10), rol: datos.rol },
  );
  await registrarBitacora({ usuario: req.usuario, accion: 'USUARIO_CREADO', detalle: `${datos.nombre} (${NOMBRE_ROL[datos.rol]})` });
  await notificar({ tipo: 'USUARIOS', nivel: 'INFO', titulo: 'Nuevo usuario creado', mensaje: `${req.usuario.nombre} creó el usuario "${datos.nombre}" con el rol ${NOMBRE_ROL[datos.rol]}.`, roles: ['ADMIN'], enlace: '/usuarios' });
  res.status(201).json(await uno(`SELECT ${CAMPOS} FROM dbo.Usuario WHERE idUsuario = @id`, { id: creado.idUsuario }));
});

router.put('/:id', async (req, res) => {
  const id = idDeRuta(req);
  const datos = validar(datosUsuario.extend({ estado: z.enum(['ACTIVO', 'INACTIVO']) }), req.body);
  const actual = await uno('SELECT idUsuario, nombre, rol, estado FROM dbo.Usuario WHERE idUsuario = @id', { id });
  if (!actual) throw new ErrorApp(404, 'El usuario no existe.');

  const esElMismo = id === req.usuario.idUsuario;
  if (esElMismo && (datos.rol !== 'ADMIN' || datos.estado !== 'ACTIVO')) {
    throw new ErrorApp(400, 'No puede quitarse a sí mismo el rol de administrador ni desactivarse.');
  }
  const dejaDeSerAdmin = actual.rol === 'ADMIN' && actual.estado === 'ACTIVO' && (datos.rol !== 'ADMIN' || datos.estado !== 'ACTIVO');
  if (dejaDeSerAdmin) {
    const { otros } = await uno("SELECT COUNT(*) AS otros FROM dbo.Usuario WHERE rol = 'ADMIN' AND estado = 'ACTIVO' AND idUsuario <> @id", { id });
    if (otros === 0) throw new ErrorApp(400, 'Debe quedar al menos un administrador activo.');
  }

  await q('UPDATE dbo.Usuario SET nombre = @nombre, correo = @correo, rol = @rol, estado = @estado WHERE idUsuario = @id', { id, nombre: datos.nombre, correo: datos.correo ?? null, rol: datos.rol, estado: datos.estado });
  const cambios = [];
  if (actual.rol !== datos.rol) cambios.push(`rol: ${NOMBRE_ROL[actual.rol]} → ${NOMBRE_ROL[datos.rol]}`);
  if (actual.estado !== datos.estado) cambios.push(datos.estado === 'ACTIVO' ? 'reactivado' : 'desactivado');
  await registrarBitacora({ usuario: req.usuario, accion: 'USUARIO_EDITADO', detalle: `${datos.nombre}${cambios.length ? ` (${cambios.join(', ')})` : ''}` });
  if (cambios.length) {
    await notificar({ tipo: 'USUARIOS', nivel: 'INFO', titulo: 'Cambio de permisos de usuario', mensaje: `${req.usuario.nombre} modificó a "${datos.nombre}": ${cambios.join(', ')}.`, roles: ['ADMIN'], enlace: '/usuarios' });
  }
  res.json(await uno(`SELECT ${CAMPOS} FROM dbo.Usuario WHERE idUsuario = @id`, { id }));
});

router.post('/:id/restablecer', async (req, res) => {
  const id = idDeRuta(req);
  const { contrasena } = validar(z.object({ contrasena: contrasenaNueva }), req.body);
  const usuario = await uno('SELECT nombre, usuario FROM dbo.Usuario WHERE idUsuario = @id', { id });
  if (!usuario) throw new ErrorApp(404, 'El usuario no existe.');
  exigirContrasenaNoObvia(contrasena, usuario.usuario);
  // Subir la versión cierra las sesiones que esa persona tuviera abiertas con la contraseña anterior.
  await q(
    `UPDATE dbo.Usuario SET contrasena = @hash, debeCambiarContrasena = 1, versionSesion = versionSesion + 1
     WHERE idUsuario = @id`,
    { id, hash: await bcrypt.hash(contrasena, 10) },
  );
  await registrarBitacora({ usuario: req.usuario, accion: 'CONTRASENA_RESTABLECIDA', detalle: usuario.nombre });
  res.json({ ok: true });
});

export default router;
