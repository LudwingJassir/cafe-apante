import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const archivoEnv = path.join(RAIZ, '.env');
if (existsSync(archivoEnv)) process.loadEnvFile(archivoEnv);

/** Nombres de los valores de una clave del registro de Windows; vacío si no existe. */
function valoresDelRegistro(clave) {
  if (process.platform !== 'win32') return [];
  try {
    const salida = execFileSync('reg', ['query', clave], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
    return salida
      .split(/\r?\n/)
      .map((linea) => linea.match(/^\s+(.+?)\s+REG_SZ\s/)?.[1])
      .filter(Boolean);
  } catch {
    return [];
  }
}

// Cada computadora puede tener SQL Server instalado con otro nombre de instancia y otra versión
// del controlador ODBC. Si .env no los indica, se usa lo que esté instalado.
export const INSTANCIAS_SQL = valoresDelRegistro('HKLM\\SOFTWARE\\Microsoft\\Microsoft SQL Server\\Instance Names\\SQL');

function servidorInstalado() {
  const instancia = ['SQLEXPRESS01', 'SQLEXPRESS', 'MSSQLSERVER'].find((nombre) => INSTANCIAS_SQL.includes(nombre)) ?? INSTANCIAS_SQL[0];
  if (!instancia) return '.\\SQLEXPRESS';
  return instancia === 'MSSQLSERVER' ? '.' : `.\\${instancia}`;
}

function controladorInstalado() {
  const instalados = valoresDelRegistro('HKLM\\SOFTWARE\\ODBC\\ODBCINST.INI\\ODBC Drivers');
  return ['ODBC Driver 18 for SQL Server', 'ODBC Driver 17 for SQL Server'].find((nombre) => instalados.includes(nombre)) ?? 'ODBC Driver 18 for SQL Server';
}

export const PUERTO = Number(process.env.PUERTO ?? 3000);
export const SQL_SERVIDOR = process.env.SQL_SERVIDOR ?? servidorInstalado();
export const SQL_BASE = process.env.SQL_BASE ?? 'CafeApante';
export const SQL_DRIVER = process.env.SQL_DRIVER ?? controladorInstalado();
export const HORAS_SESION = 10;
// Valores por omisión del bloqueo de acceso; el Dueño puede cambiarlos en Configuración.
export const MAX_INTENTOS_LOGIN = 5;
export const MINUTOS_BLOQUEO = 5;

if (!/^[A-Za-z0-9_]+$/.test(SQL_BASE)) {
  throw new Error('SQL_BASE solo puede contener letras, números y guion bajo.');
}

// El secreto que firma las sesiones se genera una sola vez por instalación
// y vive fuera del código para que no termine en el repositorio.
function cargarSecreto() {
  if (process.env.SECRETO_SESION) return process.env.SECRETO_SESION;
  const archivo = path.join(RAIZ, 'server', '.secreto');
  if (existsSync(archivo)) return readFileSync(archivo, 'utf8').trim();
  const secreto = randomBytes(48).toString('hex');
  writeFileSync(archivo, secreto, { encoding: 'utf8', mode: 0o600 });
  return secreto;
}

export const SECRETO_SESION = cargarSecreto();
