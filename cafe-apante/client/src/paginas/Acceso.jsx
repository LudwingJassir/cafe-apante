import { Eye, EyeOff, LogIn } from 'lucide-react';
import { useState } from 'react';
import { useSesion } from '../contexto.jsx';
import { Marca } from '../Estructura.jsx';
import { Boton, Campo, Entrada, MensajeError } from '../ui.jsx';

const CLAVE_ULTIMO_USUARIO = 'apante:ultimo-usuario';

export default function Acceso() {
  const { entrar } = useSesion();
  const [usuario, setUsuario] = useState(() => localStorage.getItem(CLAVE_ULTIMO_USUARIO) ?? '');
  const [contrasena, setContrasena] = useState('');
  const [verClave, setVerClave] = useState(false);
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  async function alEnviar(e) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await entrar(usuario.trim(), contrasena);
      // Solo se recuerda el nombre de usuario, nunca la contraseña.
      localStorage.setItem(CLAVE_ULTIMO_USUARIO, usuario.trim());
    } catch (err) {
      setError(err.message);
      setContrasena('');
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

            {error && <MensajeError mensaje={error} />}

            <Boton type="submit" tamano="lg" icono={LogIn} cargando={enviando} disabled={!usuario.trim() || !contrasena} className="w-full">
              Entrar al sistema
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
