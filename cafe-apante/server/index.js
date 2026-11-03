import { networkInterfaces } from 'node:os';
import { crearApp } from './app.js';
import { INSTANCIAS_SQL, PUERTO, SQL_BASE, SQL_DRIVER, SQL_SERVIDOR } from './config.js';
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
  console.error('');
  console.error(`  No se pudo conectar a SQL Server (servidor ${SQL_SERVIDOR}, base ${SQL_BASE}, controlador ${SQL_DRIVER}).`);
  console.error(`  Detalle: ${error.message}`);
  console.error('');
  if (INSTANCIAS_SQL.length === 0) console.error('  - No se encontró SQL Server instalado en esta computadora. Instale SQL Server Express.');
  else console.error(`  - Instancias instaladas: ${INSTANCIAS_SQL.join(', ')}. Si debe usar otra, indíquela en el archivo .env (vea .env.example).`);
  if (/data source name|driver/i.test(error.message)) console.error('  - Instale el controlador "ODBC Driver 18 for SQL Server" de Microsoft.');
  console.error('  - Revise en "Servicios" de Windows que el servicio SQL Server esté iniciado.');
  console.error('');
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
