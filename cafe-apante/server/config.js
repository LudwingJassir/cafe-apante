import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const archivoEnv = path.join(RAIZ, '.env');
if (existsSync(archivoEnv)) process.loadEnvFile(archivoEnv);

export const PUERTO = Number(process.env.PUERTO ?? 3000);
export const SQL_SERVIDOR = process.env.SQL_SERVIDOR ?? '.\\SQLEXPRESS01';
export const SQL_BASE = process.env.SQL_BASE ?? 'CafeApante';
export const SQL_DRIVER = process.env.SQL_DRIVER ?? 'ODBC Driver 18 for SQL Server';
export const HORAS_SESION = 10;
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
