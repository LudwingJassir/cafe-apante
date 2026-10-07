import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, EVENTO_SESION_VENCIDA } from './api.js';

/* ───────────── Avisos breves (confirmaciones y errores) ───────────── */

const ContextoAvisos = createContext(null);
export const useAvisos = () => useContext(ContextoAvisos);

const ESTILO_AVISO = {
  exito: { clase: 'border-hoja-600 bg-hoja-50 text-hoja-800', Icono: CircleCheck },
  error: { clase: 'border-peligro-600 bg-peligro-50 text-peligro-700', Icono: CircleAlert },
  info: { clase: 'border-info-700 bg-info-50 text-info-700', Icono: Info },
};

export function ProveedorAvisos({ children }) {
  const [avisos, setAvisos] = useState([]);
  const siguiente = useRef(1);

  const quitar = useCallback((id) => setAvisos((lista) => lista.filter((a) => a.id !== id)), []);
  const mostrar = useCallback(
    (tipo, mensaje) => {
      const id = siguiente.current++;
      setAvisos((lista) => [...lista.slice(-2), { id, tipo, mensaje }]);
      // Los errores duran más: hay que alcanzar a leerlos con calma.
      setTimeout(() => quitar(id), tipo === 'error' ? 9000 : 5500);
    },
    [quitar],
  );
  const valor = useMemo(
    () => ({ exito: (m) => mostrar('exito', m), error: (m) => mostrar('error', m), info: (m) => mostrar('info', m) }),
    [mostrar],
  );

  return (
    <ContextoAvisos.Provider value={valor}>
      {children}
      <div className="no-imprimir pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-3 p-4 sm:items-end sm:p-6" aria-live="polite">
        {avisos.map(({ id, tipo, mensaje }) => {
          const { clase, Icono } = ESTILO_AVISO[tipo];
          return (
            <div key={id} role={tipo === 'error' ? 'alert' : 'status'} className={`aparecer pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border-l-[6px] px-4 py-3.5 shadow-flotante ${clase}`}>
              <Icono className="mt-0.5 size-6 shrink-0" aria-hidden />
              <p className="flex-1 text-base font-medium leading-snug">{mensaje}</p>
              <button type="button" onClick={() => quitar(id)} className="-m-2 flex size-11 shrink-0 items-center justify-center rounded-lg opacity-70 hover:opacity-100" aria-label="Cerrar aviso">
                <X className="size-5" />
              </button>
            </div>
          );
        })}
      </div>
    </ContextoAvisos.Provider>
  );
}

/* ───────────── Sesión, configuración pública y contador de notificaciones ───────────── */

const ContextoSesion = createContext(null);
export const useSesion = () => useContext(ContextoSesion);

const SEGUNDOS_ENTRE_CONSULTAS = 30;
const MINUTOS_SIN_USO = 30;

export function ProveedorSesion({ children }) {
  const avisos = useAvisos();
  const [usuario, setUsuario] = useState(undefined); // undefined = todavía verificando
  const [config, setConfig] = useState(undefined); // undefined = cargando, null = falló la carga
  const [conteo, setConteo] = useState({ sinLeer: 0, criticas: 0 });

  const refrescarNotificaciones = useCallback(async () => {
    try {
      setConteo(await api('/notificaciones/conteo'));
    } catch {
      // El contador es informativo: si falla una consulta se intenta en la siguiente.
    }
  }, []);

  const cargarConfig = useCallback(async () => {
    try {
      setConfig(await api('/config'));
    } catch {
      setConfig(null);
    }
  }, []);

  useEffect(() => {
    api('/auth/yo')
      .then(setUsuario)
      .catch(() => setUsuario(null));
    const alVencer = () => setUsuario(null);
    window.addEventListener(EVENTO_SESION_VENCIDA, alVencer);
    return () => window.removeEventListener(EVENTO_SESION_VENCIDA, alVencer);
  }, []);

  const listo = Boolean(usuario) && !usuario.debeCambiarContrasena;
  useEffect(() => {
    if (!listo) return undefined;
    cargarConfig();
    refrescarNotificaciones();
    const reloj = setInterval(refrescarNotificaciones, SEGUNDOS_ENTRE_CONSULTAS * 1000);
    return () => clearInterval(reloj);
  }, [listo, cargarConfig, refrescarNotificaciones]);

  const entrar = useCallback(async (nombreUsuario, contrasena) => {
    const datos = await api('/auth/login', { metodo: 'POST', cuerpo: { usuario: nombreUsuario, contrasena } });
    setUsuario(datos);
    return datos;
  }, []);

  const salir = useCallback(async () => {
    try {
      await api('/auth/logout', { metodo: 'POST' });
    } catch {
      // Sin conexión no se pudo avisar al servidor: la sesión termina al cerrar el navegador.
      avisos.error('No se pudo confirmar el cierre de sesión. Cierre el navegador para terminarla por completo.');
    } finally {
      setUsuario(null);
      setConfig(undefined);
    }
  }, [avisos]);

  // La laptop es compartida: si nadie toca el sistema durante un rato, la sesión se cierra sola
  // para que la siguiente persona no quede trabajando con el usuario (y los permisos) de otra.
  const haySesion = Boolean(usuario);
  useEffect(() => {
    if (!haySesion) return undefined;
    let ultimoUso = Date.now();
    const anotarUso = () => {
      ultimoUso = Date.now();
    };
    const eventos = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
    eventos.forEach((evento) => window.addEventListener(evento, anotarUso, { passive: true }));
    const reloj = setInterval(() => {
      if (Date.now() - ultimoUso < MINUTOS_SIN_USO * 60 * 1000) return;
      avisos.info(`Por seguridad, la sesión se cerró tras ${MINUTOS_SIN_USO} minutos sin uso.`);
      salir();
    }, 30 * 1000);
    return () => {
      eventos.forEach((evento) => window.removeEventListener(evento, anotarUso));
      clearInterval(reloj);
    };
  }, [haySesion, salir, avisos]);

  const valor = useMemo(
    () => ({ usuario, setUsuario, config, cargarConfig, conteo, refrescarNotificaciones, entrar, salir }),
    [usuario, config, cargarConfig, conteo, refrescarNotificaciones, entrar, salir],
  );
  return <ContextoSesion.Provider value={valor}>{children}</ContextoSesion.Provider>;
}
