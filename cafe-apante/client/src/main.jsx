import '@fontsource-variable/source-sans-3';
import '@fontsource-variable/fraunces';
import { Component, lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProveedorAvisos, ProveedorSesion, useSesion } from './contexto.jsx';
import './estilos.css';
import Estructura, { CLAVE_LETRA } from './Estructura.jsx';
import { INICIO_POR_ROL, puedeEntrar } from './menu.js';
import Acceso from './paginas/Acceso.jsx';
import MiClave from './paginas/MiClave.jsx';
import { Boton, Cargando } from './ui.jsx';

// La preferencia de letra grande se aplica desde el arranque, también en la pantalla de acceso.
document.documentElement.classList.toggle('letra-grande', localStorage.getItem(CLAVE_LETRA) === 'grande');

// Cada pantalla se descarga cuando se abre, para que el inicio sea rápido.
const PANTALLAS = {
  '/dashboard': lazy(() => import('./paginas/Dashboard.jsx')),
  '/caja': lazy(() => import('./paginas/Caja.jsx')),
  '/ventas': lazy(() => import('./paginas/Ventas.jsx')),
  '/arqueo': lazy(() => import('./paginas/Arqueo.jsx')),
  '/clientes': lazy(() => import('./paginas/Clientes.jsx')),
  '/inventario': lazy(() => import('./paginas/Inventario.jsx')),
  '/productos': lazy(() => import('./paginas/Productos.jsx')),
  '/proyeccion': lazy(() => import('./paginas/Proyeccion.jsx')),
  '/impuestos': lazy(() => import('./paginas/Impuestos.jsx')),
  '/gastos': lazy(() => import('./paginas/Gastos.jsx')),
  '/notificaciones': lazy(() => import('./paginas/Notificaciones.jsx')),
  '/usuarios': lazy(() => import('./paginas/Usuarios.jsx')),
  '/configuracion': lazy(() => import('./paginas/Configuracion.jsx')),
};

/**
 * Si una pantalla falla al dibujarse (por ejemplo, una pestaña vieja tras actualizar el sistema),
 * se muestra una salida clara en lugar de dejar la página en blanco.
 */
class Salvavidas extends Component {
  state = { fallo: false };

  static getDerivedStateFromError() {
    return { fallo: true };
  }

  componentDidCatch(error) {
    console.error('[pantalla]', error);
  }

  render() {
    if (!this.state.fallo) return this.props.children;
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-hueso-300 bg-white p-8 text-center shadow-tarjeta" role="alert">
          <h1 className="text-2xl font-semibold text-cafe-900">Esta pantalla tuvo un problema</h1>
          <p className="mt-2 text-lg text-cafe-600">Sus datos están a salvo. Vuelva a cargar el sistema para continuar.</p>
          <Boton tamano="lg" className="mt-6 w-full" onClick={() => window.location.reload()}>
            Volver a cargar
          </Boton>
        </div>
      </div>
    );
  }
}

function Rutas() {
  const { usuario } = useSesion();
  if (usuario === undefined) return <Cargando texto="Abriendo el sistema…" />;
  if (!usuario) return <Acceso />;
  // Con contraseña temporal no se entra a ningún módulo hasta cambiarla.
  if (usuario.debeCambiarContrasena) return <MiClave obligatorio />;

  const inicio = INICIO_POR_ROL[usuario.rol];
  return (
    <Routes>
      <Route element={<Estructura />}>
        {Object.entries(PANTALLAS).map(([ruta, Pantalla]) => (
          <Route
            key={ruta}
            path={ruta}
            element={
              // La barra lateral ya oculta lo que el rol no puede ver; esto cubre quien escribe la dirección a mano.
              puedeEntrar(usuario.rol, ruta) ? (
                <Suspense fallback={<Cargando />}>
                  <Pantalla />
                </Suspense>
              ) : (
                <Navigate to={inicio} replace />
              )
            }
          />
        ))}
        <Route path="/mi-clave" element={<MiClave />} />
        <Route path="*" element={<Navigate to={inicio} replace />} />
      </Route>
    </Routes>
  );
}

createRoot(document.getElementById('raiz')).render(
  <StrictMode>
    <Salvavidas>
      <BrowserRouter>
        <ProveedorAvisos>
          <ProveedorSesion>
            <Rutas />
          </ProveedorSesion>
        </ProveedorAvisos>
      </BrowserRouter>
    </Salvavidas>
  </StrictMode>,
);
