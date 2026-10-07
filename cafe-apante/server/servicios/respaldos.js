import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { SQL_BASE } from '../config.js';
import { crearPool, q, uno } from '../db/conexion.js';
import { ErrorApp } from '../util.js';
import { notificar, registrarBitacora } from './notificaciones.js';

// Documentos públicos: el servicio de SQL Server puede escribir ahí y la persona
// usuaria puede abrir la carpeta sin permisos de administrador.
export const CARPETA_RESPALDOS = path.join(process.env.PUBLIC ?? 'C:\\Users\\Public', 'Documents', 'CafeApante', 'Respaldos');

let enCurso = false;

function marcaDeTiempo(fecha = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}${p(fecha.getMonth() + 1)}${p(fecha.getDate())}_${p(fecha.getHours())}${p(fecha.getMinutes())}${p(fecha.getSeconds())}`;
}

/** Borra los respaldos locales más antiguos, dejando los `conservar` más recientes. */
function depurar(conservar) {
  // Coincidencia exacta con los respaldos de ESTA base: los de pruebas o demostración
  // (CafeApante_Demo_...) no deben ocupar cupo ni provocar que se borren los reales.
  const patron = new RegExp(`^${SQL_BASE}_\\d{8}_\\d{6}\\.bak$`);
  const propios = readdirSync(CARPETA_RESPALDOS)
    .filter((nombre) => patron.test(nombre))
    .sort()
    .reverse();
  for (const nombre of propios.slice(Math.max(conservar, 1))) {
    try {
      unlinkSync(path.join(CARPETA_RESPALDOS, nombre));
    } catch {
      // Si el archivo está en uso se intentará de nuevo en el próximo respaldo.
    }
  }
}

/** Copia el respaldo a la carpeta externa configurada (USB o carpeta sincronizada). */
function copiarADestino(origen, nombre, destino) {
  if (!destino) return { copiadoA: null, aviso: null };
  try {
    if (!existsSync(destino)) mkdirSync(destino, { recursive: true });
    copyFileSync(origen, path.join(destino, nombre));
    return { copiadoA: destino, aviso: null };
  } catch (error) {
    console.error('[respaldo] No se pudo copiar al destino externo:', error.message);
    return { copiadoA: null, aviso: `El respaldo se guardó en la laptop, pero no se pudo copiar a "${destino}". Revise que la memoria USB esté conectada y tenga espacio.` };
  }
}

export async function crearRespaldo({ tipo, usuario = null }) {
  if (enCurso) throw new ErrorApp(409, 'Ya hay un respaldo en curso. Espere a que termine.');
  enCurso = true;
  const nombre = `${SQL_BASE}_${marcaDeTiempo()}.bak`;
  const ruta = path.join(CARPETA_RESPALDOS, nombre);
  try {
    mkdirSync(CARPETA_RESPALDOS, { recursive: true });
    const config = await uno('SELECT respaldoDestino, respaldoConservar FROM dbo.ConfiguracionNegocio WHERE idConfig = 1');
    // La ruta se arma solo con valores del servidor (carpeta fija, nombre validado de la base y la hora).
    // Conexión aparte con espera larga: con los años la base crece y el respaldo supera el límite normal de una consulta.
    const conexion = await crearPool(SQL_BASE, { requestTimeout: 10 * 60 * 1000 }).connect();
    try {
      await conexion.request().query(`BACKUP DATABASE [${SQL_BASE}] TO DISK = N'${ruta.replaceAll("'", "''")}' WITH INIT, FORMAT, CHECKSUM, NAME = N'Respaldo Café Apante'`);
    } finally {
      await conexion.close();
    }
    const tamanoBytes = statSync(ruta).size;
    const { copiadoA, aviso } = copiarADestino(ruta, nombre, config.respaldoDestino);
    depurar(config.respaldoConservar);

    await q(
      `INSERT INTO dbo.Respaldo (archivo, tamanoBytes, tipo, estado, copiadoA, mensaje) VALUES (@archivo, @tamano, @tipo, 'OK', @copiadoA, @mensaje)`,
      { archivo: nombre, tamano: tamanoBytes, tipo, copiadoA, mensaje: aviso },
    );
    await registrarBitacora({ usuario, accion: 'RESPALDO', detalle: `${tipo === 'MANUAL' ? 'Manual' : 'Automático'}: ${nombre}` });
    await notificar({
      tipo: 'RESPALDO',
      nivel: aviso ? 'ADVERTENCIA' : 'EXITO',
      titulo: aviso ? 'Respaldo creado, pero sin copia externa' : 'Respaldo creado correctamente',
      mensaje: aviso ?? `Se guardó la copia de seguridad ${nombre}${copiadoA ? ` y se copió a "${copiadoA}"` : ''}.`,
      roles: ['ADMIN'],
      enlace: '/configuracion',
    });
    return { archivo: nombre, tamanoBytes, copiadoA, aviso };
  } catch (error) {
    await q(`INSERT INTO dbo.Respaldo (archivo, tipo, estado, mensaje) VALUES (@archivo, @tipo, 'ERROR', @mensaje)`, { archivo: nombre, tipo, mensaje: String(error.message).slice(0, 400) });
    await notificar({ tipo: 'RESPALDO', nivel: 'CRITICO', titulo: 'No se pudo crear el respaldo', mensaje: 'La copia de seguridad falló. Revise el espacio en disco e intente de nuevo desde Configuración.', roles: ['ADMIN'], enlace: '/configuracion' });
    throw error;
  } finally {
    enCurso = false;
  }
}
