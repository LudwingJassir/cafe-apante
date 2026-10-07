import { ArrowRight, Landmark } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDatos } from '../api.js';
import { cordobas, NOMBRES_MES } from '../formato.js';
import { Cargando, Dato, Encabezado, Insignia, MensajeError, Nota, Selector, Tarjeta } from '../ui.jsx';

function FilaLiquidacion({ etiqueta, acumulado, proyectado, fuerte = false, ayuda }) {
  return (
    <tr className={fuerte ? 'font-bold' : ''}>
      <td>
        {etiqueta}
        {ayuda && <span className="block text-sm font-normal text-cafe-500">{ayuda}</span>}
      </td>
      <td className="num">{acumulado}</td>
      {proyectado != null && <td className="num">{proyectado}</td>}
    </tr>
  );
}

function saldo(l) {
  if (l.saldoFavor > 0) return `A favor ${cordobas(l.saldoFavor)}`;
  return cordobas(l.saldoPagar);
}

export default function Impuestos() {
  const anioActual = new Date().getFullYear();
  const [anio, setAnio] = useState(anioActual);
  const { datos: d, cargando, error, recargar } = useDatos(`/finanzas/impuestos?anio=${anio}`);

  if (cargando && !d) return <Cargando texto="Calculando impuestos…" />;
  if (error && !d) return <MensajeError mensaje={error} alReintentar={recargar} />;
  // Si falló el cambio de año, no se dejan a la vista las cifras del año anterior como si fueran las pedidas.
  if (error && d.anio !== anio) return <MensajeError mensaje={error} alReintentar={recargar} />;

  const enCurso = d.anio === anioActual;
  const mesActual = enCurso ? d.meses[new Date().getMonth()] : null;
  const ultimoMes = enCurso ? new Date().getMonth() + 1 : 12;
  const meses = d.meses.filter((m) => m.mes <= ultimoMes);
  const total = (campo) => meses.reduce((s, m) => s + m[campo], 0);
  const l = d.liquidacion;
  const p = d.proyeccion;
  const c = d.config;

  return (
    <>
      <Encabezado titulo="Impuestos DGI" descripcion="Régimen General: IVA y anticipo de IR de cada mes, y estimación del IR anual a partir de las ventas y los gastos registrados.">
        <div className="w-40">
          <Selector etiqueta="Año" value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
            {[0, 1, 2, 3].map((i) => (
              <option key={i} value={anioActual - i}>
                {anioActual - i}
              </option>
            ))}
          </Selector>
        </div>
      </Encabezado>

      {mesActual && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <Dato etiqueta={`IVA por pagar · ${NOMBRES_MES[mesActual.mes - 1].toLowerCase()}`} valor={cordobas(mesActual.ivaPagar)} detalle={`Cobrado ${cordobas(mesActual.ivaCobrado)} − acreditable ${cordobas(mesActual.ivaAcreditable)}`} />
          <Dato etiqueta={`Anticipo de IR (${Number(c.tasaAnticipoIR)} %)`} valor={cordobas(mesActual.anticipoNeto)} detalle={mesActual.retenciones > 0 ? `${cordobas(mesActual.anticipoIR)} − retenciones ${cordobas(mesActual.retenciones)}` : `Sobre ingresos de ${cordobas(mesActual.ingresosBrutos)}`} />
          <div className="rounded-2xl border border-caramelo-200 bg-caramelo-50 p-5 shadow-tarjeta">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[0.95rem] font-semibold text-caramelo-700">Total estimado del mes</p>
              <Landmark className="size-5 text-caramelo-600" aria-hidden />
            </div>
            <p className="mt-2 font-display text-[1.9rem] font-semibold leading-tight tabular-nums">{cordobas(mesActual.totalPagar)}</p>
            <p className="mt-1.5 text-sm text-cafe-600">Se declara y paga a la DGI el mes siguiente.</p>
          </div>
        </div>
      )}

      <Tarjeta titulo={`Liquidación mensual ${d.anio}`} descripcion="Montos en córdobas. Los ingresos van sin IVA." relleno={false}>
        <div className="overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Mes</th>
                <th className="num">Ingresos</th>
                <th className="num">IVA por pagar</th>
                <th className="num">Anticipo de IR</th>
                <th className="num">Total a pagar</th>
              </tr>
            </thead>
            <tbody>
              {meses.map((m) => (
                <tr key={m.mes} className={m.ingresosBrutos === 0 && m.gastos === 0 ? 'text-cafe-500' : ''}>
                  <td className="font-semibold">
                    {NOMBRES_MES[m.mes - 1]}
                    {mesActual?.mes === m.mes && <Insignia tono="caramelo" className="ml-2">En curso</Insignia>}
                  </td>
                  <td className="num">{cordobas(m.ingresosBrutos)}</td>
                  <td className="num">
                    {cordobas(m.ivaPagar)}
                    {m.ivaCobrado > 0 && (
                      <span className="block text-sm text-cafe-500">
                        Cobrado {cordobas(m.ivaCobrado)} − acreditable {cordobas(m.ivaAcreditable)}
                      </span>
                    )}
                    {m.saldoFavorAnteriorIVA > 0 && <span className="block text-sm text-cafe-500">− saldo a favor anterior {cordobas(m.saldoFavorAnteriorIVA)}</span>}
                    {m.saldoFavorIVA > 0 && <span className="block text-sm text-hoja-700">Queda a favor {cordobas(m.saldoFavorIVA)}</span>}
                  </td>
                  <td className="num">
                    {cordobas(m.anticipoNeto)}
                    {m.retenciones > 0 && <span className="block text-sm text-cafe-500">Ya retenido {cordobas(m.retenciones)}</span>}
                    {m.saldoFavorIR > 0 && <span className="block text-sm text-hoja-700">Queda a favor {cordobas(m.saldoFavorIR)}</span>}
                  </td>
                  <td className="num font-bold">{cordobas(m.totalPagar)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-hueso-100 font-bold">
                <td>Total del año</td>
                <td className="num">{cordobas(total('ingresosBrutos'))}</td>
                <td className="num">{cordobas(total('ivaPagar'))}</td>
                <td className="num">{cordobas(total('anticipoNeto'))}</td>
                <td className="num">{cordobas(total('totalPagar'))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Tarjeta>

      <Tarjeta
        className="mt-6"
        titulo={`IR anual ${d.anio}`}
        descripcion={p ? `La proyección supone que el ritmo de los últimos ${p.diasConVentas} día(s) con ventas se mantiene los ${p.diasRestantes} día(s) que faltan del año.` : 'Se paga el mayor entre el IR sobre la renta neta y el pago mínimo definitivo.'}
        relleno={false}
      >
        <div className="overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Concepto</th>
                <th className="num">{enCurso ? 'Acumulado a hoy' : 'Año completo'}</th>
                {p && <th className="num">Proyección al 31 de diciembre</th>}
              </tr>
            </thead>
            <tbody>
              <FilaLiquidacion etiqueta="Ingresos brutos" ayuda="Ventas sin IVA" acumulado={cordobas(d.acumulado.ingresosBrutos)} proyectado={p && cordobas(p.ingresosBrutos)} />
              <FilaLiquidacion etiqueta="− Costos y gastos deducibles" ayuda="Lo registrado en Gastos" acumulado={cordobas(d.acumulado.gastos)} proyectado={p && cordobas(p.gastos)} />
              <FilaLiquidacion etiqueta="= Renta neta" acumulado={cordobas(l.rentaNeta)} proyectado={p && cordobas(p.liquidacion.rentaNeta)} fuerte />
              <FilaLiquidacion etiqueta="IR sobre la renta neta" ayuda={`Tasa aplicada: ${l.tasaAplicada} %${p && p.liquidacion.tasaAplicada !== l.tasaAplicada ? ` hoy, ${p.liquidacion.tasaAplicada} % proyectada` : ''}`} acumulado={cordobas(l.irRentaNeta)} proyectado={p && cordobas(p.liquidacion.irRentaNeta)} />
              <FilaLiquidacion etiqueta="Pago mínimo definitivo" ayuda={`${Number(c.tasaAnticipoIR)} % de los ingresos brutos`} acumulado={cordobas(l.pagoMinimo)} proyectado={p && cordobas(p.liquidacion.pagoMinimo)} />
              <FilaLiquidacion
                etiqueta="IR anual (el mayor de los dos)"
                ayuda={l.base === 'RENTA_NETA' ? 'Hoy manda el IR sobre la renta neta' : 'Hoy manda el pago mínimo definitivo'}
                acumulado={cordobas(l.irAnual)}
                proyectado={p && cordobas(p.liquidacion.irAnual)}
                fuerte
              />
              <FilaLiquidacion etiqueta="− Anticipos y retenciones ya acreditados" acumulado={cordobas(l.creditos)} proyectado={p && cordobas(p.liquidacion.creditos)} />
              <FilaLiquidacion etiqueta="= Saldo a pagar en la declaración anual" acumulado={saldo(l)} proyectado={p && saldo(p.liquidacion)} fuerte />
            </tbody>
          </table>
        </div>
      </Tarjeta>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Nota tono="ambar" titulo="Son estimaciones para planificar">
          Las cifras salen de las ventas y los gastos registrados en este sistema y de las tasas configuradas (Ley 822 y sus reformas). Confirme los montos con su contador antes de declarar: la DGI puede aplicar reglas que aquí no se
          consideran. La declaración anual del IR normalmente se presenta a más tardar el último día de febrero del año siguiente; confirme la fecha con su contador.
        </Nota>
        <Nota titulo="Para que el cálculo sea más exacto">
          Registre sus compras y gastos en{' '}
          <Link to="/gastos" className="inline-flex items-center gap-1 font-semibold underline">
            Gastos <ArrowRight className="size-4" aria-hidden />
          </Link>{' '}
          (incluido el IVA que le cobraron). Las tasas y la tabla del IR se cambian en{' '}
          <Link to="/configuracion" className="font-semibold underline">
            Configuración
          </Link>
          .
        </Nota>
      </div>
    </>
  );
}
