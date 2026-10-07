import { networkInterfaces } from 'node:os';
import { crearApp } from './app.js';
import { PUERTO, SQL_BASE, SQL_SERVIDOR } from './config.js';
import { ARCHIVO_CONTRASENAS, inicializarBase } from './db/init.js';
import { iniciarTareas } from './servicios/tareas.js';

try {
  const { usuariosCreados } = await inicializarBase();
  if (usuariosCreados > 0) {
    console.log('');
    console.log(`  Primera ejecución: se crearon ${usuariosCreados} usuarios.`);
    console.log(`  Sus contraseñas temporales están en: ${ARCHIVO_CONTRASENAS}`);
    console.log('  Bórrelo cuando los tres usuarios ya hayan entrado y cambiado su contraseña.');
  }
} catch (error) {
  console.error(`No se pudo conectar a SQL Server (${SQL_SERVIDOR}, base ${SQL_BASE}).`);
  console.error('Verifique que el servicio de SQL Server esté iniciado. Detalle:', error.message);
  process.exit(1);
}

const servidor = crearApp().listen(PUERTO, '0.0.0.0', () => {
  console.log('');
  console.log('  Café Apante · Sistema de Caja e Inventario');
  console.log(`  En esta laptop:  http://localhost:${PUERTO}`);
  for (const interfaz of Object.values(networkInterfaces()).flat()) {
    if (interfaz?.family === 'IPv4' && !interfaz.internal) console.log(`  Desde el celular: http://${interfaz.address}:${PUERTO}`);
  }
  console.log('');
  console.log('  Deje esta ventana abierta mientras usa el sistema.');
  console.log('');
  iniciarTareas();
});

servidor.on('error', (error) => {
  if (error.code === 'EADDRINUSE') console.error(`El puerto ${PUERTO} ya está en uso. ¿El sistema ya está abierto en otra ventana?`);
  else console.error('No se pudo iniciar el servidor:', error.message);
  process.exit(1);
});
