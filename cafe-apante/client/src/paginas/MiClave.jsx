import { KeyRound, LogOut } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAvisos, useSesion } from '../contexto.jsx';
import { Marca } from '../Estructura.jsx';
import { Boton, Encabezado, Entrada, MensajeError, Nota, Tarjeta } from '../ui.jsx';

function Formulario({ alTerminar }) {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [verClaves, setVerClaves] = useState(false);
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const noCoinciden = repetida.length > 0 && nueva !== repetida;
  const tipo = verClaves ? 'text' : 'password';

  async function alEnviar(e) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await api('/auth/cambiar-contrasena', { metodo: 'POST', cuerpo: { actual, nueva } });
      alTerminar();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={alEnviar} className="space-y-5" noValidate>
      <Entrada etiqueta="Contraseña actual" type={tipo} value={actual} onChange={(e) => setActual(e.target.value)} autoComplete="current-password" required />
      <Entrada etiqueta="Contraseña nueva" type={tipo} value={nueva} onChange={(e) => setNueva(e.target.value)} autoComplete="new-password" ayuda="Al menos 8 caracteres, con letras y números, y sin su nombre de usuario." required />
      <Entrada etiqueta="Repita la contraseña nueva" type={tipo} value={repetida} onChange={(e) => setRepetida(e.target.value)} autoComplete="new-password" error={noCoinciden ? 'Las dos contraseñas no son iguales.' : null} required />
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-cafe-700">
        <input type="checkbox" className="size-5 accent-caramelo-600" checked={verClaves} onChange={(e) => setVerClaves(e.target.checked)} />
        Mostrar lo que escribo
      </label>
      {error && <MensajeError mensaje={error} />}
      <Boton type="submit" tamano="lg" icono={KeyRound} cargando={enviando} disabled={!actual || nueva.length < 8 || nueva !== repetida} className="w-full sm:w-auto">
        Guardar contraseña nueva
      </Boton>
    </form>
  );
}

export default function MiClave({ obligatorio = false }) {
  const { usuario, setUsuario, salir } = useSesion();
  const avisos = useAvisos();
  const navegar = useNavigate();

  function alTerminar() {
    avisos.exito('Su contraseña se cambió correctamente.');
    setUsuario({ ...usuario, debeCambiarContrasena: false });
    if (!obligatorio) navegar('/');
  }

  if (obligatorio) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-5 py-10">
        <div className="w-full max-w-lg">
          <Marca claro />
          <h1 className="mt-8 text-3xl font-semibold text-cafe-900">Elija su contraseña</h1>
          <p className="mt-2 text-lg text-cafe-600">
            Hola, {usuario.nombre}. Está usando una contraseña temporal. Por seguridad, cámbiela por una que solo usted conozca.
          </p>
          <div className="mt-7 rounded-2xl border border-hueso-300 bg-white p-6 shadow-tarjeta">
            <Formulario alTerminar={alTerminar} />
          </div>
          <Boton variante="fantasma" icono={LogOut} onClick={salir} className="mt-4">
            Salir y entrar con otro usuario
          </Boton>
        </div>
      </div>
    );
  }

  return (
    <>
      <Encabezado titulo="Cambiar mi contraseña" descripcion="Use una contraseña que solo usted conozca. No la comparta, aunque usen la misma laptop." />
      <Tarjeta className="max-w-xl">
        <Formulario alTerminar={alTerminar} />
      </Tarjeta>
      <Nota className="mt-5 max-w-xl" titulo="Consejo">
        Si olvida su contraseña, el Dueño / Administrador puede darle una temporal desde «Usuarios y permisos».
      </Nota>
    </>
  );
}
