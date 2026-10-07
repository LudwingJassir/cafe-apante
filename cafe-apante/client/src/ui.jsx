// Piezas de interfaz compartidas. Todas priorizan legibilidad: letra grande,
// botones altos, etiquetas visibles y estados dichos con texto (no solo con color).
import { CircleAlert, CircleCheck, CircleX, Info, LoaderCircle, TriangleAlert, X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';

/** Aspecto de cada nivel de notificación: ícono, color y una palabra que lo nombra. */
export const ESTILO_NIVEL = {
  CRITICO: { Icono: CircleAlert, color: 'text-peligro-600', fondo: 'bg-peligro-50', borde: 'border-l-peligro-600', etiqueta: 'Urgente', tono: 'rojo' },
  ADVERTENCIA: { Icono: TriangleAlert, color: 'text-alerta-600', fondo: 'bg-alerta-50', borde: 'border-l-alerta-600', etiqueta: 'Atención', tono: 'ambar' },
  EXITO: { Icono: CircleCheck, color: 'text-hoja-600', fondo: 'bg-hoja-50', borde: 'border-l-hoja-600', etiqueta: 'Todo bien', tono: 'verde' },
  INFO: { Icono: Info, color: 'text-info-700', fondo: 'bg-info-50', borde: 'border-l-info-700', etiqueta: 'Aviso', tono: 'azul' },
};

const VARIANTES = {
  primario: 'bg-cafe-800 text-hueso-50 hover:bg-cafe-700 active:bg-cafe-900 shadow-sm',
  acento: 'bg-caramelo-600 text-white hover:bg-caramelo-700 active:bg-caramelo-700 shadow-sm',
  exito: 'bg-hoja-700 text-white hover:bg-hoja-800 active:bg-hoja-800 shadow-sm',
  peligro: 'bg-peligro-600 text-white hover:bg-peligro-700 active:bg-peligro-700 shadow-sm',
  secundario: 'bg-white text-cafe-800 border border-hueso-400 hover:bg-hueso-200 hover:border-cafe-400 shadow-sm',
  fantasma: 'text-cafe-700 hover:bg-hueso-200',
};
const TAMANOS = {
  sm: 'min-h-10 px-3.5 text-[0.95rem] gap-1.5 rounded-lg',
  md: 'min-h-13 px-5 text-base gap-2 rounded-xl',
  lg: 'min-h-16 px-7 text-lg gap-2.5 rounded-2xl',
};

export function Boton({ variante = 'primario', tamano = 'md', icono: Icono, cargando = false, className = '', children, disabled, type = 'button', ...resto }) {
  return (
    <button
      type={type}
      disabled={disabled || cargando}
      className={`inline-flex items-center justify-center font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTES[variante]} ${TAMANOS[tamano]} ${className}`}
      {...resto}
    >
      {cargando ? <LoaderCircle className="size-5 shrink-0 animate-spin" aria-hidden /> : Icono ? <Icono className="size-5 shrink-0" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function Campo({ etiqueta, ayuda, error, opcional = false, className = '', children }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 flex items-baseline gap-2 text-[0.95rem] font-semibold text-cafe-800">
        {etiqueta}
        {opcional && <span className="font-normal text-cafe-500">(opcional)</span>}
      </label>
      {typeof children === 'function' ? children(id) : children}
      {ayuda && !error && <p className="mt-1.5 text-sm text-cafe-500">{ayuda}</p>}
      {error && (
        <p className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-peligro-700" role="alert">
          <CircleAlert className="size-4 shrink-0" aria-hidden /> {error}
        </p>
      )}
    </div>
  );
}

/** Campo de texto con etiqueta. Para montos se usa `prefijo` (C$, US$) o `sufijo` (lb, %). */
export function Entrada({ etiqueta, ayuda, error, opcional, className = '', prefijo, sufijo, onChange, ...resto }) {
  // Los montos se escriben como texto con teclado numérico: así se acepta tanto el punto como la
  // coma decimal (un campo type="number" queda vacío si el teclado y el idioma del navegador no coinciden).
  const esDecimal = resto.inputMode === 'decimal';
  const alCambiar =
    esDecimal && onChange
      ? (e) => {
          e.target.value = e.target.value.replace(/[^\d.,]/g, '');
          onChange(e);
        }
      : onChange;
  return (
    <Campo etiqueta={etiqueta} ayuda={ayuda} error={error} opcional={opcional} className={className}>
      {(id) => (
        <div className="relative">
          {prefijo && <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center font-semibold text-cafe-500">{prefijo}</span>}
          <input id={id} className={`control ${prefijo ? 'pl-14' : ''} ${sufijo ? 'pr-14' : ''}`} aria-invalid={Boolean(error)} autoComplete={esDecimal ? 'off' : undefined} {...resto} onChange={alCambiar} />
          {sufijo && <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center font-semibold text-cafe-500">{sufijo}</span>}
        </div>
      )}
    </Campo>
  );
}

export function Selector({ etiqueta, ayuda, error, opcional, className = '', children, ...resto }) {
  return (
    <Campo etiqueta={etiqueta} ayuda={ayuda} error={error} opcional={opcional} className={className}>
      {(id) => (
        <select id={id} className="control pr-10" {...resto}>
          {children}
        </select>
      )}
    </Campo>
  );
}

export function AreaTexto({ etiqueta, ayuda, error, opcional, className = '', ...resto }) {
  return (
    <Campo etiqueta={etiqueta} ayuda={ayuda} error={error} opcional={opcional} className={className}>
      {(id) => <textarea id={id} rows={3} className="control" {...resto} />}
    </Campo>
  );
}

/** Casilla grande con explicación, para opciones de sí o no. */
export function Casilla({ etiqueta, ayuda, checked, onChange, disabled }) {
  return (
    <label className={`flex cursor-pointer items-start gap-3.5 rounded-xl border border-hueso-300 bg-white p-4 transition hover:border-cafe-400 ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}>
      <input type="checkbox" className="mt-0.5 size-6 shrink-0 accent-caramelo-600" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block font-semibold text-cafe-900">{etiqueta}</span>
        {ayuda && <span className="mt-0.5 block text-sm text-cafe-500">{ayuda}</span>}
      </span>
    </label>
  );
}

/** Botones de opción en fila (una sola elección), más fáciles de acertar que una lista desplegable. */
export function Segmentado({ opciones, valor, alCambiar, etiqueta, nombre, className = '' }) {
  // Con muchas opciones, en pantallas angostas se acomodan de dos en dos para que el texto no se encime.
  const columnas = opciones.length > 3 ? 'grid-cols-2 sm:grid-cols-(--columnas)' : 'grid-cols-(--columnas)';
  // Como en cualquier grupo de opciones, las flechas del teclado pasan a la opción vecina.
  function alTeclear(e) {
    const paso = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!paso) return;
    e.preventDefault();
    const actual = opciones.findIndex((o) => o.valor === valor);
    const siguiente = opciones[(actual + paso + opciones.length) % opciones.length];
    alCambiar(siguiente.valor);
    e.currentTarget.querySelectorAll('[role=radio]')[opciones.indexOf(siguiente)]?.focus();
  }
  return (
    <div className={className}>
      {etiqueta && <p className="mb-1.5 text-[0.95rem] font-semibold text-cafe-800">{etiqueta}</p>}
      <div role="radiogroup" aria-label={etiqueta ?? nombre} onKeyDown={alTeclear} className={`grid gap-1.5 rounded-2xl bg-hueso-200 p-1.5 ${columnas}`} style={{ '--columnas': `repeat(${opciones.length}, minmax(0, 1fr))` }}>
        {opciones.map(({ valor: v, etiqueta: texto, icono: Icono }) => {
          const activo = v === valor;
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={activo}
              tabIndex={activo ? 0 : -1}
              onClick={() => alCambiar(v)}
              className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 py-1.5 text-center text-base font-semibold leading-tight transition ${activo ? 'bg-white text-cafe-900 shadow-sm ring-1 ring-hueso-400' : 'text-cafe-600 hover:text-cafe-900'}`}
            >
              {Icono && <Icono className="size-5 shrink-0" aria-hidden />}
              {texto}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Tarjeta({ titulo, descripcion, accion, className = '', relleno = true, children }) {
  return (
    <section className={`min-w-0 rounded-2xl border border-hueso-300 bg-white shadow-tarjeta ${className}`}>
      {(titulo || accion) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-hueso-200 px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-xl font-semibold text-cafe-900">{titulo}</h2>
            {descripcion && <p className="mt-0.5 text-sm text-cafe-500">{descripcion}</p>}
          </div>
          {accion}
        </header>
      )}
      <div className={relleno ? 'p-5 sm:p-6' : ''}>{children}</div>
    </section>
  );
}

export function Encabezado({ titulo, descripcion, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-3xl font-semibold text-cafe-900 sm:text-[2.1rem]">{titulo}</h1>
        {descripcion && <p className="mt-1.5 max-w-3xl text-cafe-600">{descripcion}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
    </div>
  );
}

const TONOS = {
  neutro: 'bg-hueso-200 text-cafe-700',
  verde: 'bg-hoja-100 text-hoja-800',
  ambar: 'bg-alerta-100 text-alerta-700',
  rojo: 'bg-peligro-100 text-peligro-700',
  azul: 'bg-info-100 text-info-700',
  caramelo: 'bg-caramelo-100 text-caramelo-700',
};

export function Insignia({ tono = 'neutro', icono: Icono, children, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-sm font-semibold ${TONOS[tono]} ${className}`}>
      {Icono && <Icono className="size-4 shrink-0" aria-hidden />}
      {children}
    </span>
  );
}

export const NIVELES = {
  OK: { texto: 'Suficiente', tono: 'verde', Icono: CircleCheck, barra: 'bg-hoja-600' },
  MEDIO: { texto: 'Stock medio', tono: 'ambar', Icono: TriangleAlert, barra: 'bg-alerta-600' },
  BAJO: { texto: 'Stock bajo', tono: 'rojo', Icono: CircleAlert, barra: 'bg-peligro-600' },
  AGOTADO: { texto: 'Agotado', tono: 'rojo', Icono: CircleX, barra: 'bg-peligro-600' },
};

/** Semáforo de inventario: color + ícono + palabra, para que nunca dependa solo del color. */
export function Semaforo({ nivel }) {
  const { texto, tono, Icono } = NIVELES[nivel] ?? NIVELES.OK;
  return (
    <Insignia tono={tono} icono={Icono}>
      {texto}
    </Insignia>
  );
}

export function Cargando({ texto = 'Cargando…' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-cafe-500" role="status">
      <LoaderCircle className="size-7 animate-spin" aria-hidden />
      <span className="text-lg">{texto}</span>
    </div>
  );
}

export function EstadoVacio({ icono: Icono, titulo, texto, children }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {Icono && (
        <span className="mb-4 flex size-16 items-center justify-center rounded-full bg-hueso-200 text-cafe-500">
          <Icono className="size-8" aria-hidden />
        </span>
      )}
      <p className="font-display text-xl font-semibold text-cafe-800">{titulo}</p>
      {texto && <p className="mt-1.5 max-w-md text-cafe-500">{texto}</p>}
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}

export function MensajeError({ mensaje, alReintentar }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-peligro-100 bg-peligro-50 px-5 py-4 text-peligro-700" role="alert">
      <CircleAlert className="size-6 shrink-0" aria-hidden />
      <p className="flex-1 font-medium">{mensaje}</p>
      {alReintentar && (
        <Boton variante="secundario" tamano="sm" onClick={alReintentar}>
          Reintentar
        </Boton>
      )}
    </div>
  );
}

/** Aviso fijo dentro de una pantalla (no desaparece solo). */
export function Nota({ tono = 'azul', icono: Icono = CircleAlert, titulo, children, className = '' }) {
  const clases = { azul: 'border-info-100 bg-info-50 text-info-700', ambar: 'border-alerta-100 bg-alerta-50 text-alerta-700', rojo: 'border-peligro-100 bg-peligro-50 text-peligro-700', verde: 'border-hoja-100 bg-hoja-50 text-hoja-800' };
  return (
    <div className={`flex gap-3 rounded-2xl border px-4 py-3.5 ${clases[tono]} ${className}`}>
      <Icono className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="text-[0.95rem] leading-relaxed">
        {titulo && <p className="font-semibold">{titulo}</p>}
        {children}
      </div>
    </div>
  );
}

const ANCHOS = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };

export function Modal({ abierto, titulo, descripcion, alCerrar, ancho = 'md', pie, children }) {
  const panel = useRef(null);
  const idTitulo = useId();

  useEffect(() => {
    if (!abierto) return undefined;
    const anterior = document.activeElement;
    const alTeclear = (e) => {
      if (e.key === 'Escape') alCerrar();
      if (e.key !== 'Tab' || !panel.current) return;
      // El foco da la vuelta dentro de la ventana: Tab no se escapa a la pantalla de atrás.
      const enfocables = [...panel.current.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])')];
      if (enfocables.length === 0) return;
      const primero = enfocables[0];
      const ultimo = enfocables.at(-1);
      if (e.shiftKey && (document.activeElement === primero || document.activeElement === panel.current)) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    };
    document.addEventListener('keydown', alTeclear);
    document.body.style.overflow = 'hidden';
    // El foco entra al diálogo para que el teclado y los lectores de pantalla sigan ahí.
    const primero = panel.current?.querySelector('[data-autofoco], input:not([type=hidden]), select, textarea');
    (primero ?? panel.current)?.focus();
    return () => {
      document.removeEventListener('keydown', alTeclear);
      document.body.style.overflow = '';
      anterior?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe correr al abrir o cerrar
  }, [abierto]);

  if (!abierto) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      {/* El fondo no cierra la ventana: un toque fuera por accidente no debe borrar lo que se estaba escribiendo. */}
      <div className="absolute inset-0 bg-cafe-950/55 backdrop-blur-[2px]" aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        tabIndex={-1}
        className={`aparecer relative flex max-h-[94dvh] w-full flex-col rounded-t-3xl bg-hueso-50 shadow-flotante outline-none sm:rounded-3xl ${ANCHOS[ancho]}`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-hueso-300 px-6 py-5">
          <div>
            <h2 id={idTitulo} className="text-2xl font-semibold text-cafe-900">
              {titulo}
            </h2>
            {descripcion && <p className="mt-1 text-cafe-600">{descripcion}</p>}
          </div>
          <button type="button" onClick={alCerrar} className="-m-1.5 flex size-11 shrink-0 items-center justify-center rounded-xl text-cafe-600 hover:bg-hueso-200" aria-label="Cerrar ventana">
            <X className="size-6" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {pie && <footer className="flex flex-wrap justify-end gap-3 border-t border-hueso-300 bg-hueso-100 px-6 py-4 sm:rounded-b-3xl">{pie}</footer>}
      </div>
    </div>
  );
}

/** Pregunta de confirmación en palabras sencillas antes de una acción importante. */
export function Confirmar({ abierto, titulo, children, textoConfirmar = 'Sí, continuar', variante = 'primario', cargando, alConfirmar, alCancelar }) {
  return (
    <Modal
      abierto={abierto}
      titulo={titulo}
      alCerrar={alCancelar}
      ancho="sm"
      pie={
        <>
          <Boton variante="secundario" onClick={alCancelar} data-autofoco>
            No, volver
          </Boton>
          <Boton variante={variante} cargando={cargando} onClick={alConfirmar}>
            {textoConfirmar}
          </Boton>
        </>
      }
    >
      <div className="text-lg leading-relaxed text-cafe-700">{children}</div>
    </Modal>
  );
}

/** Dato destacado: etiqueta arriba, cifra grande y una línea de contexto. */
export function Dato({ etiqueta, valor, detalle, icono: Icono, className = '' }) {
  return (
    <div className={`rounded-2xl border border-hueso-300 bg-white p-5 shadow-tarjeta ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[0.95rem] font-semibold text-cafe-600">{etiqueta}</p>
        {Icono && <Icono className="size-5 shrink-0 text-cafe-400" aria-hidden />}
      </div>
      <p className="mt-2 whitespace-nowrap font-display text-[1.75rem] font-semibold leading-tight text-cafe-900 tabular-nums">{valor}</p>
      {detalle && <div className="mt-1.5 text-sm text-cafe-500">{detalle}</div>}
    </div>
  );
}

/** Barra horizontal de proporción, con la cifra escrita al lado. */
export function BarraProporcion({ etiqueta, valorTexto, fraccion, detalle }) {
  const ancho = Math.max(0, Math.min(1, fraccion || 0)) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 font-medium leading-snug text-cafe-800">{etiqueta}</span>
        <span className="shrink-0 font-semibold tabular-nums text-cafe-900">{valorTexto}</span>
      </div>
      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-hueso-200">
        <div className="h-full rounded-full bg-caramelo-600" style={{ width: `${ancho}%` }} />
      </div>
      {detalle && <p className="mt-1 text-sm text-cafe-500">{detalle}</p>}
    </div>
  );
}
