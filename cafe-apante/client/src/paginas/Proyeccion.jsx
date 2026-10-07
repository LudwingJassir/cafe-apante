import { Sprout, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { useDatos } from '../api.js';
import { fechaBreve, libras } from '../formato.js';
import { Cargando, Dato, Encabezado, EstadoVacio, Insignia, MensajeError, Nota, Segmentado, Semaforo, Tarjeta } from '../ui.jsx';

const HORIZONTES = [
  { valor: 7, etiqueta: 'Próxima semana', frase: 'la próxima semana' },
  { valor: 15, etiqueta: 'Próximos 15 días', frase: 'los próximos 15 días' },
  { valor: 30, etiqueta: 'Próximo mes', frase: 'el próximo mes' },
];

/** Barras pequeñas de libras vendidas por semana; cada barra dice su valor al pasar el cursor o enfocarla. */
function HistorialSemanal({ semanas, semanaActual }) {
  const maximo = Math.max(...semanas.map((s) => s.libras), semanaActual, 1);
  const barras = [...semanas.map((s) => ({ ...s, actual: false })), { semana: null, libras: semanaActual, actual: true }];
  return (
    <figure>
      <figcaption className="mb-2 text-sm font-semibold text-cafe-600">Libras vendidas por semana</figcaption>
      <div className="flex h-28 items-end gap-1.5" role="list">
        {barras.map((b, i) => {
          const etiqueta = b.actual ? `Esta semana (en curso): ${libras(b.libras)}` : `Semana del ${fechaBreve(b.semana)}: ${libras(b.libras)}`;
          return (
            <div key={i} role="listitem" tabIndex={0} title={etiqueta} aria-label={etiqueta} className="group flex h-full flex-1 flex-col items-center justify-end gap-1 rounded">
              <span className="text-xs font-semibold tabular-nums text-cafe-600 opacity-0 transition group-hover:opacity-100 group-focus:opacity-100">{Math.round(b.libras)}</span>
              <div
                className={`w-full rounded-t ${b.actual ? 'border-2 border-dashed border-caramelo-500 bg-caramelo-100' : 'bg-caramelo-600'}`}
                style={{ height: `${Math.max((b.libras / maximo) * 100, b.libras > 0 ? 4 : 1.5)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-cafe-500">
        <span>{fechaBreve(semanas[0].semana)}</span>
        <span>Esta semana</span>
      </div>
    </figure>
  );
}

export default function Proyeccion() {
  const [dias, setDias] = useState(15);
  const { datos, cargando, error, recargar } = useDatos(`/analisis/proyeccion?dias=${dias}`);
  const horizonte = HORIZONTES.find((h) => h.valor === dias).frase;

  return (
    <>
      <Encabezado titulo="Proyección de demanda" descripcion="Cuánto café conviene procesar según el ritmo real de las ventas, para no quedarse sin producto ni acumular de más." />

      <Segmentado etiqueta="¿Para cuánto tiempo quiere planificar?" className="mb-6 max-w-2xl" valor={dias} alCambiar={setDias} opciones={HORIZONTES} />

      {error && <MensajeError mensaje={error} alReintentar={recargar} />}
      {cargando && !datos && <Cargando />}

      {datos && datos.productos.length === 0 && (
        <Tarjeta>
          <EstadoVacio icono={TrendingUp} titulo="Aún no hay productos" texto="Cuando haya productos y ventas registradas, aquí verá cuántas libras procesar." />
        </Tarjeta>
      )}

      {datos && datos.productos.length > 0 && (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <Dato etiqueta={`Demanda estimada para ${horizonte}`} valor={libras(datos.totales.demandaHorizonte)} icono={TrendingUp} />
            <Dato etiqueta="Café en bodega hoy" valor={libras(datos.totales.stockActual)} />
            <div className="rounded-2xl border border-hoja-600 bg-hoja-50 p-5 shadow-tarjeta">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[0.95rem] font-semibold text-hoja-800">Sugerencia: procesar en total</p>
                <Sprout className="size-5 text-hoja-700" aria-hidden />
              </div>
              <p className="mt-2 font-display text-[1.9rem] font-semibold leading-tight text-hoja-800 tabular-nums">{libras(datos.totales.sugeridoProcesar)}</p>
              <p className="mt-1.5 text-sm text-hoja-800">Para cubrir {horizonte} sin bajar del punto de reorden.</p>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            {datos.productos.map((p) => {
              const sinDatos = p.demandaSemanal === 0;
              return (
                <Tarjeta key={p.idProducto}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold">{p.nombre}</h2>
                      <p className="text-sm text-cafe-500">
                        {sinDatos ? 'Sin ventas recientes para proyectar' : p.estimacionParcial ? 'Estimación inicial con lo vendido esta semana' : `Basado en las últimas ${p.semanasUsadas} semana(s) completas`}
                      </p>
                    </div>
                    <Semaforo nivel={p.estadoSemaforo} />
                  </div>

                  <div className="mt-5 grid gap-6 sm:grid-cols-2">
                    <div>
                      <p className="text-[0.95rem] font-semibold text-cafe-600">Sugerencia: procesar</p>
                      <p className="font-display text-5xl font-semibold tabular-nums text-cafe-900">
                        {p.sugeridoProcesar}
                        <span className="ml-2 text-2xl text-cafe-500">lb</span>
                      </p>
                      {p.sugeridoProcesar === 0 && !sinDatos && <Insignia tono="verde" className="mt-2">El stock alcanza</Insignia>}
                      <dl className="mt-4 space-y-1.5 text-cafe-700">
                        <div className="flex justify-between gap-3">
                          <dt>Se venden por semana</dt>
                          <dd className="whitespace-nowrap font-semibold tabular-nums">{libras(p.demandaSemanal)}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt>Demanda del periodo</dt>
                          <dd className="whitespace-nowrap font-semibold tabular-nums">{libras(p.demandaHorizonte)}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt>En bodega</dt>
                          <dd className="whitespace-nowrap font-semibold tabular-nums">{libras(p.stockActual)}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt>Punto de reorden</dt>
                          <dd className="whitespace-nowrap font-semibold tabular-nums">{libras(p.puntoReorden)}</dd>
                        </div>
                        <div className="flex justify-between gap-3 border-t border-hueso-200 pt-1.5">
                          <dt>El stock alcanza para</dt>
                          <dd className="whitespace-nowrap font-semibold tabular-nums">{p.diasCobertura === null ? '—' : `${Math.floor(p.diasCobertura)} día(s)`}</dd>
                        </div>
                      </dl>
                    </div>
                    <HistorialSemanal semanas={p.semanas} semanaActual={p.semanaActual} />
                  </div>
                </Tarjeta>
              );
            })}
          </div>

          <Nota className="mt-6 max-w-4xl" titulo="¿Cómo se calcula?">
            Se usa una media móvil ponderada de las últimas 4 semanas completas: la semana más reciente pesa 40 %, la anterior 30 %, luego 20 % y 10 %. Con ese ritmo se estima la demanda del periodo, y la sugerencia es lo que
            falta para cubrirla y terminar con el punto de reorden intacto: <strong>demanda + punto de reorden − stock actual</strong>.
          </Nota>
        </>
      )}
    </>
  );
}
