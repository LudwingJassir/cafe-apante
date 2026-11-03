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

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-md">
          <Marca claro />
          <h1 className="mt-10 text-4xl font-semibold text-cafe-900">Bienvenido</h1>
          <p className="mt-2 text-lg text-cafe-600">Escriba su usuario y su contraseña para entrar.</p>

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

          <p className="mt-8 text-sm text-cafe-500">¿Olvidó su contraseña? Pídale al Dueño / Administrador que se la restablezca.</p>
        </div>
      </div>

      <div className="relative hidden overflow-hidden bg-cafe-900 lg:block">
        <svg className="absolute inset-0 size-full" viewBox="0 0 800 900" preserveAspectRatio="xMidYMax slice" aria-hidden>
          <path d="M0 640 150 470l90 80 150-230 130 170 90-90 190 240v260H0Z" fill="#33241b" />
          <path d="M0 740 210 560l110 90 170-190 150 160 160-70v350H0Z" fill="#463328" />
          <circle cx="610" cy="210" r="74" fill="#b8702a" opacity="0.9" />
        </svg>
        <div className="relative flex h-full flex-col justify-between p-14 text-hueso-50">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-caramelo-400">Café de altura · Nicaragua</p>
          <div>
            <p className="max-w-lg font-display text-5xl font-semibold leading-[1.1]">Del cerro a la taza, con cada libra en orden.</p>
            <p className="mt-5 max-w-md text-lg text-cafe-300">Caja, inventario, clientes e impuestos de Café Apante en un solo lugar.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
