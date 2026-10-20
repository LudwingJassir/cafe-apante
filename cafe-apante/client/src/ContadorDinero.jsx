// Conteo de la gaveta pieza por pieza: se toca una denominación y se anota cuántas hay.
import { ArrowRight, Check, Minus, Plus, RotateCcw } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { DENOMINACIONES, redondear, totalDesglose } from '../../shared/calculos.js';
import { cordobas, dolares } from './formato.js';
import { Boton } from './ui.jsx';

const SIMBOLO = { NIO: 'C$', USD: 'US$' };

/** "C$ 200", "C$ 10" o, para monedas fraccionarias, "25 centavos". */
export function nombreDenominacion(moneda, d) {
  if (d.valor < 1) return `${Math.round(d.valor * 100)} centavos`;
  return `${SIMBOLO[moneda]} ${d.valor.toLocaleString('es-NI')}`;
}

const pieza = (d, cantidad) => (d.tipo === 'BILLETE' ? (cantidad === 1 ? 'billete' : 'billetes') : cantidad === 1 ? 'moneda' : 'monedas');

function BotonDenominacion({ moneda, denominacion, cantidad, activo, alElegir }) {
  const formato = moneda === 'USD' ? dolares : cordobas;
  return (
    <button
      type="button"
      onClick={alElegir}
      aria-pressed={activo}
      className={`flex min-h-[5.25rem] flex-col items-start justify-between rounded-xl border-2 px-3.5 py-2.5 text-left transition ${
        activo ? 'border-caramelo-600 bg-caramelo-50 ring-4 ring-caramelo-200/60' : cantidad > 0 ? 'border-hoja-600 bg-hoja-50' : 'border-hueso-300 bg-white hover:border-cafe-400'
      }`}
    >
      <span className="font-display text-xl font-semibold leading-tight text-cafe-900">{nombreDenominacion(moneda, denominacion)}</span>
      {cantidad > 0 ? (
        <span className="text-sm font-semibold text-hoja-800">
          {cantidad} × = {formato(redondear(denominacion.valor * cantidad))}
        </span>
      ) : (
        <span className="text-sm text-cafe-500">Tocar para contar</span>
      )}
    </button>
  );
}

/**
 * @param {{ moneda: 'NIO'|'USD', conteo: Record<string, number>, alCambiar: (conteo) => void,
 *           seleccion: string|null, alSeleccionar: (id: string|null) => void }} props
 */
export default function ContadorDinero({ moneda, conteo, alCambiar, seleccion, alSeleccionar }) {
  const lista = DENOMINACIONES[moneda];
  const campo = useRef(null);
  const actual = lista.find((d) => d.id === seleccion) ?? null;
  const cantidadActual = actual ? (conteo[actual.id] ?? 0) : 0;
  const total = totalDesglose(moneda, conteo);
  const formato = moneda === 'USD' ? dolares : cordobas;

  // Al elegir una denominación, el cursor queda listo para escribir la cantidad.
  useEffect(() => {
    if (actual) {
      campo.current?.focus();
      campo.current?.select();
    }
  }, [actual]);

  function poner(id, cantidad) {
    const limpia = Math.max(0, Math.min(100000, Math.floor(Number(cantidad) || 0)));
    alCambiar({ ...conteo, [id]: limpia });
  }

  function siguiente() {
    const indice = lista.findIndex((d) => d.id === seleccion);
    alSeleccionar(indice >= 0 && indice < lista.length - 1 ? lista[indice + 1].id : null);
  }

  const grupos = [
    { titulo: 'Billetes', items: lista.filter((d) => d.tipo === 'BILLETE') },
    { titulo: 'Monedas', items: lista.filter((d) => d.tipo === 'MONEDA') },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="space-y-5">
      {grupos.map((g) => (
        <section key={g.titulo} aria-label={g.titulo}>
          <h3 className="mb-2 font-sans text-[0.95rem] font-semibold uppercase tracking-wide text-cafe-600">{g.titulo}</h3>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 2xl:grid-cols-4">
            {g.items.map((d) => (
              <BotonDenominacion key={d.id} moneda={moneda} denominacion={d} cantidad={conteo[d.id] ?? 0} activo={seleccion === d.id} alElegir={() => alSeleccionar(d.id)} />
            ))}
          </div>
        </section>
      ))}

      {actual && (
        <div className="aparecer rounded-2xl border-2 border-caramelo-500 bg-white p-4 shadow-tarjeta" role="group" aria-label={`Cantidad de ${nombreDenominacion(moneda, actual)}`}>
          <label htmlFor="cantidad-denominacion" className="block text-lg font-semibold text-cafe-900">
            ¿Cuántos {pieza(actual, 2)} de {nombreDenominacion(moneda, actual)} contó?
          </label>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => poner(actual.id, cantidadActual - 1)}
                disabled={cantidadActual === 0}
                className="flex size-14 shrink-0 items-center justify-center rounded-xl border border-hueso-400 bg-white hover:bg-hueso-200 disabled:opacity-40"
                aria-label={`Quitar un ${pieza(actual, 1)}`}
              >
                <Minus className="size-6" />
              </button>
              <input
                ref={campo}
                id="cantidad-denominacion"
                className="control min-w-0 flex-1 text-center font-display text-3xl font-semibold sm:w-32 sm:flex-none"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={cantidadActual === 0 ? '' : String(cantidadActual)}
                placeholder="0"
                onChange={(e) => poner(actual.id, e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    siguiente();
                  }
                }}
              />
              <button
                type="button"
                onClick={() => poner(actual.id, cantidadActual + 1)}
                className="flex size-14 shrink-0 items-center justify-center rounded-xl border border-hueso-400 bg-white hover:bg-hueso-200"
                aria-label={`Agregar un ${pieza(actual, 1)}`}
              >
                <Plus className="size-6" />
              </button>
            </div>
            <p className="text-lg sm:ml-auto sm:text-right">
              = <strong className="font-display text-2xl tabular-nums">{formato(redondear(actual.valor * cantidadActual))}</strong>
            </p>
          </div>
          <div className="mt-4 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            <Boton variante="secundario" icono={Check} onClick={() => alSeleccionar(null)}>
              Listo
            </Boton>
            {seleccion !== lista.at(-1).id && (
              <Boton icono={ArrowRight} onClick={siguiente}>
                Siguiente denominación
              </Boton>
            )}
          </div>
          <p className="mt-2 text-sm text-cafe-500">Consejo: escriba la cantidad y pulse Enter para pasar a la siguiente.</p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-hueso-100 px-4 py-3" role="status">
        <span className="text-lg font-semibold">Total contado en {moneda === 'USD' ? 'dólares' : 'córdobas'}</span>
        <span className="font-display text-3xl font-semibold tabular-nums">{formato(total)}</span>
      </div>
      {total > 0 && (
        <Boton
          variante="fantasma"
          tamano="sm"
          icono={RotateCcw}
          onClick={() => {
            alCambiar({});
            alSeleccionar(null);
          }}
        >
          Borrar el conteo de {moneda === 'USD' ? 'dólares' : 'córdobas'} y empezar de nuevo
        </Boton>
      )}
    </div>
  );
}
