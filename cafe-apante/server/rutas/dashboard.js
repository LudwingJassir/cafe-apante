import { Router } from 'express';
import { z } from 'zod';
import { mediaMovilPonderada, redondear } from '../../shared/calculos.js';
import { permitir } from '../auth.js';
import { q, uno } from '../db/conexion.js';
import { configTributaria, mesesDelAnio } from '../servicios/impuestos.js';
import { proyeccionDeDemanda, proyectarIngresos, semanasCompletas, serieDesdePrimeraVenta } from '../servicios/proyeccion.js';
import { fechaLocal, inicioSemana, sumarDias, validar } from '../util.js';

const router = Router();

const DIAS_SERIE = 30;
const MESES_SERIE = 12;
const claveMes = (fecha) => fechaLocal(fecha).slice(0, 7);

router.get('/dashboard', permitir('ADMIN'), async (_req, res) => {
  const hoy = new Date();
  const medianoche = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const lunes = inicioSemana(hoy);
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const inicioMesAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
  const diasSemana = Math.round((medianoche - lunes) / 86400000) + 1;
  // Comparación justa: mismo número de días transcurridos en el periodo anterior.
  const finComparableMes = new Date(Math.min(sumarDias(inicioMesAnterior, hoy.getDate()), inicioMes));
  const semanas = semanasCompletas(hoy, 8);
  const inicioSerieMensual = new Date(hoy.getFullYear(), hoy.getMonth() - (MESES_SERIE - 1), 1);

  const fechas = {
    hoy: fechaLocal(medianoche),
    ayer: fechaLocal(sumarDias(medianoche, -1)),
    semana: fechaLocal(lunes),
    semanaAnterior: fechaLocal(sumarDias(lunes, -7)),
    finSemanaAnterior: fechaLocal(sumarDias(lunes, -7 + diasSemana)),
    mes: fechaLocal(inicioMes),
    mesAnterior: fechaLocal(inicioMesAnterior),
    finMesAnterior: fechaLocal(finComparableMes),
  };
  const completada = "estado = 'COMPLETADA'";
  const si = (condicion, campo) => `ISNULL(SUM(CASE WHEN ${condicion} THEN ${campo} END), 0)`;

  const [kpi, diaria, mensual, semanal, primera, porProducto, porCategoria, porMetodo, stock, cajaAbierta] = await Promise.all([
    uno(
      `SELECT ${si('fecha >= @hoy', 'total')} AS ventasHoy, COUNT(CASE WHEN fecha >= @hoy THEN 1 END) AS transaccionesHoy,
              ${si('fecha >= @hoy', 'totalLibras')} AS librasHoy,
              ${si('fecha >= @ayer AND fecha < @hoy', 'total')} AS ventasAyer,
              ${si('fecha >= @semana', 'total')} AS ventasSemana, ${si('fecha >= @semana', 'totalLibras')} AS librasSemana,
              ${si('fecha >= @semanaAnterior AND fecha < @finSemanaAnterior', 'total')} AS ventasSemanaAnterior,
              ${si('fecha >= @mes', 'total')} AS ventasMes, ${si('fecha >= @mes', 'totalLibras')} AS librasMes,
              COUNT(CASE WHEN fecha >= @mes THEN 1 END) AS transaccionesMes,
              ${si('fecha >= @mesAnterior AND fecha < @finMesAnterior', 'total')} AS ventasMesAnterior
       FROM dbo.Venta WHERE ${completada} AND fecha >= @mesAnterior`,
      fechas,
    ),
    q(
      `SELECT CONVERT(CHAR(10), CAST(fecha AS DATE), 23) AS dia, SUM(total) AS ventas, SUM(totalLibras) AS libras, COUNT(*) AS transacciones
       FROM dbo.Venta WHERE ${completada} AND fecha >= @desde GROUP BY CAST(fecha AS DATE)`,
      { desde: fechaLocal(sumarDias(medianoche, -(DIAS_SERIE - 1))) },
    ),
    q(
      `SELECT CONVERT(CHAR(7), fecha, 23) AS mes, SUM(total) AS ventas, SUM(totalLibras) AS libras, COUNT(*) AS transacciones
       FROM dbo.Venta WHERE ${completada} AND fecha >= @desde GROUP BY CONVERT(CHAR(7), fecha, 23)`,
      { desde: fechaLocal(inicioSerieMensual) },
    ),
    q(
      `SELECT CONVERT(CHAR(10), DATEADD(DAY, -(DATEDIFF(DAY, '19000101', fecha) % 7), CAST(fecha AS DATE)), 23) AS semana, SUM(total) AS ventas
       FROM dbo.Venta WHERE ${completada} AND fecha >= @desde AND fecha < @hasta
       GROUP BY CONVERT(CHAR(10), DATEADD(DAY, -(DATEDIFF(DAY, '19000101', fecha) % 7), CAST(fecha AS DATE)), 23)`,
      { desde: semanas[0], hasta: fechas.semana },
    ),
    uno(`SELECT MIN(fecha) AS fecha FROM dbo.Venta WHERE ${completada}`),
    q(
      `SELECT TOP 6 p.idProducto, p.nombre, SUM(d.importe) AS ventas, SUM(d.cantidadLibras) AS libras
       FROM dbo.DetalleVenta d JOIN dbo.Venta v ON v.idVenta = d.idVenta JOIN dbo.Producto p ON p.idProducto = d.idProducto
       WHERE v.estado = 'COMPLETADA' AND v.fecha >= @mes GROUP BY p.idProducto, p.nombre ORDER BY SUM(d.importe) DESC`,
      { mes: fechas.mes },
    ),
    q(
      `SELECT CASE WHEN c.categoria = 'GRANDE' THEN 'GRANDE' ELSE 'PEQUENO' END AS categoria, SUM(v.total) AS ventas, COUNT(*) AS transacciones
       FROM dbo.Venta v LEFT JOIN dbo.Cliente c ON c.idCliente = v.idCliente
       WHERE v.estado = 'COMPLETADA' AND v.fecha >= @mes
       GROUP BY CASE WHEN c.categoria = 'GRANDE' THEN 'GRANDE' ELSE 'PEQUENO' END`,
      { mes: fechas.mes },
    ),
    q(
      `SELECT CASE WHEN metodoPago = 'DEPOSITO' THEN 'DEPOSITO' ELSE metodoPago + '_' + monedaPago END AS metodo, SUM(totalCobrar) AS ventas, COUNT(*) AS transacciones
       FROM dbo.Venta WHERE ${completada} AND fecha >= @mes
       GROUP BY CASE WHEN metodoPago = 'DEPOSITO' THEN 'DEPOSITO' ELSE metodoPago + '_' + monedaPago END`,
      { mes: fechas.mes },
    ),
    q("SELECT idProducto, nombre, stockActual, puntoReorden, estadoSemaforo FROM dbo.Producto WHERE estado = 'ACTIVO' ORDER BY stockActual - puntoReorden"),
    uno("SELECT COUNT(*) AS abiertas FROM dbo.SesionCaja WHERE estado = 'ABIERTA'"),
  ]);

  // Series continuas: los días y meses sin ventas aparecen en cero, no desaparecen.
  const serieDiaria = Array.from({ length: DIAS_SERIE }, (_, i) => {
    const dia = fechaLocal(sumarDias(medianoche, i - (DIAS_SERIE - 1)));
    const fila = diaria.find((d) => d.dia === dia);
    return { dia, ventas: redondear(fila?.ventas ?? 0), libras: redondear(fila?.libras ?? 0, 1), transacciones: fila?.transacciones ?? 0 };
  });
  const serieMensual = Array.from({ length: MESES_SERIE }, (_, i) => {
    const mes = claveMes(new Date(inicioSerieMensual.getFullYear(), inicioSerieMensual.getMonth() + i, 1));
    const fila = mensual.find((m) => m.mes === mes);
    return { mes, ventas: redondear(fila?.ventas ?? 0), libras: redondear(fila?.libras ?? 0, 1), transacciones: fila?.transacciones ?? 0 };
  });

  const primeraSemana = primera?.fecha ? fechaLocal(inicioSemana(new Date(primera.fecha))) : null;
  const ventasPorSemana = new Map(semanal.map((s) => [s.semana, Number(s.ventas)]));
  const serieSemanal = serieDesdePrimeraVenta(semanas, ventasPorSemana, primeraSemana).map((ventas) => ({ ventas }));

  const finDeMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
  const diasRestantes = finDeMes.getDate() - hoy.getDate();
  const ingresos = proyectarIngresos({ serieDiaria, serieSemanal, hoy: medianoche, diasAdelante: Math.max(diasRestantes, 14) });
  const restoDelMes = redondear(ingresos.dias.slice(0, diasRestantes).reduce((s, d) => s + d.proyeccion, 0));
  // Lo que todavía se espera vender hoy: sin esto, a media mañana el cierre del mes se subestima.
  const restoHoy = Math.max(0, redondear(ingresos.esperadoHoy - Number(kpi.ventasHoy)));

  // Próximo mes: media móvil ponderada de los últimos 3 meses completos con ventas registradas.
  const primerMes = primera?.fecha ? claveMes(new Date(primera.fecha)) : null;
  const mesesCompletos = serieMensual.slice(0, -1).filter((m) => primerMes && m.mes >= primerMes).map((m) => m.ventas);
  const proximoMes = mesesCompletos.length > 0 ? mediaMovilPonderada(mesesCompletos, [3, 2, 1]) : ingresos.ritmoDiario * 30;

  const config = await configTributaria();
  const dgiMes = (await mesesDelAnio(hoy.getFullYear(), config))[hoy.getMonth()];

  res.json({
    generado: hoy,
    kpi: { ...kpi, ticketPromedioMes: kpi.transaccionesMes ? redondear(kpi.ventasMes / kpi.transaccionesMes) : 0 },
    serieDiaria,
    serieMensual,
    proyeccion: {
      hayDatos: Boolean(primera?.fecha),
      semanasUsadas: Math.min(serieSemanal.length, 4),
      ritmoDiario: ingresos.ritmoDiario,
      dias: ingresos.dias,
      diasRestantes,
      restoHoy,
      cierreMes: redondear(Number(kpi.ventasMes) + restoHoy + restoDelMes),
      proximoMes: redondear(proximoMes),
    },
    porProducto,
    porCategoria,
    porMetodo,
    stock,
    cajaAbierta: cajaAbierta.abiertas > 0,
    dgiMes: { ivaPagar: dgiMes.ivaPagar, anticipoNeto: dgiMes.anticipoNeto, totalPagar: dgiMes.totalPagar },
  });
});

router.get('/proyeccion', permitir('ADMIN', 'PRODUCCION'), async (req, res) => {
  const { dias } = validar(z.object({ dias: z.coerce.number().int().min(1).max(90).default(15) }), req.query);
  res.json(await proyeccionDeDemanda(dias));
});

export default router;
