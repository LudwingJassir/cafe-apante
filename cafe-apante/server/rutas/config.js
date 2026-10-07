import { Router } from 'express';
import { networkInterfaces } from 'node:os';
import { z } from 'zod';
import { permitir } from '../auth.js';
import { PUERTO } from '../config.js';
import { q, transaccion, uno } from '../db/conexion.js';
import { configTributaria } from '../servicios/impuestos.js';
import { actualizarSemaforo } from '../servicios/inventario.js';
import { notificar, registrarBitacora } from '../servicios/notificaciones.js';
import { CARPETA_RESPALDOS, crearRespaldo } from '../servicios/respaldos.js';
import { dinero, ErrorApp, numero, texto, textoOpcional, validar } from '../util.js';

const router = Router();
const soloAdmin = permitir('ADMIN');

const porcentaje = numero().pipe(z.number().min(0, 'No puede ser negativo').max(100, 'No puede pasar de 100'));

const datosTributarios = z.object({
  tasaIVA: porcentaje,
  tasaRetencionDGI: porcentaje,
  montoMinimoRetencion: dinero,
  tasaAnticipoIR: porcentaje,
  tasaIRGeneral: porcentaje,
  topeTablaProgresiva: numero().pipe(z.number().min(0).max(999999999999)),
  preciosIncluyenIVA: z.boolean(),
  tablaIR: z
    .array(z.object({ hasta: z.coerce.number().positive().nullable(), tasa: porcentaje }))
    .min(1, 'La tabla necesita al menos un estrato')
    .max(12)
    .refine((t) => t.length === 0 || t.at(-1).hasta === null, 'El último estrato debe quedar sin límite ("en adelante")')
    .refine((t) => t.slice(0, -1).every((e, i) => e.hasta !== null && (i === 0 || e.hasta > t[i - 1].hasta)), 'Los límites de los estratos deben ir de menor a mayor'),
});

const datosNegocio = z.object({
  nombre: texto(100),
  ruc: textoOpcional(30),
  direccion: textoOpcional(200),
  telefono: textoOpcional(30),
  mensajeComprobante: textoOpcional(200),
  banco: textoOpcional(60),
  titularCuenta: textoOpcional(100),
  cuentaNIO: textoOpcional(40),
  cuentaUSD: textoOpcional(40),
  tipoCambio: numero().pipe(z.number().min(1, 'Tipo de cambio inválido').max(1000)),
  seriePrefijo: texto(6).regex(/^[A-Za-z0-9]+$/, 'Use solo letras y números'),
  factorStockMedio: numero().pipe(z.number().min(1, 'Debe ser 1 o más').max(5)),
  respaldoAuto: z.boolean(),
  respaldoHora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida (use HH:MM)'),
  // Solo unidades locales o USB (letra de unidad). Se rechazan rutas de red (\\equipo\carpeta):
  // con ellas, quien tome una sesión de administrador podría llevarse cada respaldo a otra máquina.
  respaldoDestino: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z
      .string()
      .trim()
      .max(260)
      .refine((ruta) => /^[A-Za-z]:\\/.test(ruta) && !ruta.split(/[\\/]/).includes('..'), 'Use una carpeta de esta laptop o de una memoria USB, por ejemplo E:\\Respaldos')
      .nullish(),
  ),
  respaldoConservar: numero().pipe(z.number().int().min(1).max(365)),
});

const CAMPOS_PUBLICOS = 'nombre, ruc, direccion, telefono, mensajeComprobante, banco, titularCuenta, cuentaNIO, cuentaUSD, tipoCambio';

// Lo mínimo que todos los roles necesitan para vender e imprimir comprobantes.
router.get('/', async (_req, res) => {
  const [negocio, t] = await Promise.all([uno(`SELECT ${CAMPOS_PUBLICOS} FROM dbo.ConfiguracionNegocio WHERE idConfig = 1`), configTributaria()]);
  res.json({
    negocio,
    tributaria: { tasaIVA: t.tasaIVA, preciosIncluyenIVA: t.preciosIncluyenIVA, tasaRetencionDGI: t.tasaRetencionDGI, montoMinimoRetencion: t.montoMinimoRetencion },
  });
});

router.get('/completa', soloAdmin, async (_req, res) => {
  const [negocio, tributaria] = await Promise.all([uno('SELECT * FROM dbo.ConfiguracionNegocio WHERE idConfig = 1'), configTributaria()]);
  res.json({ negocio: { ...negocio, respaldoAuto: Boolean(negocio.respaldoAuto) }, tributaria, carpetaRespaldos: CARPETA_RESPALDOS });
});

router.put('/tributaria', soloAdmin, async (req, res) => {
  const d = validar(datosTributarios, req.body);
  await q(
    `UPDATE dbo.ConfiguracionTributaria SET tasaIVA = @tasaIVA, tasaRetencionDGI = @tasaRetencionDGI, montoMinimoRetencion = @montoMinimoRetencion,
            tasaAnticipoIR = @tasaAnticipoIR, tasaIRGeneral = @tasaIRGeneral, topeTablaProgresiva = @topeTablaProgresiva,
            preciosIncluyenIVA = @preciosIncluyenIVA, tablaIR = @tablaIR, fechaActualizacion = SYSDATETIME(), actualizadoPor = @por
     WHERE idConfig = 1`,
    { ...d, tablaIR: JSON.stringify(d.tablaIR), por: req.usuario.nombre },
  );
  await registrarBitacora({ usuario: req.usuario, accion: 'CONFIG_TRIBUTARIA', detalle: `IVA ${d.tasaIVA}%, retención ${d.tasaRetencionDGI}%, anticipo IR ${d.tasaAnticipoIR}%` });
  await notificar({ tipo: 'IMPUESTOS', nivel: 'INFO', titulo: 'Parámetros tributarios actualizados', mensaje: `${req.usuario.nombre} cambió la configuración: IVA ${d.tasaIVA} %, retención ${d.tasaRetencionDGI} %, anticipo IR ${d.tasaAnticipoIR} %. Aplica a las ventas nuevas.`, roles: ['ADMIN'], enlace: '/configuracion' });
  res.json(await configTributaria());
});

router.put('/negocio', soloAdmin, async (req, res) => {
  const d = validar(datosNegocio, req.body);
  const antes = await uno('SELECT tipoCambio, seriePrefijo, factorStockMedio, respaldoDestino, cuentaNIO, cuentaUSD FROM dbo.ConfiguracionNegocio WHERE idConfig = 1');
  await q(
    `UPDATE dbo.ConfiguracionNegocio SET nombre = @nombre, ruc = @ruc, direccion = @direccion, telefono = @telefono,
            mensajeComprobante = @mensajeComprobante, banco = @banco, titularCuenta = @titularCuenta, cuentaNIO = @cuentaNIO,
            cuentaUSD = @cuentaUSD, tipoCambio = @tipoCambio, seriePrefijo = @seriePrefijo, factorStockMedio = @factorStockMedio,
            respaldoAuto = @respaldoAuto, respaldoHora = @respaldoHora, respaldoDestino = @respaldoDestino, respaldoConservar = @respaldoConservar
     WHERE idConfig = 1`,
    {
      ...d, ruc: d.ruc ?? null, direccion: d.direccion ?? null, telefono: d.telefono ?? null, mensajeComprobante: d.mensajeComprobante ?? null,
      banco: d.banco ?? null, titularCuenta: d.titularCuenta ?? null, cuentaNIO: d.cuentaNIO ?? null, cuentaUSD: d.cuentaUSD ?? null,
      seriePrefijo: d.seriePrefijo.toUpperCase(), respaldoDestino: d.respaldoDestino ?? null,
    },
  );
  if (Number(antes.factorStockMedio) !== d.factorStockMedio) {
    await transaccion(async (tx) => {
      const productos = await q("SELECT idProducto, nombre, stockActual, puntoReorden, estadoSemaforo FROM dbo.Producto WHERE estado = 'ACTIVO'", {}, tx);
      for (const p of productos) {
        await actualizarSemaforo(tx, { idProducto: p.idProducto, nombre: p.nombre, stock: p.stockActual, puntoReorden: p.puntoReorden, anterior: p.estadoSemaforo });
      }
    });
  }

  // Los cambios sensibles quedan en la bitácora con el valor anterior y el nuevo.
  const despues = { tipoCambio: d.tipoCambio, seriePrefijo: d.seriePrefijo.toUpperCase(), factorStockMedio: d.factorStockMedio, respaldoDestino: d.respaldoDestino ?? null, cuentaNIO: d.cuentaNIO ?? null, cuentaUSD: d.cuentaUSD ?? null };
  const nombres = { tipoCambio: 'tipo de cambio', seriePrefijo: 'serie', factorStockMedio: 'margen de stock medio', respaldoDestino: 'carpeta de respaldo', cuentaNIO: 'cuenta en córdobas', cuentaUSD: 'cuenta en dólares' };
  const cambios = Object.keys(nombres)
    .filter((campo) => String(antes[campo] ?? '') !== String(despues[campo] ?? ''))
    .map((campo) => `${nombres[campo]}: ${antes[campo] ?? '(vacío)'} → ${despues[campo] ?? '(vacío)'}`);
  await registrarBitacora({ usuario: req.usuario, accion: 'CONFIG_NEGOCIO', detalle: cambios.length ? cambios.join('; ') : 'Actualizó los datos del negocio' });
  const sensibles = cambios.filter((c) => /^(carpeta de respaldo|cuenta en)/.test(c));
  if (sensibles.length) {
    await notificar({ tipo: 'SISTEMA', nivel: 'ADVERTENCIA', titulo: 'Cambió la cuenta bancaria o la carpeta de respaldo', mensaje: `${req.usuario.nombre} modificó: ${sensibles.join('; ')}. Si usted no hizo este cambio, revíselo de inmediato.`, roles: ['ADMIN'], enlace: '/configuracion' });
  }
  res.json({ ok: true });
});

router.get('/respaldos', soloAdmin, async (_req, res) => {
  res.json({
    carpeta: CARPETA_RESPALDOS,
    respaldos: await q('SELECT TOP 40 idRespaldo, fecha, archivo, tamanoBytes, tipo, estado, copiadoA, mensaje FROM dbo.Respaldo ORDER BY fecha DESC, idRespaldo DESC'),
  });
});

router.post('/respaldos', soloAdmin, async (req, res) => {
  try {
    res.status(201).json(await crearRespaldo({ tipo: 'MANUAL', usuario: req.usuario }));
  } catch (error) {
    if (error instanceof ErrorApp) throw error; // por ejemplo: ya hay un respaldo en curso
    console.error('[respaldo]', error.message);
    throw new ErrorApp(500, 'No se pudo crear el respaldo. Revise el espacio en disco e intente de nuevo.');
  }
});

// Direcciones para abrir el sistema desde el celular del Dueño en la misma red Wi-Fi.
router.get('/red', soloAdmin, (_req, res) => {
  const direcciones = Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => `http://${i.address}:${PUERTO}`);
  res.json({ direcciones, puerto: PUERTO });
});

export default router;
