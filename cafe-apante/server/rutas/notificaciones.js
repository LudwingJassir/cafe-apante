import { Router } from 'express';
import { z } from 'zod';
import { q, uno } from '../db/conexion.js';
import { idDeRuta, validar } from '../util.js';

const router = Router();

// Cada rol ve solo sus notificaciones, y solo las de los últimos 90 días.
const VISIBLES = `CHARINDEX(',' + @rol + ',', ',' + n.roles + ',') > 0 AND n.fecha >= DATEADD(DAY, -90, SYSDATETIME())`;

router.get('/', async (req, res) => {
  const filtros = validar(
    z.object({ soloNoLeidas: z.string().optional(), tipo: z.string().max(20).optional(), limite: z.coerce.number().int().min(1).max(300).default(150) }),
    req.query,
  );
  res.json(
    await q(
      `SELECT TOP (@limite) n.idNotificacion, n.tipo, n.nivel, n.titulo, n.mensaje, n.enlace, n.fecha,
              CASE WHEN l.idUsuario IS NULL THEN 0 ELSE 1 END AS leida
       FROM dbo.Notificacion n
       LEFT JOIN dbo.NotificacionLeida l ON l.idNotificacion = n.idNotificacion AND l.idUsuario = @idUsuario
       WHERE ${VISIBLES}
         AND (@tipo IS NULL OR n.tipo = @tipo)
         AND (@soloNoLeidas = 0 OR l.idUsuario IS NULL)
       ORDER BY n.fecha DESC, n.idNotificacion DESC`,
      { rol: req.usuario.rol, idUsuario: req.usuario.idUsuario, tipo: filtros.tipo || null, soloNoLeidas: filtros.soloNoLeidas === '1' ? 1 : 0, limite: filtros.limite },
    ),
  );
});

router.get('/conteo', async (req, res) => {
  res.json(
    await uno(
      `SELECT COUNT(*) AS sinLeer, COUNT(CASE WHEN n.nivel = 'CRITICO' THEN 1 END) AS criticas
       FROM dbo.Notificacion n
       WHERE ${VISIBLES}
         AND NOT EXISTS (SELECT 1 FROM dbo.NotificacionLeida l WHERE l.idNotificacion = n.idNotificacion AND l.idUsuario = @idUsuario)`,
      { rol: req.usuario.rol, idUsuario: req.usuario.idUsuario },
    ),
  );
});

router.post('/leer-todas', async (req, res) => {
  await q(
    `INSERT INTO dbo.NotificacionLeida (idNotificacion, idUsuario)
     SELECT n.idNotificacion, @idUsuario FROM dbo.Notificacion n
     WHERE ${VISIBLES}
       AND NOT EXISTS (SELECT 1 FROM dbo.NotificacionLeida l WHERE l.idNotificacion = n.idNotificacion AND l.idUsuario = @idUsuario)`,
    { rol: req.usuario.rol, idUsuario: req.usuario.idUsuario },
  );
  res.json({ ok: true });
});

router.post('/:id/leer', async (req, res) => {
  // Solo se marca si la notificación realmente le corresponde a este rol.
  await q(
    `INSERT INTO dbo.NotificacionLeida (idNotificacion, idUsuario)
     SELECT n.idNotificacion, @idUsuario FROM dbo.Notificacion n
     WHERE n.idNotificacion = @id AND ${VISIBLES}
       AND NOT EXISTS (SELECT 1 FROM dbo.NotificacionLeida l WHERE l.idNotificacion = n.idNotificacion AND l.idUsuario = @idUsuario)`,
    { id: idDeRuta(req), rol: req.usuario.rol, idUsuario: req.usuario.idUsuario },
  );
  res.json({ ok: true });
});

export default router;
