import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { autenticar, exigirEncabezadoPropio, permitir } from './auth.js';
import { RAIZ } from './config.js';
import rutasAuth from './rutas/auth.js';
import rutasCaja from './rutas/caja.js';
import rutasClientes from './rutas/clientes.js';
import rutasConfig from './rutas/config.js';
import rutasDashboard from './rutas/dashboard.js';
import rutasFinanzas from './rutas/finanzas.js';
import rutasInventario from './rutas/inventario.js';
import rutasNotificaciones from './rutas/notificaciones.js';
import rutasProductos from './rutas/productos.js';
import rutasUsuarios from './rutas/usuarios.js';
import rutasVentas from './rutas/ventas.js';
import { ErrorApp } from './util.js';

/** Con contraseña temporal solo se puede cambiarla: nada más del sistema responde. */
function exigirContrasenaPropia(req, _res, next) {
  if (req.usuario.debeCambiarContrasena) throw new ErrorApp(403, 'Debe cambiar su contraseña temporal antes de continuar.');
  next();
}

export function crearApp() {
  const app = express();
  app.disable('x-powered-by');

  app.use(
    helmet({
      // El sistema se sirve por HTTP en la red local: no se fuerza HTTPS.
      hsts: false,
      crossOriginOpenerPolicy: false,
      originAgentCluster: false,
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"], // los gráficos aplican estilos en línea
          imgSrc: ["'self'", 'data:'], // el código QR se genera como imagen data:
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
    }),
  );
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());

  const api = express.Router();
  api.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  api.use(exigirEncabezadoPropio);
  api.use('/auth', rutasAuth);
  api.use(autenticar, exigirContrasenaPropia);

  // Control de acceso por rol (RBAC): cada módulo declara quién puede entrar.
  api.use('/usuarios', permitir('ADMIN'), rutasUsuarios);
  api.use('/productos', rutasProductos); // lectura para todos; escritura solo ADMIN (dentro del router)
  api.use('/inventario', permitir('ADMIN', 'PRODUCCION'), rutasInventario);
  api.use('/clientes', permitir('ADMIN', 'VENTAS'), rutasClientes);
  api.use('/caja', permitir('ADMIN', 'VENTAS'), rutasCaja);
  api.use('/ventas', permitir('ADMIN', 'VENTAS'), rutasVentas);
  api.use('/notificaciones', rutasNotificaciones);
  api.use('/config', rutasConfig);
  api.use('/finanzas', permitir('ADMIN'), rutasFinanzas);
  api.use('/analisis', rutasDashboard); // /dashboard solo ADMIN; /proyeccion ADMIN y PRODUCCION
  api.use((_req, _res) => {
    throw new ErrorApp(404, 'Recurso no encontrado.');
  });
  app.use('/api', api);

  // Interfaz compilada (npm run build). En desarrollo la sirve Vite.
  const dist = path.join(RAIZ, 'dist');
  if (existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      res.set('Cache-Control', 'no-cache');
      res.sendFile(path.join(dist, 'index.html'));
    });
  }

  // eslint-disable-next-line no-unused-vars -- Express reconoce el manejador de errores por sus 4 parámetros
  app.use((error, _req, res, _next) => {
    if (error instanceof ErrorApp) return res.status(error.estado).json({ error: error.message });
    if (error.type === 'entity.parse.failed' || error.type === 'entity.too.large') {
      return res.status(400).json({ error: 'No se pudieron leer los datos enviados.' });
    }
    console.error('[error]', error);
    res.status(500).json({ error: 'Ocurrió un problema inesperado. Intente de nuevo; si continúa, avise al administrador.' });
  });

  return app;
}
