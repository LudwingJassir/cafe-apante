import { Router } from 'express';
import { z } from 'zod';
import { q, uno } from '../db/conexion.js';
import { estimacionAnual } from '../servicios/impuestos.js';
import { registrarBitacora } from '../servicios/notificaciones.js';
import { dinero, ErrorApp, fechaISO, idDeRuta, moneda, texto, validar } from '../util.js';

// Impuestos y gastos: solo el Dueño / Administrador (se restringe al montar el router).
const router = Router();

export const CATEGORIAS_GASTO = ['Compra de café', 'Empaque y etiquetas', 'Salarios', 'Servicios básicos', 'Alquiler', 'Transporte', 'Mantenimiento', 'Impuestos municipales', 'Otros'];

const datosGasto = z.object({
  fecha: fechaISO,
  categoria: z.enum(CATEGORIAS_GASTO),
  descripcion: texto(200, 3),
  monto: dinero.refine((m) => m > 0, 'El monto debe ser mayor que cero'),
  ivaAcreditable: dinero.default(0),
});

router.get('/impuestos', async (req, res) => {
  const actual = new Date().getFullYear();
  const { anio } = validar(z.object({ anio: z.coerce.number().int().min(2020).max(actual + 1).default(actual) }), req.query);
  res.json(await estimacionAnual(anio));
});

router.get('/gastos', async (req, res) => {
  const actual = new Date().getFullYear();
  const { anio } = validar(z.object({ anio: z.coerce.number().int().min(2020).max(actual + 1).default(actual) }), req.query);
  const gastos = await q(
    `SELECT g.idGasto, CONVERT(CHAR(10), g.fecha, 23) AS fecha, g.categoria, g.descripcion, g.monto, g.ivaAcreditable, u.nombre AS usuario
     FROM dbo.Gasto g JOIN dbo.Usuario u ON u.idUsuario = g.idUsuario
     WHERE g.fecha >= @inicio AND g.fecha < @fin
     ORDER BY g.fecha DESC, g.idGasto DESC`,
    { inicio: `${anio}-01-01`, fin: `${anio + 1}-01-01` },
  );
  res.json({ anio, categorias: CATEGORIAS_GASTO, gastos });
});

router.post('/gastos', async (req, res) => {
  const d = validar(datosGasto, req.body);
  const creado = await uno(
    `INSERT INTO dbo.Gasto (fecha, categoria, descripcion, monto, ivaAcreditable, idUsuario)
     OUTPUT inserted.idGasto
     VALUES (@fecha, @categoria, @descripcion, @monto, @ivaAcreditable, @idUsuario)`,
    { ...d, idUsuario: req.usuario.idUsuario },
  );
  await registrarBitacora({ usuario: req.usuario, accion: 'GASTO_REGISTRADO', detalle: `${d.categoria}: ${d.descripcion} (${moneda(d.monto)})` });
  res.status(201).json({ idGasto: creado.idGasto });
});

router.put('/gastos/:id', async (req, res) => {
  const idGasto = idDeRuta(req);
  const d = validar(datosGasto, req.body);
  const filas = await q(
    `UPDATE dbo.Gasto SET fecha = @fecha, categoria = @categoria, descripcion = @descripcion, monto = @monto, ivaAcreditable = @ivaAcreditable
     OUTPUT inserted.idGasto WHERE idGasto = @idGasto`,
    { ...d, idGasto },
  );
  if (filas.length === 0) throw new ErrorApp(404, 'El gasto no existe.');
  await registrarBitacora({ usuario: req.usuario, accion: 'GASTO_EDITADO', detalle: `${d.categoria}: ${d.descripcion} (${moneda(d.monto)})` });
  res.json({ idGasto });
});

router.delete('/gastos/:id', async (req, res) => {
  const idGasto = idDeRuta(req);
  const borrado = await uno('DELETE FROM dbo.Gasto OUTPUT deleted.categoria, deleted.descripcion, deleted.monto WHERE idGasto = @idGasto', { idGasto });
  if (!borrado) throw new ErrorApp(404, 'El gasto no existe.');
  await registrarBitacora({ usuario: req.usuario, accion: 'GASTO_ELIMINADO', detalle: `${borrado.categoria}: ${borrado.descripcion} (${moneda(borrado.monto)})` });
  res.json({ ok: true });
});

export default router;
