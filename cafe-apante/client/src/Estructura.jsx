import { ALargeSmall, Bell, CheckCheck, KeyRound, LogOut, Menu, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from './api.js';
import { useSesion } from './contexto.jsx';
import { haceCuanto, NOMBRE_ROL } from './formato.js';
import { menuPara } from './menu.js';
import { Boton, ESTILO_NIVEL } from './ui.jsx';


export function Marca({ claro = false }) {
  return (
    <span className="flex items-center gap-3">
      <svg viewBox="0 0 64 64" className="size-11 shrink-0" aria-hidden>
        <rect width="64" height="64" rx="16" fill={claro ? '#261a14' : '#f8f4ec'} fillOpacity={claro ? 1 : 0.08} />
        <path d="M32 12c-11 0-19 9-19 20s8 20 19 20 19-9 19-20-8-20-19-20Z" fill="#b8702a" />
        <path d="M38 14c-9 7-4 15-8 21-3 5-9 6-12 12" fill="none" stroke={claro ? '#261a14' : '#261a14'} strokeWidth="4" strokeLinecap="round" />
      </svg>
      <span className="leading-tight">
        <span className={`block font-display text-[1.45rem] font-semibold ${claro ? 'text-cafe-900' : 'text-hueso-50'}`}>Café Apante</span>
        <span className={`block text-[0.8rem] tracking-wide ${claro ? 'text-cafe-500' : 'text-cafe-300'}`}>Caja e Inventario</span>
      </span>
    </span>
  );
}

function BarraLateral({ alNavegar }) {
  const { usuario, conteo, salir } = useSesion();
  const navegar = useNavigate();
  const grupos = menuPara(usuario.rol);

  return (
    <div className="flex h-full flex-col bg-cafe-900 text-hueso-100">
      <div className="px-5 pb-4 pt-6">
        <Marca />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Menú principal">
        {grupos.map((grupo) => (
          <div key={grupo.grupo} className="mt-4 first:mt-1">
            <p className="px-3 pb-1.5 text-[0.78rem] font-semibold uppercase tracking-[0.12em] text-cafe-300">{grupo.grupo}</p>
            <ul className="space-y-1">
              {grupo.items.map(({ ruta, etiqueta, icono: Icono, contador }) => (
                <li key={ruta}>
                  <NavLink
                    to={ruta}
                    onClick={alNavegar}
                    className={({ isActive }) =>
                      `flex min-h-12 items-center gap-3 rounded-xl px-3 text-[1.02rem] font-medium transition ${
                        isActive ? 'bg-hueso-100 text-cafe-900 shadow-sm' : 'text-hueso-200 hover:bg-white/10 hover:text-white'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icono className={`size-[1.35rem] shrink-0 ${isActive ? 'text-caramelo-600' : 'text-cafe-300'}`} aria-hidden />
                        <span className="flex-1">{etiqueta}</span>
                        {contador && conteo.sinLeer > 0 && (
                          <span className={`min-w-7 rounded-full px-2 py-0.5 text-center text-sm font-bold ${conteo.criticas > 0 ? 'bg-peligro-600 text-white' : 'bg-caramelo-600 text-white'}`}>
                            {conteo.sinLeer > 99 ? '99+' : conteo.sinLeer}
                            <span className="sr-only"> sin leer</span>
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 p-4">
        <p className="truncate font-semibold text-hueso-50">{usuario.nombre}</p>
        <p className="truncate text-sm text-cafe-300">{NOMBRE_ROL[usuario.rol]}</p>
        <div className="mt-3 grid gap-2">
          <button type="button" onClick={() => { alNavegar?.(); navegar('/mi-clave'); }} className="flex min-h-11 items-center gap-2.5 rounded-xl px-3 text-[0.95rem] font-medium text-hueso-200 hover:bg-white/10">
            <KeyRound className="size-5 text-cafe-300" aria-hidden /> Cambiar mi contraseña
          </button>
          <button type="button" onClick={salir} className="flex min-h-11 items-center gap-2.5 rounded-xl bg-white/10 px-3 text-[0.95rem] font-semibold text-hueso-50 hover:bg-white/20">
            <LogOut className="size-5" aria-hidden /> Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}

/** Campana con las últimas notificaciones sin leer. El panel completo está en /notificaciones. */
function Campana() {
  const { conteo, refrescarNotificaciones } = useSesion();
  const [abierta, setAbierta] = useState(false);
  const [recientes, setRecientes] = useState([]);
  const contenedor = useRef(null);
  const ubicacion = useLocation();

  useEffect(() => setAbierta(false), [ubicacion.pathname]);

  useEffect(() => {
    if (!abierta) return undefined;
    api('/notificaciones?soloNoLeidas=1&limite=6').then(setRecientes).catch(() => setRecientes([]));
    const alPulsarFuera = (e) => {
      if (!contenedor.current?.contains(e.target)) setAbierta(false);
    };
    const alTeclear = (e) => e.key === 'Escape' && setAbierta(false);
    document.addEventListener('mousedown', alPulsarFuera);
    document.addEventListener('keydown', alTeclear);
    return () => {
      document.removeEventListener('mousedown', alPulsarFuera);
      document.removeEventListener('keydown', alTeclear);
    };
  }, [abierta]);

  async function leerTodas() {
    await api('/notificaciones/leer-todas', { metodo: 'POST' }).catch(() => {});
    setRecientes([]);
    refrescarNotificaciones();
  }

  return (
    <div className="relative" ref={contenedor}>
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
        aria-label={conteo.sinLeer > 0 ? `Notificaciones: ${conteo.sinLeer} sin leer` : 'Notificaciones'}
        className="relative flex min-h-12 items-center gap-2 rounded-xl border border-hueso-300 bg-white px-3.5 font-semibold text-cafe-800 shadow-sm hover:border-cafe-400"
      >
        <Bell className="size-[1.4rem]" aria-hidden />
        <span className="hidden sm:inline">Notificaciones</span>
        {conteo.sinLeer > 0 && (
          <span className={`min-w-7 rounded-full px-2 py-0.5 text-center text-sm font-bold text-white ${conteo.criticas > 0 ? 'bg-peligro-600' : 'bg-caramelo-600'}`}>{conteo.sinLeer > 99 ? '99+' : conteo.sinLeer}</span>
        )}
      </button>

      {abierta && (
        <div className="aparecer absolute right-0 z-40 mt-2 w-[min(26rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-hueso-300 bg-white shadow-flotante">
          <div className="flex items-center justify-between gap-3 border-b border-hueso-200 px-4 py-3">
            <p className="font-display text-lg font-semibold">Sin leer</p>
            {recientes.length > 0 && (
              <button type="button" onClick={leerTodas} className="flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-caramelo-700 hover:bg-caramelo-50">
                <CheckCheck className="size-4" aria-hidden /> Marcar todas como leídas
              </button>
            )}
          </div>
          <ul className="max-h-[22rem] divide-y divide-hueso-200 overflow-y-auto">
            {recientes.length === 0 && <li className="px-4 py-8 text-center text-cafe-500">No tiene notificaciones pendientes.</li>}
            {recientes.map((n) => {
              const { Icono, color } = ESTILO_NIVEL[n.nivel];
              return (
                <li key={n.idNotificacion} className="flex gap-3 px-4 py-3">
                  <Icono className={`mt-0.5 size-5 shrink-0 ${color}`} aria-hidden />
                  <div className="min-w-0">
                    <p className="font-semibold leading-snug text-cafe-900">{n.titulo}</p>
                    <p className="mt-0.5 line-clamp-2 text-sm text-cafe-600 [overflow-wrap:anywhere]">{n.mensaje}</p>
                    <p className="mt-1 text-xs text-cafe-500">{haceCuanto(n.fecha)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          <Link to="/notificaciones" className="block border-t border-hueso-200 bg-hueso-50 px-4 py-3 text-center font-semibold text-cafe-800 hover:bg-hueso-200">
            Ver todas las notificaciones
          </Link>
        </div>
      )}
    </div>
  );
}

export const CLAVE_LETRA = 'apante:letra';

function BotonLetra() {
  const [grande, setGrande] = useState(() => localStorage.getItem(CLAVE_LETRA) === 'grande');
  useEffect(() => {
    document.documentElement.classList.toggle('letra-grande', grande);
    localStorage.setItem(CLAVE_LETRA, grande ? 'grande' : 'normal');
  }, [grande]);
  return (
    <button
      type="button"
      onClick={() => setGrande((v) => !v)}
      aria-pressed={grande}
      className="flex min-h-12 items-center gap-2 rounded-xl border border-hueso-300 bg-white px-3.5 font-semibold text-cafe-800 shadow-sm hover:border-cafe-400"
      title="Cambiar el tamaño de la letra"
    >
      <ALargeSmall className="size-[1.4rem]" aria-hidden />
      <span className="sr-only md:not-sr-only">{grande ? 'Letra normal' : 'Letra más grande'}</span>
    </button>
  );
}

export default function Estructura() {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const ubicacion = useLocation();
  const botonCerrar = useRef(null);
  useEffect(() => setMenuAbierto(false), [ubicacion.pathname]);

  // El menú del celular se comporta como una ventana: recibe el foco y se cierra con Escape.
  useEffect(() => {
    if (!menuAbierto) return undefined;
    botonCerrar.current?.focus();
    const alTeclear = (e) => e.key === 'Escape' && setMenuAbierto(false);
    document.addEventListener('keydown', alTeclear);
    return () => document.removeEventListener('keydown', alTeclear);
  }, [menuAbierto]);

  return (
    <div className="min-h-dvh lg:pl-64">
      <aside className="no-imprimir fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
        <BarraLateral />
      </aside>

      {menuAbierto && (
        <div className="no-imprimir fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menú principal">
          <div className="absolute inset-0 bg-cafe-950/60" onClick={() => setMenuAbierto(false)} aria-hidden />
          <aside className="aparecer absolute inset-y-0 left-0 w-[min(19rem,88vw)] shadow-flotante">
            <BarraLateral alNavegar={() => setMenuAbierto(false)} />
          </aside>
          <button ref={botonCerrar} type="button" onClick={() => setMenuAbierto(false)} className="absolute right-3 top-3 flex size-12 items-center justify-center rounded-xl bg-hueso-50 text-cafe-900" aria-label="Cerrar menú">
            <X className="size-6" />
          </button>
        </div>
      )}

      <header className="no-imprimir sticky top-0 z-20 flex items-center gap-3 border-b border-hueso-300 bg-hueso-100/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
        <Boton variante="secundario" icono={Menu} className="shrink-0 lg:hidden" onClick={() => setMenuAbierto(true)}>
          Menú
        </Boton>
        <div className="flex-1" />
        <BotonLetra />
        <Campana />
      </header>

      <main className="mx-auto w-full max-w-[92rem] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <Outlet />
      </main>
    </div>
  );
}
