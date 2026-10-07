import { calcularIRAnual, redondear, resumenMensualDGI } from '../../shared/calculos.js';
import { q, uno } from '../db/conexion.js';

export async function configTributaria(tx = null) {
  const fila = await uno('SELECT * FROM dbo.ConfiguracionTributaria WHERE idConfig = 1', {}, tx);
  return { ...fila, preciosIncluyenIVA: Boolean(fila.preciosIncluyenIVA), tablaIR: JSON.parse(fila.tablaIR) };
}

const suma = (filas, campo) => redondear(filas.reduce((s, f) => s + Number(f[campo]), 0));

/** Liquidación de cada mes del año: ingresos, IVA, retenciones, gastos y lo que toca pagar. */
export async function mesesDelAnio(anio, config) {
  const rango = { inicio: `${anio}-01-01`, fin: `${anio + 1}-01-01` };
  const [ventas, retenciones, gastos] = await Promise.all([
    q(
      `SELECT MONTH(v.fecha) AS mes, SUM(d.subtotal) AS ingresos, SUM(d.iva) AS iva,
              SUM(CASE WHEN d.iva > 0 THEN d.subtotal ELSE 0 END) AS gravadas
       FROM dbo.DetalleVenta d JOIN dbo.Venta v ON v.idVenta = d.idVenta
       WHERE v.estado = 'COMPLETADA' AND v.fecha >= @inicio AND v.fecha < @fin
       GROUP BY MONTH(v.fecha)`,
      rango,
    ),
    q(
      `SELECT MONTH(fecha) AS mes, SUM(retencionDGI) AS retenciones, COUNT(*) AS ventas
       FROM dbo.Venta WHERE estado = 'COMPLETADA' AND fecha >= @inicio AND fecha < @fin
       GROUP BY MONTH(fecha)`,
      rango,
    ),
    q(
      `SELECT MONTH(fecha) AS mes, SUM(monto) AS gastos, SUM(ivaAcreditable) AS ivaAcreditable
       FROM dbo.Gasto WHERE fecha >= @inicio AND fecha < @fin GROUP BY MONTH(fecha)`,
      rango,
    ),
  ]);

  // Los saldos a favor (IVA, y retenciones que superaron al anticipo) se arrastran de un mes al siguiente.
  let saldoFavorAnteriorIVA = 0;
  let saldoFavorAnteriorIR = 0;
  return Array.from({ length: 12 }, (_, i) => {
    const mes = i + 1;
    const v = ventas.find((f) => f.mes === mes);
    const r = retenciones.find((f) => f.mes === mes);
    const g = gastos.find((f) => f.mes === mes);
    const base = {
      mes,
      ventas: r?.ventas ?? 0,
      ingresosBrutos: redondear(v?.ingresos ?? 0),
      ventasGravadas: redondear(v?.gravadas ?? 0),
      ventasExentas: redondear((v?.ingresos ?? 0) - (v?.gravadas ?? 0)),
      ivaCobrado: redondear(v?.iva ?? 0),
      retenciones: redondear(r?.retenciones ?? 0),
      gastos: redondear(g?.gastos ?? 0),
      ivaAcreditable: redondear(g?.ivaAcreditable ?? 0),
    };
    const liquidacion = resumenMensualDGI({ ...base, tasaAnticipoIR: config.tasaAnticipoIR, saldoFavorAnteriorIVA, saldoFavorAnteriorIR });
    const fila = { ...base, saldoFavorAnteriorIVA, saldoFavorAnteriorIR, ...liquidacion };
    saldoFavorAnteriorIVA = liquidacion.saldoFavorIVA;
    saldoFavorAnteriorIR = liquidacion.saldoFavorIR;
    return fila;
  });
}

function liquidarAnio(config, { ingresosBrutos, gastos, anticipos, retenciones }) {
  return calcularIRAnual({
    ingresosBrutos,
    gastosDeducibles: gastos,
    tablaIR: config.tablaIR,
    topeTablaProgresiva: config.topeTablaProgresiva,
    tasaIRGeneral: config.tasaIRGeneral,
    tasaAnticipoIR: config.tasaAnticipoIR,
    anticipos,
    retenciones,
  });
}

/**
 * IR anual: lo acumulado a la fecha y, si el año sigue en curso, una proyección
 * al 31 de diciembre suponiendo que se mantiene el ritmo observado desde la primera venta.
 */
export async function estimacionAnual(anio, hoy = new Date()) {
  const config = await configTributaria();
  const meses = await mesesDelAnio(anio, config);
  const acumulado = {
    ingresosBrutos: suma(meses, 'ingresosBrutos'),
    gastos: suma(meses, 'gastos'),
    ivaCobrado: suma(meses, 'ivaCobrado'),
    ivaPagar: suma(meses, 'ivaPagar'),
    anticipos: suma(meses, 'anticipoNeto'),
    retenciones: suma(meses, 'retenciones'),
  };
  const resultado = { anio, config, meses, acumulado, liquidacion: liquidarAnio(config, acumulado), proyeccion: null };

  const enCurso = anio === hoy.getFullYear();
  if (!enCurso || acumulado.ingresosBrutos === 0) return resultado;

  const { primera } = await uno(
    "SELECT MIN(fecha) AS primera FROM dbo.Venta WHERE estado = 'COMPLETADA' AND fecha >= @inicio",
    { inicio: `${anio}-01-01` },
  );
  // Se cuentan días de calendario (a medianoche), sin que la hora del día sume o quite uno.
  const aMedianoche = (fecha) => new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  const hoyDia = aMedianoche(hoy);
  const diasConVentas = Math.max(1, Math.round((hoyDia - aMedianoche(new Date(primera))) / 86400000) + 1);
  const diasRestantes = Math.max(0, Math.round((new Date(anio, 11, 31) - hoyDia) / 86400000));
  const factor = (diasConVentas + diasRestantes) / diasConVentas;
  const proyectado = {
    ingresosBrutos: redondear(acumulado.ingresosBrutos * factor),
    gastos: redondear(acumulado.gastos * factor),
    anticipos: redondear(acumulado.anticipos * factor),
    retenciones: redondear(acumulado.retenciones * factor),
  };
  resultado.proyeccion = { diasConVentas, diasRestantes, ...proyectado, liquidacion: liquidarAnio(config, proyectado) };
  return resultado;
}
