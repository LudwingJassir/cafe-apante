import { z } from 'zod';

/** Error con mensaje pensado para mostrarse tal cual a la persona usuaria. */
export class ErrorApp extends Error {
  constructor(estado, mensaje) {
    super(mensaje);
    this.estado = estado;
  }
}

/** Valida `datos` contra un esquema zod y devuelve el resultado limpio. */
export function validar(esquema, datos) {
  const resultado = esquema.safeParse(datos ?? {});
  if (resultado.success) return resultado.data;
  const primero = resultado.error.issues[0];
  const campo = primero.path.length ? `${primero.path.join('.')}: ` : '';
  throw new ErrorApp(400, `Revise los datos enviados. ${campo}${primero.message}`);
}

const vacioANulo = (valor) => (typeof valor === 'string' && valor.trim() === '' ? null : valor);

export const texto = (max, min = 1) => z.string().trim().min(min, 'Este dato es obligatorio').max(max, `Máximo ${max} caracteres`);
export const textoOpcional = (max) => z.preprocess(vacioANulo, z.string().trim().max(max, `Máximo ${max} caracteres`).nullish());

/**
 * Número obligatorio. Un campo vacío o nulo NO se toma como cero: sin esto,
 * "contado: (vacío)" cerraría la caja con C$ 0 en lugar de pedir el dato.
 */
export const numero = () => z.preprocess((v) => (v === '' || v === null ? undefined : v), z.coerce.number({ message: 'Debe ser un número' }));
export const dinero = numero().pipe(z.number().min(0, 'No puede ser negativo').max(99999999));
export const libras = numero().pipe(z.number().positive('Debe ser mayor que cero').max(999999));
export const entero = numero().pipe(z.number().int('Debe ser un número entero'));
export const id = entero.pipe(z.number().positive());

/** Fecha AAAA-MM-DD que además existe en el calendario (rechaza 2026-02-31). */
export const fechaISO = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (use AAAA-MM-DD)')
  .refine((texto) => {
    const [anio, mes, dia] = texto.split('-').map(Number);
    const fecha = new Date(anio, mes - 1, dia);
    return fecha.getFullYear() === anio && fecha.getMonth() === mes - 1 && fecha.getDate() === dia;
  }, 'Esa fecha no existe en el calendario');

export function idDeRuta(req, nombre = 'id') {
  const valor = Number(req.params[nombre]);
  if (!Number.isInteger(valor) || valor <= 0) throw new ErrorApp(400, 'Identificador inválido.');
  return valor;
}

/** Fecha local en formato AAAA-MM-DD (sin corrimiento por zona horaria). */
export function fechaLocal(fecha = new Date()) {
  const dosDigitos = (n) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}`;
}

/**
 * Fecha y hora local como texto AAAA-MM-DDTHH:MM:SS. Las fechas se envían a SQL Server
 * así, como texto: un objeto Date viajaría convertido a UTC y se compararía 6 horas corrido.
 */
export function fechaHoraLocal(fecha = new Date()) {
  const dosDigitos = (n) => String(n).padStart(2, '0');
  return `${fechaLocal(fecha)}T${dosDigitos(fecha.getHours())}:${dosDigitos(fecha.getMinutes())}:${dosDigitos(fecha.getSeconds())}`;
}

export function sumarDias(fecha, dias) {
  const copia = new Date(fecha);
  copia.setDate(copia.getDate() + dias);
  return copia;
}

/** Lunes de la semana de `fecha`, a medianoche. */
export function inicioSemana(fecha = new Date()) {
  const copia = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  copia.setDate(copia.getDate() - ((copia.getDay() + 6) % 7));
  return copia;
}

export const moneda = (valor) =>
  `C$ ${Number(valor).toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
