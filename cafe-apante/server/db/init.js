// Crea la base de datos, las tablas y los datos mínimos para arrancar.
// Es seguro ejecutarlo varias veces. Uso directo: npm run db:init
import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RAIZ, SQL_BASE } from '../config.js';
import { cerrarPool, crearPool, q, uno } from './conexion.js';

const carpeta = path.dirname(fileURLToPath(import.meta.url));

export const TABLA_IR_INICIAL = [
  { hasta: 100000, tasa: 10 },
  { hasta: 200000, tasa: 15 },
  { hasta: 350000, tasa: 20 },
  { hasta: 500000, tasa: 25 },
  { hasta: null, tasa: 30 },
];

async function crearBaseSiFalta() {
  const maestro = await crearPool('master').connect();
  try {
    // SQL_BASE ya fue validado en config.js (solo letras, números y guion bajo).
    await maestro.request().query(`IF DB_ID(N'${SQL_BASE}') IS NULL CREATE DATABASE [${SQL_BASE}]`);
  } finally {
    await maestro.close();
  }
}

async function crearTablas() {
  const lotes = readFileSync(path.join(carpeta, 'esquema.sql'), 'utf8')
    .split(/^\s*GO\s*$/im)
    .map((lote) => lote.trim())
    .filter(Boolean);
  for (const lote of lotes) await q(lote);
}

async function sembrarConfiguracion() {
  await q(
    `IF NOT EXISTS (SELECT 1 FROM dbo.ConfiguracionTributaria)
       INSERT INTO dbo.ConfiguracionTributaria
         (idConfig, tasaIVA, tasaRetencionDGI, montoMinimoRetencion, tasaAnticipoIR, tasaIRGeneral,
          topeTablaProgresiva, tablaIR, preciosIncluyenIVA, actualizadoPor)
       VALUES (1, 15, 2, 1000, 1, 30, 12000000, @tabla, 1, N'Instalación inicial')`,
    { tabla: JSON.stringify(TABLA_IR_INICIAL) },
  );
  await q(
    `IF NOT EXISTS (SELECT 1 FROM dbo.ConfiguracionNegocio)
       INSERT INTO dbo.ConfiguracionNegocio
         (idConfig, nombre, mensajeComprobante, tipoCambio, seriePrefijo, siguienteNumero,
          factorStockMedio, respaldoAuto, respaldoHora, respaldoConservar)
       VALUES (1, N'Café Apante', N'¡Gracias por su compra!', 36.6243, N'A', 1, 1.5, 1, '18:00', 14)`,
  );
}

const PALABRAS = ['Tueste', 'Grano', 'Molido', 'Aroma', 'Taza', 'Cosecha', 'Cerro', 'Finca', 'Selecto', 'Altura', 'Canela', 'Cacao', 'Miel', 'Brisa', 'Lluvia', 'Sendero'];

/** Contraseña temporal al azar y fácil de teclear, por ejemplo "Aroma-4827-Cerro". */
export function contrasenaTemporal() {
  const palabra = () => PALABRAS[randomInt(PALABRAS.length)];
  return `${palabra()}-${randomInt(1000, 10000)}-${palabra()}`;
}

export const ARCHIVO_CONTRASENAS = path.join(RAIZ, SQL_BASE === 'CafeApante' ? 'contrasenas-iniciales.txt' : `contrasenas-iniciales-${SQL_BASE}.txt`);

function guardarContrasenas(credenciales) {
  const lineas = [
    'Café Apante · Contraseñas temporales de los usuarios iniciales',
    `Base de datos: ${SQL_BASE}`,
    '',
    ...credenciales.flatMap((c) => [c.nombre, `   Usuario:    ${c.usuario}`, `   Contraseña: ${c.contrasena}`, '']),
    'El sistema pide cambiar cada contraseña la primera vez que se entra.',
    'Cuando los tres usuarios ya hayan entrado, BORRE este archivo.',
    '',
  ];
  writeFileSync(ARCHIVO_CONTRASENAS, lineas.join('\r\n'), 'utf8');
}

/**
 * Crea los usuarios iniciales con contraseñas temporales distintas en cada instalación
 * (nunca fijas ni versionadas) y las deja en un archivo local para entregarlas en persona.
 */
async function sembrarUsuarios() {
  const { total } = await uno('SELECT COUNT(*) AS total FROM dbo.Usuario');
  if (total > 0) return [];
  const iniciales = JSON.parse(readFileSync(path.join(carpeta, 'usuarios-iniciales.json'), 'utf8'));
  const credenciales = [];
  for (const u of iniciales) {
    const contrasena = contrasenaTemporal();
    await q(
      `INSERT INTO dbo.Usuario (nombre, usuario, contrasena, rol, debeCambiarContrasena)
       VALUES (@nombre, @usuario, @hash, @rol, 1)`,
      { nombre: u.nombre, usuario: u.usuario, hash: await bcrypt.hash(contrasena, 10), rol: u.rol },
    );
    credenciales.push({ nombre: u.nombre, usuario: u.usuario, contrasena });
  }
  guardarContrasenas(credenciales);
  return credenciales;
}

export async function inicializarBase() {
  await crearBaseSiFalta();
  await crearTablas();
  await sembrarConfiguracion();
  const credenciales = await sembrarUsuarios();
  return { usuariosCreados: credenciales.length, credenciales };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { usuariosCreados } = await inicializarBase();
    console.log(`Base de datos "${SQL_BASE}" lista.`);
    if (usuariosCreados > 0) {
      console.log(`Se crearon ${usuariosCreados} usuarios iniciales. Sus contraseñas temporales están en: ${ARCHIVO_CONTRASENAS}`);
    }
    await cerrarPool();
    process.exit(0);
  } catch (error) {
    console.error('No se pudo preparar la base de datos:', error.message);
    process.exit(1);
  }
}
