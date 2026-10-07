import { uno } from '../db/conexion.js';
import { fechaHoraLocal, fechaLocal, moneda } from '../util.js';
import { configTributaria, mesesDelAnio } from './impuestos.js';
import { notificar } from './notificaciones.js';
import { crearRespaldo } from './respaldos.js';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export async function respaldoProgramado(ahora = new Date()) {
  const config = await uno('SELECT respaldoAuto, respaldoHora FROM dbo.ConfiguracionNegocio WHERE idConfig = 1');
  if (!config.respaldoAuto) return;
  // Último horario programado que ya pasó: hoy a la hora indicada o, si aún no llega, ayer.
  // Así, si la laptop estaba apagada a esa hora, el respaldo se hace al abrir el sistema.
  const [hora, minuto] = config.respaldoHora.split(':').map(Number);
  const programado = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), hora, minuto);
  if (programado > ahora) programado.setDate(programado.getDate() - 1);
  // Un intento automático por horario, haya salido bien o mal, para no insistir cada minuto.
  const { hechos } = await uno("SELECT COUNT(*) AS hechos FROM dbo.Respaldo WHERE tipo = 'AUTOMATICO' AND fecha >= @desde", { desde: fechaHoraLocal(programado) });
  if (hechos === 0) await crearRespaldo({ tipo: 'AUTOMATICO' });
}

async function recordatorioMensualDGI(ahora) {
  if (ahora.getDate() > 15) return;
  const anterior = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
  const config = await configTributaria();
  const mes = (await mesesDelAnio(anterior.getFullYear(), config))[anterior.getMonth()];
  if (mes.ingresosBrutos === 0) return;
  await notificar({
    tipo: 'IMPUESTOS',
    nivel: 'ADVERTENCIA',
    titulo: `Declaración mensual DGI: ${MESES[anterior.getMonth()]}`,
    mensaje: `Estimado a pagar por ${MESES[anterior.getMonth()]} de ${anterior.getFullYear()}: IVA ${moneda(mes.ivaPagar)} + anticipo IR ${moneda(mes.anticipoNeto)} = ${moneda(mes.totalPagar)}. Confirme las cifras con su contador.`,
    roles: ['ADMIN'],
    enlace: '/impuestos',
    clave: `DGI-MES-${anterior.getFullYear()}-${anterior.getMonth() + 1}`,
  });
}

async function recordatorioAnualDGI(ahora) {
  if (ahora.getMonth() > 1) return; // solo enero y febrero
  const anio = ahora.getFullYear() - 1;
  const { ventas } = await uno("SELECT COUNT(*) AS ventas FROM dbo.Venta WHERE estado = 'COMPLETADA' AND fecha >= @inicio AND fecha < @fin", { inicio: `${anio}-01-01`, fin: `${anio + 1}-01-01` });
  if (ventas === 0) return;
  await notificar({
    tipo: 'IMPUESTOS',
    nivel: 'ADVERTENCIA',
    titulo: `Declaración anual del IR ${anio}`,
    mensaje: `Ya puede preparar la declaración anual del IR ${anio}. Normalmente vence el último día de febrero: confirme la fecha con su contador y revise la estimación en Impuestos DGI.`,
    roles: ['ADMIN'],
    enlace: '/impuestos',
    clave: `DGI-ANUAL-${anio}`,
  });
}

async function cajaOlvidada(ahora) {
  const sesion = await uno("SELECT idSesion, fechaApertura FROM dbo.SesionCaja WHERE estado = 'ABIERTA' AND fechaApertura < @hoy", { hoy: fechaLocal(ahora) });
  if (!sesion) return;
  await notificar({
    tipo: 'CAJA',
    nivel: 'ADVERTENCIA',
    titulo: 'La caja quedó abierta desde un día anterior',
    mensaje: 'Haga el arqueo y cierre la caja para que las ventas de hoy queden en una sesión nueva.',
    roles: ['ADMIN', 'VENTAS'],
    enlace: '/arqueo',
    clave: `CAJA-ABIERTA-${sesion.idSesion}-${fechaLocal(ahora)}`,
  });
}

async function respaldoAtrasado(ahora) {
  const { ultimo, ventas } = await uno(
    "SELECT (SELECT MAX(fecha) FROM dbo.Respaldo WHERE estado = 'OK') AS ultimo, (SELECT COUNT(*) FROM dbo.Venta) AS ventas",
  );
  if (ventas === 0) return;
  const dias = ultimo ? (ahora - new Date(ultimo)) / 86400000 : Infinity;
  if (dias < 7) return;
  await notificar({
    tipo: 'RESPALDO',
    nivel: 'ADVERTENCIA',
    titulo: 'Hace más de una semana que no hay respaldo',
    mensaje: 'Cree una copia de seguridad desde Configuración para proteger la información del negocio.',
    roles: ['ADMIN'],
    enlace: '/configuracion',
    clave: `SIN-RESPALDO-${fechaLocal(ahora)}`,
  });
}

async function ejecutar(nombre, tarea) {
  try {
    await tarea(new Date());
  } catch (error) {
    console.error(`[tareas] Falló "${nombre}":`, error.message);
  }
}

/** Arranca las tareas automáticas: respaldo diario y recordatorios. */
export function iniciarTareas() {
  const cadaMinuto = () => ejecutar('respaldo programado', respaldoProgramado);
  const cadaHora = async () => {
    await ejecutar('recordatorio mensual DGI', recordatorioMensualDGI);
    await ejecutar('recordatorio anual DGI', recordatorioAnualDGI);
    await ejecutar('caja olvidada', cajaOlvidada);
    await ejecutar('respaldo atrasado', respaldoAtrasado);
  };
  setTimeout(async () => {
    await cadaMinuto();
    await cadaHora();
  }, 5000).unref();
  setInterval(cadaMinuto, 60 * 1000).unref();
  setInterval(cadaHora, 60 * 60 * 1000).unref();
}
