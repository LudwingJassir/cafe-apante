import { Calculator, CircleCheck, Lock, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { calcularArqueo } from '../../../shared/calculos.js';
import { api, useDatos } from '../api.js';
import { useAvisos, useSesion } from '../contexto.jsx';
import { aNumero, cordobas, dolares, fechaHora } from '../formato.js';
import { AreaTexto, Boton, Cargando, Confirmar, Dato, Encabezado, Entrada, EstadoVacio, Insignia, MensajeError, Tarjeta } from '../ui.jsx';
import { AbrirCaja } from './Caja.jsx';

function Diferencia({ valor, formato }) {
  if (valor === null || valor === undefined) return <span className="text-cafe-400">—</span>;
  if (valor === 0) return <Insignia tono="verde" icono={CircleCheck}>Cuadra</Insignia>;
  return (
    <Insignia tono={valor > 0 ? 'ambar' : 'rojo'} icono={TriangleAlert}>
      {valor > 0 ? 'Sobran' : 'Faltan'} {formato(Math.abs(valor))}
    </Insignia>
  );
}

function CierreDeCaja({ sesion, resumen, alCerrar }) {
  const avisos = useAvisos();
  const { refrescarNotificaciones } = useSesion();
  const [contadoNIO, setContadoNIO] = useState('');
  const [contadoUSD, setContadoUSD] = useState('');
  const [observacion, setObservacion] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [cerrando, setCerrando] = useState(false);

  const nio = aNumero(contadoNIO);
  const usd = aNumero(contadoUSD) ?? 0;
  const arqueo = calcularArqueo({ montoInicial: sesion.montoInicial, ...resumen, contadoNIO: nio, contadoUSD: nio === null ? null : usd });
  const hayDiferencia = nio !== null && (arqueo.diferenciaNIO !== 0 || arqueo.diferenciaUSD !== 0);

  async function cerrar() {
    setCerrando(true);
    try {
      await api('/caja/cerrar', { metodo: 'POST', cuerpo: { contadoNIO: nio, contadoUSD: usd, observacion } });
      avisos.exito('La caja quedó cerrada y el arqueo se guardó.');
      setConfirmando(false);
      refrescarNotificaciones();
      alCerrar();
    } catch (err) {
      avisos.error(err.message);
    } finally {
      setCerrando(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_28rem]">
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Dato etiqueta="Fondo inicial" valor={cordobas(sesion.montoInicial)} detalle={`Abrió ${sesion.abiertaPor} · ${fechaHora(sesion.fechaApertura)}`} />
          <Dato etiqueta="Ventas de esta caja" valor={cordobas(resumen.totalVentas)} detalle={`${resumen.ventas} venta(s)${resumen.anuladas ? ` · ${resumen.anuladas} anulada(s)` : ''}`} />
        </div>
        <Tarjeta titulo="De dónde sale lo esperado" descripcion="El sistema calcula cuánto efectivo debería haber en la gaveta.">
          <dl className="space-y-2.5 text-lg">
            <div className="flex justify-between gap-4">
              <dt>Fondo inicial</dt>
              <dd className="tabular-nums">{cordobas(sesion.montoInicial)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>+ Ventas cobradas en córdobas</dt>
              <dd className="tabular-nums">{cordobas(resumen.efectivoNIO)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>− Vuelto entregado por pagos en dólares</dt>
              <dd className="tabular-nums">{cordobas(resumen.vueltoPorUSD)}</dd>
            </div>
            {resumen.devolucionesNIO > 0 && (
              <div className="flex justify-between gap-4">
                <dt>− Dinero devuelto por ventas anuladas de cajas anteriores</dt>
                <dd className="tabular-nums">{cordobas(resumen.devolucionesNIO)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4 border-t border-hueso-300 pt-2.5 font-bold">
              <dt>Córdobas esperados en gaveta</dt>
              <dd className="tabular-nums">{cordobas(arqueo.esperadoNIO)}</dd>
            </div>
            <div className="flex justify-between gap-4 font-bold">
              <dt>Dólares esperados en gaveta</dt>
              <dd className="tabular-nums">{dolares(arqueo.esperadoUSD)}</dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-hueso-300 pt-2.5 text-cafe-600">
              <dt>Depósitos bancarios (no están en la gaveta)</dt>
              <dd className="tabular-nums">{cordobas(resumen.totalDepositos)}</dd>
            </div>
          </dl>
        </Tarjeta>
      </div>

      <Tarjeta titulo="Conteo y cierre" descripcion="Cuente el dinero de la gaveta y anótelo aquí.">
        <div className="space-y-5">
          <Entrada etiqueta="Córdobas contados" prefijo="C$" type="text" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={contadoNIO} onChange={(e) => setContadoNIO(e.target.value)} />
          <Entrada etiqueta="Dólares contados" prefijo="US$" type="text" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={contadoUSD} onChange={(e) => setContadoUSD(e.target.value)} />
          {nio !== null && (
            <div className="space-y-2 rounded-2xl bg-hueso-100 p-4" role="status">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">Córdobas</span>
                <Diferencia valor={arqueo.diferenciaNIO} formato={cordobas} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">Dólares</span>
                <Diferencia valor={arqueo.diferenciaUSD} formato={dolares} />
              </div>
            </div>
          )}
          <AreaTexto etiqueta="Observación" opcional={!hayDiferencia} value={observacion} onChange={(e) => setObservacion(e.target.value)} maxLength={300} placeholder={hayDiferencia ? 'Explique la diferencia, si la conoce' : ''} />
          <Boton tamano="lg" icono={Lock} disabled={nio === null} onClick={() => setConfirmando(true)} className="w-full">
            Cerrar caja
          </Boton>
        </div>
      </Tarjeta>

      <Confirmar abierto={confirmando} titulo="¿Cerrar la caja?" textoConfirmar="Sí, cerrar caja" cargando={cerrando} alConfirmar={cerrar} alCancelar={() => setConfirmando(false)}>
        <p>
          Contó <strong>{cordobas(nio ?? 0)}</strong> y <strong>{dolares(usd)}</strong>.
        </p>
        <p className="mt-2">{hayDiferencia ? 'Hay una diferencia con lo esperado; quedará registrada y se avisará al Dueño.' : 'El conteo cuadra con lo esperado.'}</p>
        <p className="mt-2 text-base text-cafe-500">Después de cerrar no se podrá vender hasta abrir la caja de nuevo.</p>
      </Confirmar>
    </div>
  );
}

export default function Arqueo() {
  const caja = useDatos('/caja/actual');
  const historial = useDatos('/caja/sesiones');

  function alCambiar() {
    caja.recargar();
    historial.recargar();
  }

  return (
    <>
      <Encabezado titulo="Arqueo de caja" descripcion="Compare el dinero contado con lo que el sistema espera y cierre la caja al terminar la jornada." />

      {caja.error && <MensajeError mensaje={caja.error} alReintentar={caja.recargar} />}
      {caja.cargando && !caja.datos && <Cargando />}
      {caja.datos && (caja.datos.sesion ? <CierreDeCaja sesion={caja.datos.sesion} resumen={caja.datos.resumen} alCerrar={alCambiar} /> : <AbrirCaja alAbrir={alCambiar} />)}

      <Tarjeta titulo="Cierres anteriores" className="mt-8" relleno={false}>
        {historial.cargando && !historial.datos && <Cargando />}
        {historial.datos?.length === 0 && <EstadoVacio icono={Calculator} titulo="Aún no hay cierres" texto="Aquí quedará el registro de cada arqueo de caja." />}
        {historial.datos?.length > 0 && (
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Cierre</th>
                  <th>Responsable</th>
                  <th className="num">Ventas</th>
                  <th className="num">Esperado</th>
                  <th className="num">Contado</th>
                  <th>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {historial.datos.map((s) => (
                  <tr key={s.idSesion}>
                    <td className="whitespace-nowrap">
                      {fechaHora(s.fechaCierre)}
                      <span className="block text-sm text-cafe-500">Abrió {fechaHora(s.fechaApertura)}</span>
                    </td>
                    <td>
                      {s.cerradaPor}
                      {s.observacion && <span className="block max-w-xs text-sm text-cafe-500">«{s.observacion}»</span>}
                    </td>
                    <td className="num">
                      {cordobas(s.totalVentas)}
                      {s.totalDepositos > 0 && <span className="block text-sm text-cafe-500">Depósitos {cordobas(s.totalDepositos)}</span>}
                    </td>
                    <td className="num">
                      {cordobas(s.esperadoNIO)}
                      {s.esperadoUSD > 0 && <span className="block text-sm text-cafe-500">{dolares(s.esperadoUSD)}</span>}
                    </td>
                    <td className="num">
                      {cordobas(s.contadoNIO)}
                      {(s.contadoUSD > 0 || s.esperadoUSD > 0) && <span className="block text-sm text-cafe-500">{dolares(s.contadoUSD)}</span>}
                    </td>
                    <td>
                      <div className="flex flex-col items-start gap-1.5">
                        <Diferencia valor={s.diferenciaNIO} formato={cordobas} />
                        {s.diferenciaUSD !== 0 && <Diferencia valor={s.diferenciaUSD} formato={dolares} />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>
    </>
  );
}
