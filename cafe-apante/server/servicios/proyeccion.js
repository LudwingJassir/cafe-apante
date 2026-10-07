import { mediaMovilPonderada, proyectarDemanda, redondear } from '../../shared/calculos.js';
import { q } from '../db/conexion.js';
import { fechaLocal, inicioSemana, sumarDias } from '../util.js';

export const SEMANAS_HISTORIAL = 8;
const SEMANAS_PARA_PROMEDIO = 4;

// Lunes de la semana de una fecha, como texto AAAA-MM-DD (el 1/1/1900 fue lunes).
const SQL_LUNES = (campo) => `CONVERT(CHAR(10), DATEADD(DAY, -(DATEDIFF(DAY, '19000101', ${campo}) % 7), CAST(${campo} AS DATE)), 23)`;

/** Lunes de las últimas `cantidad` semanas completas, de la más antigua a la más reciente. */
export function semanasCompletas(hoy = new Date(), cantidad = SEMANAS_HISTORIAL) {
  const lunesActual = inicioSemana(hoy);
  return Array.from({ length: cantidad }, (_, i) => fechaLocal(sumarDias(lunesActual, -7 * (cantidad - i))));
}

/**
 * Serie semanal usable para la media móvil: descarta las semanas anteriores a la
 * primera venta (todavía no había datos) y rellena con cero las semanas sin ventas.
 */
export function serieDesdePrimeraVenta(semanas, valoresPorSemana, primeraSemana) {
  if (!primeraSemana) return [];
  return semanas.filter((s) => s >= primeraSemana).map((s) => Number(valoresPorSemana.get(s) ?? 0));
}

/** Proyección de demanda por producto, en libras, para un horizonte de días. */
export async function proyeccionDeDemanda(diasHorizonte, hoy = new Date()) {
  const semanas = semanasCompletas(hoy);
  const lunesActual = fechaLocal(inicioSemana(hoy));
  const diasSemanaActual = Math.round((new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()) - inicioSemana(hoy)) / 86400000) + 1;

  const [productos, ventas, primeras] = await Promise.all([
    q("SELECT idProducto, nombre, tipo, stockActual, puntoReorden, estadoSemaforo FROM dbo.Producto WHERE estado = 'ACTIVO' ORDER BY nombre"),
    q(
      `SELECT d.idProducto, ${SQL_LUNES('v.fecha')} AS semana, SUM(d.cantidadLibras) AS libras
       FROM dbo.DetalleVenta d JOIN dbo.Venta v ON v.idVenta = d.idVenta
       WHERE v.estado = 'COMPLETADA' AND v.fecha >= @desde
       GROUP BY d.idProducto, ${SQL_LUNES('v.fecha')}`,
      { desde: semanas[0] },
    ),
    q(
      `SELECT d.idProducto, MIN(${SQL_LUNES('v.fecha')}) AS primeraSemana
       FROM dbo.DetalleVenta d JOIN dbo.Venta v ON v.idVenta = d.idVenta
       WHERE v.estado = 'COMPLETADA' GROUP BY d.idProducto`,
    ),
  ]);

  const filas = productos.map((p) => {
    const porSemana = new Map(ventas.filter((v) => v.idProducto === p.idProducto).map((v) => [v.semana, Number(v.libras)]));
    const primeraSemana = primeras.find((f) => f.idProducto === p.idProducto)?.primeraSemana ?? null;
    const historial = serieDesdePrimeraVenta(semanas, porSemana, primeraSemana);
    const semanaActual = porSemana.get(lunesActual) ?? 0;

    // Sin semanas completas todavía (negocio recién iniciado): se estima con lo que va de la semana.
    const estimacionParcial = historial.length === 0 && semanaActual > 0;
    const base = estimacionParcial ? [(semanaActual / diasSemanaActual) * 7] : historial;

    return {
      ...p,
      semanas: semanas.map((s) => ({ semana: s, libras: redondear(porSemana.get(s) ?? 0, 1) })),
      semanaActual: redondear(semanaActual, 1),
      semanasUsadas: Math.min(historial.length, SEMANAS_PARA_PROMEDIO),
      estimacionParcial,
      ...proyectarDemanda({ historialSemanal: base, stockActual: p.stockActual, puntoReorden: p.puntoReorden, diasHorizonte }),
    };
  });

  return {
    diasHorizonte,
    productos: filas,
    totales: {
      demandaHorizonte: redondear(filas.reduce((s, f) => s + f.demandaHorizonte, 0), 1),
      sugeridoProcesar: filas.reduce((s, f) => s + f.sugeridoProcesar, 0),
      stockActual: redondear(filas.reduce((s, f) => s + Number(f.stockActual), 0), 1),
    },
  };
}

/**
 * Proyección de ingresos: reparte la media móvil ponderada semanal según el peso
 * habitual de cada día de la semana, para estimar los días que faltan del mes.
 * @param {{dia:string, ventas:number}[]} serieDiaria últimos días, con ceros incluidos
 * @param {{semana:string, ventas:number}[]} serieSemanal semanas completas desde la primera venta
 */
export function proyectarIngresos({ serieDiaria, serieSemanal, hoy = new Date(), diasAdelante }) {
  const ventasSemanales = serieSemanal.map((s) => s.ventas);
  let ritmoSemanal = mediaMovilPonderada(ventasSemanales);
  // El día de hoy va a medias: no entra en el patrón semanal para no restarle peso a su día.
  const ultimos28 = serieDiaria.slice(0, -1).slice(-28);
  const total28 = ultimos28.reduce((s, d) => s + d.ventas, 0);

  if (ventasSemanales.length === 0 && total28 > 0) {
    // Aún no hay una semana completa: se usa el promedio diario desde la primera venta.
    const desdePrimera = serieDiaria.slice(serieDiaria.findIndex((d) => d.ventas > 0));
    ritmoSemanal = (desdePrimera.reduce((s, d) => s + d.ventas, 0) / desdePrimera.length) * 7;
  }

  const pesoPorDia = Array(7).fill(1 / 7);
  if (total28 > 0 && ventasSemanales.length >= 2) {
    pesoPorDia.fill(0);
    for (const d of ultimos28) pesoPorDia[new Date(`${d.dia}T12:00:00`).getDay()] += d.ventas / total28;
  }

  const dias = Array.from({ length: Math.max(diasAdelante, 0) }, (_, i) => {
    const fecha = sumarDias(hoy, i + 1);
    return { dia: fechaLocal(fecha), proyeccion: redondear(ritmoSemanal * pesoPorDia[fecha.getDay()]) };
  });
  return {
    ritmoDiario: redondear(ritmoSemanal / 7),
    ritmoSemanal: redondear(ritmoSemanal),
    esperadoHoy: redondear(ritmoSemanal * pesoPorDia[hoy.getDay()]),
    dias,
  };
}
