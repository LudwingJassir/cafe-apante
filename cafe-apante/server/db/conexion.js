import sql from 'mssql/msnodesqlv8.js';
import { SQL_BASE, SQL_DRIVER, SQL_SERVIDOR } from '../config.js';

// Autenticación de Windows por memoria compartida: no requiere habilitar TCP/IP
// ni guardar contraseñas de base de datos en la laptop.
export function cadenaConexion(base = SQL_BASE) {
  return `Driver={${SQL_DRIVER}};Server=${SQL_SERVIDOR};Database=${base};Trusted_Connection=yes;TrustServerCertificate=yes;`;
}

export function crearPool(base = SQL_BASE, { requestTimeout = 30000 } = {}) {
  // useUTC:false => las fechas se guardan y leen en la hora local de la laptop.
  return new sql.ConnectionPool({
    connectionString: cadenaConexion(base),
    requestTimeout,
    options: { useUTC: false },
    pool: { max: 8, min: 0, idleTimeoutMillis: 30000 },
  });
}

let pool;

export async function obtenerPool() {
  if (!pool) pool = await crearPool().connect();
  return pool;
}

export async function cerrarPool() {
  if (pool) await pool.close();
  pool = undefined;
}

function prepararSolicitud(conexion, params) {
  const solicitud = new sql.Request(conexion);
  for (const [nombre, valor] of Object.entries(params)) {
    solicitud.input(nombre, valor === undefined ? null : valor);
  }
  return solicitud;
}

const ENTERO = /^-?\d{1,15}$/;

/**
 * El controlador ODBC entrega como texto las columnas IDENTITY (no reconoce el tipo
 * "int identity") y las BIGINT. Aquí se convierten a número para que los
 * identificadores se comparen y viajen en JSON siempre con el mismo tipo.
 */
function normalizarEnteros(filas) {
  if (!filas?.length) return filas ?? [];
  const columnas = Object.entries(filas.columns ?? {})
    .filter(([, columna]) => !columna.type || columna.type === sql.BigInt)
    .map(([nombre]) => nombre);
  for (const fila of filas) {
    for (const columna of columnas) {
      if (typeof fila[columna] === 'string' && ENTERO.test(fila[columna])) fila[columna] = Number(fila[columna]);
    }
  }
  return filas;
}

/** Ejecuta una consulta parametrizada y devuelve las filas. `tx` es opcional. */
export async function q(texto, params = {}, tx = null) {
  const resultado = await prepararSolicitud(tx ?? (await obtenerPool()), params).query(texto);
  return normalizarEnteros(resultado.recordset);
}

/** Igual que `q`, pero devuelve solo la primera fila (o null). */
export async function uno(texto, params = {}, tx = null) {
  const filas = await q(texto, params, tx);
  return filas[0] ?? null;
}

const ERROR_INTERBLOQUEO = 1205;

/**
 * Ejecuta `trabajo(tx)` dentro de una transacción: todo o nada.
 * Si SQL Server la elige como víctima de un interbloqueo (dos operaciones que se
 * esperan mutuamente), ya la revirtió entera: se reintenta una vez.
 */
export async function transaccion(trabajo, intento = 1) {
  const tx = new sql.Transaction(await obtenerPool());
  await tx.begin();
  try {
    const resultado = await trabajo(tx);
    await tx.commit();
    return resultado;
  } catch (error) {
    try {
      await tx.rollback();
    } catch {
      // La transacción ya fue revertida por SQL Server; se conserva el error original.
    }
    const codigo = error.number ?? error.originalError?.code;
    if (codigo === ERROR_INTERBLOQUEO && intento === 1) return transaccion(trabajo, 2);
    throw error;
  }
}
