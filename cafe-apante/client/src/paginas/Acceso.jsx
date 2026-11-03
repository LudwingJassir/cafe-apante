import { Eye, EyeOff, Lock, LogIn } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSesion } from '../contexto.jsx';
import { Marca } from '../Estructura.jsx';
import { Boton, Campo, Entrada, MensajeError } from '../ui.jsx';

const CLAVE_ULTIMO_USUARIO = 'apante:ultimo-usuario';
const CLAVE_BLOQUEO = (usuario) => `apante:bloqueo:${usuario.trim().toLowerCase()}`;

/** Hora (ms) hasta la que este usuario está bloqueado en este navegador; 0 si no lo está. Sobrevive a una recarga. */
function leerBloqueo(usuario) {
  try {
    const hasta = Number(sessionStorage.getItem(CLAVE_BLOQUEO(usuario)));
    return hasta > Date.now() ? hasta : 0;
  } catch {
    return 0;
  }
}

function guardarBloqueo(usuario, hasta) {
  try {
    if (hasta) sessionStorage.setItem(CLAVE_BLOQUEO(usuario), String(hasta));
    else sessionStorage.removeItem(CLAVE_BLOQUEO(usuario));
  } catch {
    // Sin almacenamiento el aviso funciona igual; el servidor mantiene el bloqueo de todas formas.
  }
}

const minutosYSegundos = (segundos) => `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, '0')}`;

function AvisoBloqueo({ segundos }) {
  return (
    <div className="rounded-2xl border-2 border-peligro-600 bg-peligro-50 p-5 text-peligro-700">
      <div className="flex gap-3">
        <Lock className="mt-0.5 size-7 shrink-0" aria-hidden />
        <div>
          <p className="text-lg font-bold" role="alert">
            Ingreso bloqueado por seguridad
          </p>
          <p className="mt-1">Hubo demasiados intentos con una contraseña incorrecta. No se puede ingresar la contraseña durante:</p>
          <p className="mt-2 font-display text-4xl font-semibold tabular-nums">{minutosYSegundos(segundos)}</p>
          <p className="mt-2 text-sm">Si olvidó su contraseña, pídale al Dueño / Administrador que se la restablezca.</p>
        </div>
      </div>
    </div>
  );
}

export default function Acceso() {
  const { entrar } = useSesion();
  const [usuario, setUsuario] = useState(() => localStorage.getItem(CLAVE_ULTIMO_USUARIO) ?? '');
  const [contrasena, setContrasena] = useState('');
  const [verClave, setVerClave] = useState(false);
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [bloqueadoHasta, setBloqueadoHasta] = useState(() => leerBloqueo(usuario));
  const [ahora, setAhora] = useState(() => Date.now());

  // Cada usuario tiene su propio bloqueo: al cambiar el nombre se muestra el que le corresponda.
  useEffect(() => {
    setBloqueadoHasta(leerBloqueo(usuario));
  }, [usuario]);

  // Cuenta regresiva: cuando llega a cero, el campo de contraseña se habilita solo.
  useEffect(() => {
    if (!bloqueadoHasta) return undefined;
    const reloj = setInterval(() => {
      const momento = Date.now();
      setAhora(momento);
      if (momento >= bloqueadoHasta) {
        setBloqueadoHasta(0);
        guardarBloqueo(usuario, 0);
        setError(null);
      }
    }, 1000);
    return () => clearInterval(reloj);
  }, [bloqueadoHasta, usuario]);

  const segundosBloqueo = bloqueadoHasta ? Math.max(0, Math.ceil((bloqueadoHasta - ahora) / 1000)) : 0;
  const bloqueado = segundosBloqueo > 0;

  async function alEnviar(e) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await entrar(usuario.trim(), contrasena);
      // Solo se recuerda el nombre de usuario, nunca la contraseña.
      localStorage.setItem(CLAVE_ULTIMO_USUARIO, usuario.trim());
    } catch (err) {
      setContrasena('');
      if (err.estado === 429 && err.datos.segundosRestantes) {
        const hasta = Date.now() + err.datos.segundosRestantes * 1000;
        guardarBloqueo(usuario, hasta);
        setAhora(Date.now());
        setBloqueadoHasta(hasta);
        setError(null);
      } else {
        setError(err.message);
      }
    } finally {
      setEnviando(false);
    }
  }

  // En pantallas angostas el panel verde va debajo del formulario y ocupa lo que sobra de alto.
  return (
    <div className="grid min-h-dvh grid-rows-[auto_1fr] bg-hueso-50 lg:grid-cols-2 lg:grid-rows-1">
      <main className="flex flex-col px-6 py-8 sm:px-12 lg:px-16 lg:py-12">
        <Marca claro />

        <div className="flex flex-1 items-center py-8">
          <div className="w-full max-w-md">
            <h1 className="text-[1.333rem] font-semibold leading-tight text-cafe-900 sm:text-[1.75rem]">Bienvenido</h1>
            <p className="mt-2 text-lg text-cafe-700">Escriba su usuario y su contraseña para entrar.</p>

            <form onSubmit={alEnviar} className="mt-8 space-y-5" noValidate>
              <Entrada
                etiqueta="Usuario"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus={!usuario}
                required
              />
              <Campo etiqueta="Contraseña">
                {(id) => (
                  <div className="relative">
                    <input
                      id={id}
                      className="control pr-32"
                      type={verClave ? 'text' : 'password'}
                      value={contrasena}
                      onChange={(e) => setContrasena(e.target.value)}
                      autoComplete="current-password"
                      autoFocus={Boolean(usuario)}
                      disabled={bloqueado}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setVerClave((v) => !v)}
                      className="absolute inset-y-1.5 right-1.5 flex items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-cafe-600 hover:bg-hueso-200"
                    >
                      {verClave ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
                      {verClave ? 'Ocultar' : 'Mostrar'}
                    </button>
                  </div>
                )}
              </Campo>

              {bloqueado ? <AvisoBloqueo segundos={segundosBloqueo} /> : error && <MensajeError mensaje={error} />}

              <Boton type="submit" tamano="lg" icono={bloqueado ? Lock : LogIn} cargando={enviando} disabled={bloqueado || !usuario.trim() || !contrasena} className="w-full">
                {bloqueado ? `Espere ${minutosYSegundos(segundosBloqueo)}` : 'Entrar al sistema'}
              </Boton>
            </form>
          </div>
        </div>

        <p className="max-w-md text-cafe-700">¿Olvidó su contraseña? Pídale al Dueño / Administrador que se la restablezca.</p>
      </main>

      <Origen />
    </div>
  );
}

/**
 * Las montañas del logo, grandes y en crema sobre el verde de la marca: el mismo cerro de Apante
 * que lleva cada bolsa. La nieve queda calada en verde, como en el logo.
 */
function Origen() {
  return (
    <aside className="flex flex-col overflow-hidden bg-bosque-600 px-6 pt-12 sm:px-12 lg:px-16 lg:pt-16" aria-label="Café Apante">
      <p className="max-w-[26rem] font-display text-[1.333rem] font-semibold leading-[1.2] text-hueso-50 sm:text-[2rem] sm:leading-[1.15]">La pasión cafetalera de la Perla del Septentrión.</p>
      <p className="mt-4 max-w-[26rem] text-lg leading-relaxed text-bosque-50 sm:mt-5">Café de altura cultivado en las montañas de Matagalpa, en Apante, a 850 metros sobre el nivel del mar.</p>

      {/* El cerro se recorta contra el borde derecho y el de abajo, como un horizonte. */}
      <div className="relative -ml-6 -mr-10 mt-10 min-h-72 flex-1 sm:-ml-12 lg:-ml-16 lg:-mr-28 lg:mt-12 lg:min-h-60">
        <svg viewBox="0 0 134 131" preserveAspectRatio="xMaxYMax meet" className="absolute inset-0 size-full" aria-hidden>
          <path
            d="M3.3 130.8 55.5 36.7 70 61.3 102 2.5l31.3 59.2-15 20.3L102 55 82.5 87.5l32.8.5-2.3 17H86.7l14.1 25.8H63.7l14.6-25.5h-5l-14.1 25.5Z"
            fill="#fdfbf7"
          />
          <path d="M55.5 54.2 69.7 78.3l-8-2-5.9 8.7-5.8-8.7-8.3 2.9ZM102 20l14.7 25.8-11.4-3.8-4 8-5-8-9.3 3.3Z" fill="#1e5631" />
        </svg>
      </div>
    </aside>
  );
}
