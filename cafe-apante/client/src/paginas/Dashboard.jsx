import { ArrowDownRight, ArrowRight, ArrowUpRight, Banknote, CalendarDays, Lock, LockOpen, RefreshCw, TrendingUp } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useDatos } from '../api.js';
import { cordobas, cordobasCompactos, cordobasCortos, fechaBreve, fechaCompleta, hora, libras, mesAbreviado, nombreMes } from '../formato.js';
import { BarraProporcion, Boton, Cargando, Dato, Encabezado, Insignia, MensajeError, Nota, Segmentado, Semaforo, Tarjeta } from '../ui.jsx';

// Un solo tono para las ventas; la proyección usa el mismo tono, más claro y con borde punteado.
const COLOR_VENTAS = '#9c5a1c';
const COLOR_PROYECCION = '#f5e4ce';
const COLOR_BORDE_PROYECCION = '#b8702a';
const SEGUNDOS_ENTRE_ACTUALIZACIONES = 60;

const NOMBRE_METODO = { EFECTIVO_NIO: 'Efectivo en córdobas', EFECTIVO_USD: 'Efectivo en dólares', DEPOSITO: 'Depósito bancario' };
const NOMBRE_CATEGORIA = { GRANDE: 'Clientes grandes (mayoristas)', PEQUENO: 'Clientes pequeños (minoristas)' };

function Variacion({ actual, anterior, contra }) {
  if (!anterior) return <span>Sin ventas {contra} para comparar</span>;
  const cambio = ((actual - anterior) / anterior) * 100;
  const sube = cambio >= 0;
  const Icono = sube ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="flex flex-wrap items-center gap-x-1.5">
      <span className={`inline-flex items-center gap-0.5 font-semibold ${sube ? 'text-hoja-700' : 'text-peligro-700'}`}>
        <Icono className="size-4" aria-hidden />
        {sube ? 'Subió' : 'Bajó'} {Math.abs(cambio).toFixed(0)} %
      </span>
      <span>frente a {contra}</span>
    </span>
  );
}

function Leyenda() {
  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-cafe-700">
      <li className="flex items-center gap-2">
        <span className="size-3.5 rounded-sm" style={{ background: COLOR_VENTAS }} aria-hidden /> Ventas registradas
      </li>
      <li className="flex items-center gap-2">
        <span className="size-3.5 rounded-sm border-2 border-dashed" style={{ background: COLOR_PROYECCION, borderColor: COLOR_BORDE_PROYECCION }} aria-hidden /> Proyección
      </li>
    </ul>
  );
}

function Detalle({ active, payload, titulo }) {
  if (!active || !payload?.length) return null;
  const fila = payload[0].payload;
  return (
    <div className="rounded-xl border border-hueso-300 bg-white px-4 py-3 shadow-flotante">
      <p className="font-semibold text-cafe-900">{titulo(fila)}</p>
      {fila.ventas != null && (
        <p className="mt-1 text-cafe-700">
          Ventas: <strong className="tabular-nums text-cafe-900">{cordobas(fila.ventas)}</strong>
        </p>
      )}
      {fila.transacciones != null && (
        <p className="text-sm text-cafe-500">
          {fila.transacciones} venta(s) · {libras(fila.libras)}
        </p>
      )}
      {fila.proyeccion != null && (
        <p className="mt-1 text-cafe-700">
          {fila.ventas != null ? 'Falta por vender (estimado)' : 'Proyección'}: <strong className="tabular-nums text-cafe-900">{cordobas(fila.proyeccion)}</strong>
        </p>
      )}
    </div>
  );
}

function GraficoVentas({ filas, claveEje, formatoEje, titulo }) {
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={filas} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke="#e3d9c7" />
          <XAxis dataKey={claveEje} tickFormatter={formatoEje} tick={{ fill: '#5e4739', fontSize: 14 }} tickLine={false} axisLine={{ stroke: '#cfc2ab' }} minTickGap={18} interval="preserveStartEnd" />
          <YAxis tickFormatter={cordobasCompactos} tick={{ fill: '#5e4739', fontSize: 14 }} tickLine={false} axisLine={false} width={86} />
          <Tooltip content={<Detalle titulo={titulo} />} cursor={{ fill: '#f0e9dc', opacity: 0.7 }} />
          <Bar dataKey="ventas" stackId="total" fill={COLOR_VENTAS} radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false} />
          <Bar dataKey="proyeccion" stackId="total" fill={COLOR_PROYECCION} stroke={COLOR_BORDE_PROYECCION} strokeDasharray="4 3" radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function TablaDeDatos({ filas, etiqueta, formato }) {
  return (
    <details className="mt-4 rounded-xl border border-hueso-300 bg-hueso-50">
      <summary className="cursor-pointer px-4 py-3 font-semibold text-cafe-800">Ver estos datos en una tabla</summary>
      <div className="max-h-80 overflow-auto border-t border-hueso-300">
        <table className="tabla">
          <thead>
            <tr>
              <th>{etiqueta}</th>
              <th className="num">Ventas</th>
              <th className="num">Proyección</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={i}>
                <td>{formato(f)}</td>
                <td className="num">{f.ventas != null ? cordobas(f.ventas) : '—'}</td>
                <td className="num">{f.proyeccion != null ? cordobas(f.proyeccion) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export default function Dashboard() {
  const { datos: d, cargando, error, recargar } = useDatos('/analisis/dashboard');
  const [vista, setVista] = useState('dia');

  // El Dueño lo consulta desde el celular: se refresca solo para verse siempre al día.
  useEffect(() => {
    const reloj = setInterval(recargar, SEGUNDOS_ENTRE_ACTUALIZACIONES * 1000);
    return () => clearInterval(reloj);
  }, [recargar]);

  const series = useMemo(() => {
    if (!d) return null;
    // La barra de hoy lleva encima lo que todavía se espera vender en el resto del día.
    const hoy = { ...d.serieDiaria.at(-1), proyeccion: d.proyeccion.restoHoy > 0 ? d.proyeccion.restoHoy : undefined };
    const porDia = [...d.serieDiaria.slice(0, -1), hoy, ...d.proyeccion.dias.map((p) => ({ dia: p.dia, proyeccion: p.proyeccion }))];
    const mesActual = d.serieMensual.at(-1);
    const falta = Math.max(0, d.proyeccion.cierreMes - mesActual.ventas);
    const [anio, mes] = mesActual.mes.split('-').map(Number);
    const siguiente = `${mes === 12 ? anio + 1 : anio}-${String(mes === 12 ? 1 : mes + 1).padStart(2, '0')}`;
    const porMes = [...d.serieMensual.slice(0, -1), { ...mesActual, proyeccion: falta > 0 ? falta : undefined }, { mes: siguiente, proyeccion: d.proyeccion.proximoMes }];
    return { porDia, porMes };
  }, [d]);

  if (cargando && !d) return <Cargando texto="Preparando el resumen…" />;
  if (error && !d) return <MensajeError mensaje={error} alReintentar={recargar} />;

  const { kpi, proyeccion } = d;
  const totalProductos = d.porProducto.reduce((s, p) => s + p.ventas, 0);
  const totalCategorias = d.porCategoria.reduce((s, c) => s + c.ventas, 0);
  const totalMetodos = d.porMetodo.reduce((s, m) => s + m.ventas, 0);
  const urgentes = d.stock.filter((p) => p.estadoSemaforo !== 'OK');

  return (
    <>
      <Encabezado titulo="Dashboard" descripcion={fechaCompleta(d.generado)}>
        {d.cajaAbierta ? <Insignia tono="verde" icono={LockOpen}>Caja abierta</Insignia> : <Insignia icono={Lock}>Caja cerrada</Insignia>}
        <Boton variante="secundario" icono={RefreshCw} cargando={cargando} onClick={recargar}>
          Actualizar
        </Boton>
      </Encabezado>

      {error && (
        <div className="mb-6">
          <MensajeError mensaje={`No se pudo actualizar (${error}). Se muestran los últimos datos cargados.`} alReintentar={recargar} />
        </div>
      )}

      {!proyeccion.hayDatos && (
        <Nota className="mb-6" titulo="Todavía no hay ventas registradas">
          En cuanto se registren ventas en la Caja, aquí verá los ingresos por día y por mes, los productos más vendidos y la proyección de cierre.
        </Nota>
      )}

      <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        <Dato etiqueta="Ventas de hoy" valor={cordobasCortos(kpi.ventasHoy)} icono={Banknote} detalle={<><p>{kpi.transaccionesHoy} venta(s) · {libras(kpi.librasHoy)}</p><Variacion actual={kpi.ventasHoy} anterior={kpi.ventasAyer} contra="ayer" /></>} />
        <Dato etiqueta="Esta semana" valor={cordobasCortos(kpi.ventasSemana)} icono={CalendarDays} detalle={<><p>{libras(kpi.librasSemana)} vendidas</p><Variacion actual={kpi.ventasSemana} anterior={kpi.ventasSemanaAnterior} contra="los mismos días de la semana pasada" /></>} />
        <Dato etiqueta="Este mes" valor={cordobasCortos(kpi.ventasMes)} icono={CalendarDays} detalle={<><p>{kpi.transaccionesMes} venta(s) · promedio {cordobas(kpi.ticketPromedioMes)}</p><Variacion actual={kpi.ventasMes} anterior={kpi.ventasMesAnterior} contra="los mismos días del mes pasado" /></>} />
        <div className="rounded-2xl border border-caramelo-200 bg-caramelo-50 p-5 shadow-tarjeta">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[0.95rem] font-semibold text-caramelo-700">Proyección: cierre del mes</p>
            <TrendingUp className="size-5 text-caramelo-600" aria-hidden />
          </div>
          <p className="mt-2 whitespace-nowrap font-display text-[1.75rem] font-semibold leading-tight text-cafe-900 tabular-nums">{cordobasCortos(proyeccion.cierreMes)}</p>
          <div className="mt-1.5 text-sm text-cafe-600">
            <p>Ritmo actual: {cordobasCortos(proyeccion.ritmoDiario)} por día · faltan {proyeccion.diasRestantes} día(s)</p>
            <p>Próximo mes (estimado): <strong>{cordobasCortos(proyeccion.proximoMes)}</strong></p>
          </div>
        </div>
      </div>

      <Tarjeta
        className="mt-6"
        titulo={vista === 'dia' ? 'Ventas por día' : 'Ventas por mes'}
        descripcion={vista === 'dia' ? 'Últimos 30 días y proyección de los días que vienen. Montos con IVA.' : 'Últimos 12 meses, cierre proyectado de este mes y estimación del próximo. Montos con IVA.'}
        accion={
          <Segmentado
            className="w-full sm:w-72"
            nombre="Agrupar las ventas"
            valor={vista}
            alCambiar={setVista}
            opciones={[
              { valor: 'dia', etiqueta: 'Por día' },
              { valor: 'mes', etiqueta: 'Por mes' },
            ]}
          />
        }
      >
        <div className="mb-3">
          <Leyenda />
        </div>
        {vista === 'dia' ? (
          <>
            <GraficoVentas filas={series.porDia} claveEje="dia" formatoEje={fechaBreve} titulo={(f) => fechaCompleta(f.dia)} />
            <TablaDeDatos filas={series.porDia} etiqueta="Día" formato={(f) => fechaCompleta(f.dia)} />
          </>
        ) : (
          <>
            <GraficoVentas filas={series.porMes} claveEje="mes" formatoEje={mesAbreviado} titulo={(f) => nombreMes(f.mes)} />
            <TablaDeDatos filas={series.porMes} etiqueta="Mes" formato={(f) => nombreMes(f.mes)} />
          </>
        )}
        <p className="mt-3 text-sm text-cafe-500">
          {proyeccion.semanasUsadas > 0
            ? `La proyección usa una media móvil ponderada de las últimas ${proyeccion.semanasUsadas} semana(s) completas, repartida según lo que suele venderse cada día de la semana.`
            : 'La proyección se afinará cuando haya al menos una semana completa de ventas; por ahora usa el promedio diario desde la primera venta.'}
        </p>
      </Tarjeta>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Tarjeta titulo="Más vendidos del mes" descripcion="Por ingresos, con las libras vendidas.">
          {d.porProducto.length === 0 ? (
            <p className="py-6 text-center text-cafe-500">Sin ventas este mes.</p>
          ) : (
            <div className="space-y-4">
              {d.porProducto.map((p) => (
                <BarraProporcion key={p.idProducto} etiqueta={p.nombre} valorTexto={cordobas(p.ventas)} fraccion={p.ventas / (d.porProducto[0].ventas || 1)} detalle={`${libras(p.libras)} · ${((p.ventas / (totalProductos || 1)) * 100).toFixed(0)} % de lo vendido`} />
              ))}
            </div>
          )}
        </Tarjeta>

        <Tarjeta titulo="Quién compra y cómo paga" descripcion="Ventas de este mes.">
          {totalCategorias === 0 ? (
            <p className="py-6 text-center text-cafe-500">Sin ventas este mes.</p>
          ) : (
            <div className="space-y-6">
              <div className="space-y-4">
                {['GRANDE', 'PEQUENO'].map((clave) => {
                  const fila = d.porCategoria.find((c) => c.categoria === clave) ?? { ventas: 0, transacciones: 0 };
                  return <BarraProporcion key={clave} etiqueta={NOMBRE_CATEGORIA[clave]} valorTexto={`${((fila.ventas / totalCategorias) * 100).toFixed(0)} %`} fraccion={fila.ventas / totalCategorias} detalle={`${cordobas(fila.ventas)} en ${fila.transacciones} venta(s)`} />;
                })}
              </div>
              <div className="space-y-4 border-t border-hueso-200 pt-5">
                {d.porMetodo.map((m) => (
                  <BarraProporcion key={m.metodo} etiqueta={NOMBRE_METODO[m.metodo]} valorTexto={`${((m.ventas / (totalMetodos || 1)) * 100).toFixed(0)} %`} fraccion={m.ventas / (totalMetodos || 1)} detalle={`${cordobas(m.ventas)} en ${m.transacciones} venta(s)`} />
                ))}
              </div>
            </div>
          )}
        </Tarjeta>

        <div className="space-y-6">
          <Tarjeta titulo="Inventario" accion={<Link to="/inventario" className="inline-flex items-center gap-1 font-semibold text-caramelo-700 underline-offset-4 hover:underline">Ver todo <ArrowRight className="size-4" aria-hidden /></Link>}>
            {d.stock.length === 0 ? (
              <p className="py-4 text-center text-cafe-500">Aún no hay productos.</p>
            ) : urgentes.length === 0 ? (
              <Nota tono="verde" titulo="Todo con stock suficiente">
                Ningún producto está cerca de su punto de reorden.
              </Nota>
            ) : (
              <ul className="divide-y divide-hueso-200">
                {urgentes.slice(0, 5).map((p) => (
                  <li key={p.idProducto} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{p.nombre}</p>
                      <p className="text-sm text-cafe-500">
                        Quedan {libras(p.stockActual)} · reorden en {libras(p.puntoReorden)}
                      </p>
                    </div>
                    <Semaforo nivel={p.estadoSemaforo} />
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>

          <Tarjeta titulo="DGI estimado de este mes">
            <p className="font-display text-[1.9rem] font-semibold leading-tight tabular-nums">{cordobas(d.dgiMes.totalPagar)}</p>
            <dl className="mt-2 space-y-1 text-cafe-700">
              <div className="flex justify-between gap-3">
                <dt>IVA por pagar</dt>
                <dd className="tabular-nums">{cordobas(d.dgiMes.ivaPagar)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Anticipo de IR</dt>
                <dd className="tabular-nums">{cordobas(d.dgiMes.anticipoNeto)}</dd>
              </div>
            </dl>
            <Link to="/impuestos" className="mt-3 inline-flex items-center gap-1 font-semibold text-caramelo-700 underline-offset-4 hover:underline">
              Ver el detalle y el IR anual <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Tarjeta>
        </div>
      </div>

      <p className="mt-6 text-sm text-cafe-500">Actualizado a las {hora(d.generado)}. Se refresca solo cada minuto.</p>
    </>
  );
}
