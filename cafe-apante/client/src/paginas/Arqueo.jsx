import { Calculator, CircleCheck, Coins, Lock, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { calcularArqueo, DENOMINACIONES, redondear, totalDesglose } from '../../../shared/calculos.js';
import { api, useDatos } from '../api.js';
import ContadorDinero, { nombreDenominacion } from '../ContadorDinero.jsx';
import { useAvisos, useSesion } from '../contexto.jsx';
import { aNumero, cordobas, dolares, fechaHora } from '../formato.js';
import { AreaTexto, Boton, Cargando, Confirmar, Dato, Encabezado, Entrada, EstadoVacio, Insignia, MensajeError, Segmentado, Tarjeta } from '../ui.jsx';
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

const CLAVE_BORRADOR = (idSesion) => `apante:conteo:${idSesion}`;
const CONTEO_VACIO = { NIO: {}, USD: {} };

/** El conteo en curso se guarda en este navegador: si la página se recarga a media cuenta, no se pierde. */
function leerBorrador(idSesion) {
  try {
    const guardado = JSON.parse(sessionStorage.getItem(CLAVE_BORRADOR(idSesion)) ?? 'null');
    return guardado && guardado.conteo ? guardado : null;
  } catch {
    return null;
  }
}

function ResumenDesglose({ desglose }) {
  const filas = ['NIO', 'USD'].flatMap((moneda) =>
    DENOMINACIONES[moneda]
      .filter((d) => desglose?.[moneda]?.[d.id] > 0)
      .map((d) => ({ moneda, d, cantidad: desglose[moneda][d.id] })),
  );
  if (filas.length === 0) return <p className="text-cafe-500">No se contó ninguna pieza.</p>;
  return (
    <ul className="divide-y divide-hueso-200 text-base">
      {filas.map(({ moneda, d, cantidad }) => (
        <li key={`${moneda}-${d.id}`} className="flex justify-between gap-4 py-1">
          <span>
            {cantidad} × {nombreDenominacion(moneda, d)} <span className="text-sm text-cafe-500">({d.tipo === 'BILLETE' ? 'billete' : 'moneda'})</span>
          </span>
          <span className="tabular-nums">{(moneda === 'USD' ? dolares : cordobas)(redondear(d.valor * cantidad))}</span>
        </li>
      ))}
    </ul>
  );
}

function FilaResultado({ etiqueta, esperado, contado, diferencia, formato }) {
  return (
    <div className="rounded-xl border border-hueso-300 p-3.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-lg font-semibold">{etiqueta}</span>
        <Diferencia valor={diferencia} formato={formato} />
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-cafe-700">
        <div>
          <dt className="text-sm text-cafe-500">Esperado</dt>
          <dd className="font-semibold tabular-nums">{formato(esperado)}</dd>
        </div>
        <div>
          <dt className="text-sm text-cafe-500">Contado</dt>
          <dd className="font-semibold tabular-nums">{contado === null ? '—' : formato(contado)}</dd>
        </div>
      </dl>
    </div>
  );
}

function CierreDeCaja({ sesion, resumen, alCerrar }) {
  const avisos = useAvisos();
  const { refrescarNotificaciones } = useSesion();
  const borrador = leerBorrador(sesion.idSesion);
  const [modo, setModo] = useState(borrador?.modo ?? 'piezas'); // 'piezas' | 'total'
  const [conteo, setConteo] = useState(borrador?.conteo ?? CONTEO_VACIO);
  const [monedaConteo, setMonedaConteo] = useState('NIO');
  const [seleccion, setSeleccion] = useState(null);
  const [contadoNIO, setContadoNIO] = useState('');
  const [contadoUSD, setContadoUSD] = useState('');
  const [observacion, setObservacion] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [cerrando, setCerrando] = useState(false);

  useEffect(() => {
    try {
      sessionStorage.setItem(CLAVE_BORRADOR(sesion.idSesion), JSON.stringify({ modo, conteo }));
    } catch {
      // Sin almacenamiento disponible el conteo funciona igual; solo no sobrevive a una recarga.
    }
  }, [sesion.idSesion, modo, conteo]);

  const porPiezas = modo === 'piezas';
  const nio = porPiezas ? totalDesglose('NIO', conteo.NIO) : aNumero(contadoNIO);
  const usd = porPiezas ? totalDesglose('USD', conteo.USD) : (aNumero(contadoUSD) ?? 0);
  const arqueo = calcularArqueo({ montoInicial: sesion.montoInicial, ...resumen, contadoNIO: nio, contadoUSD: nio === null ? null : usd });
  const hayDiferencia = nio !== null && (arqueo.diferenciaNIO !== 0 || arqueo.diferenciaUSD !== 0);

  function cambiarMoneda(moneda) {
    setMonedaConteo(moneda);
    setSeleccion(null);
  }

  async function cerrar() {
    setCerrando(true);
    try {
      const cuerpo = porPiezas ? { desglose: conteo, observacion } : { contadoNIO: nio, contadoUSD: usd, observacion };
      await api('/caja/cerrar', { metodo: 'POST', cuerpo });
      try {
        sessionStorage.removeItem(CLAVE_BORRADOR(sesion.idSesion));
      } catch {
        // nada que limpiar
      }
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
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Dato etiqueta="Fondo inicial" valor={cordobas(sesion.montoInicial)} detalle={`Abrió ${sesion.abiertaPor} · ${fechaHora(sesion.fechaApertura)}`} />
        <Dato etiqueta="Ventas de esta caja" valor={cordobas(resumen.totalVentas)} detalle={`${resumen.ventas} venta(s)${resumen.anuladas ? ` · ${resumen.anuladas} anulada(s)` : ''}`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <Tarjeta titulo="Conteo del dinero" descripcion="Cuente lo que hay en la gaveta. Puede hacerlo billete por billete o escribir el total.">
          <div className="space-y-5">
            <Segmentado
              nombre="Forma de contar"
              valor={modo}
              alCambiar={(m) => {
                setModo(m);
                setSeleccion(null);
              }}
              opciones={[
                { valor: 'piezas', etiqueta: 'Billete por billete', icono: Coins },
                { valor: 'total', etiqueta: 'Escribir el total', icono: Calculator },
              ]}
            />

            {porPiezas ? (
              <>
                <Segmentado
                  etiqueta="¿Qué moneda está contando?"
                  valor={monedaConteo}
                  alCambiar={cambiarMoneda}
                  opciones={[
                    { valor: 'NIO', etiqueta: `Córdobas · ${cordobas(totalDesglose('NIO', conteo.NIO))}` },
                    { valor: 'USD', etiqueta: `Dólares · ${dolares(totalDesglose('USD', conteo.USD))}` },
                  ]}
                />
                <ContadorDinero
                  moneda={monedaConteo}
                  conteo={conteo[monedaConteo]}
                  alCambiar={(nuevo) => setConteo((c) => ({ ...c, [monedaConteo]: nuevo }))}
                  seleccion={seleccion}
                  alSeleccionar={setSeleccion}
                />
              </>
            ) : (
              <>
                <Entrada etiqueta="Córdobas contados" prefijo="C$" type="text" inputMode="decimal" placeholder="0.00" value={contadoNIO} onChange={(e) => setContadoNIO(e.target.value)} />
                <Entrada etiqueta="Dólares contados" prefijo="US$" type="text" inputMode="decimal" placeholder="0.00" value={contadoUSD} onChange={(e) => setContadoUSD(e.target.value)} />
              </>
            )}
          </div>
        </Tarjeta>

        <div className="space-y-6 xl:sticky xl:top-24 xl:self-start">
          <Tarjeta titulo="Resultado del arqueo">
            <div className="space-y-3" role="status">
              <FilaResultado etiqueta="Córdobas" esperado={arqueo.esperadoNIO} contado={nio} diferencia={arqueo.diferenciaNIO} formato={cordobas} />
              <FilaResultado etiqueta="Dólares" esperado={arqueo.esperadoUSD} contado={nio === null ? null : usd} diferencia={arqueo.diferenciaUSD} formato={dolares} />
            </div>
            <div className="mt-5 space-y-5">
              <AreaTexto etiqueta="Observación" opcional={!hayDiferencia} value={observacion} onChange={(e) => setObservacion(e.target.value)} maxLength={300} placeholder={hayDiferencia ? 'Explique la diferencia, si la conoce' : ''} />
              <Boton tamano="lg" icono={Lock} disabled={nio === null} onClick={() => setConfirmando(true)} className="w-full">
                Cerrar caja
              </Boton>
            </div>
          </Tarjeta>

          <Tarjeta titulo="De dónde sale lo esperado">
            <dl className="space-y-2 text-[0.95rem]">
              <div className="flex justify-between gap-4">
                <dt>Fondo inicial</dt>
                <dd className="tabular-nums">{cordobas(sesion.montoInicial)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>+ Ventas cobradas en córdobas</dt>
                <dd className="tabular-nums">{cordobas(resumen.efectivoNIO)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>− Vuelto por pagos en dólares</dt>
                <dd className="tabular-nums">{cordobas(resumen.vueltoPorUSD)}</dd>
              </div>
              {resumen.devolucionesNIO > 0 && (
                <div className="flex justify-between gap-4">
                  <dt>− Devuelto por ventas anuladas de cajas anteriores</dt>
                  <dd className="tabular-nums">{cordobas(resumen.devolucionesNIO)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4 border-t border-hueso-300 pt-2 font-bold">
                <dt>Córdobas esperados</dt>
                <dd className="tabular-nums">{cordobas(arqueo.esperadoNIO)}</dd>
              </div>
              <div className="flex justify-between gap-4 font-bold">
                <dt>Dólares esperados</dt>
                <dd className="tabular-nums">{dolares(arqueo.esperadoUSD)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-hueso-300 pt-2 text-cafe-600">
                <dt>Depósitos (no están en la gaveta)</dt>
                <dd className="tabular-nums">{cordobas(resumen.totalDepositos)}</dd>
              </div>
            </dl>
          </Tarjeta>
        </div>
      </div>

      <Confirmar abierto={confirmando} titulo="¿Cerrar la caja?" textoConfirmar="Sí, cerrar caja" cargando={cerrando} alConfirmar={cerrar} alCancelar={() => setConfirmando(false)}>
        <p>
          Contó <strong>{cordobas(nio ?? 0)}</strong> y <strong>{dolares(usd)}</strong>.
        </p>
        {porPiezas && (
          <div className="mt-3 max-h-56 overflow-y-auto rounded-xl border border-hueso-300 bg-white px-3 py-2">
            <ResumenDesglose desglose={conteo} />
          </div>
        )}
        <p className="mt-3">{hayDiferencia ? 'Hay una diferencia con lo esperado; quedará registrada y se avisará al Dueño.' : 'El conteo cuadra con lo esperado.'}</p>
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
                      {s.desglose && (
                        <details className="mt-1 text-left">
                          <summary className="cursor-pointer text-sm font-semibold text-caramelo-700">Ver billetes y monedas</summary>
                          <div className="mt-2 min-w-64 rounded-lg border border-hueso-300 bg-hueso-50 px-3 py-1.5 font-normal">
                            <ResumenDesglose desglose={s.desglose} />
                          </div>
                        </details>
                      )}
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
