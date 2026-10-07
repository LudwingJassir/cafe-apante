const numero = (decimales) => new Intl.NumberFormat('es-NI', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
const dosDecimales = numero(2);
const sinDecimales = numero(0);
const unDecimal = new Intl.NumberFormat('es-NI', { minimumFractionDigits: 0, maximumFractionDigits: 1 });

export const cordobas = (valor) => `C$ ${dosDecimales.format(Number(valor) || 0)}`;
export const dolares = (valor) => `US$ ${dosDecimales.format(Number(valor) || 0)}`;
export const dinero = (valor, moneda = 'NIO') => (moneda === 'USD' ? dolares(valor) : cordobas(valor));
export const cordobasCortos = (valor) => `C$ ${sinDecimales.format(Math.round(Number(valor) || 0))}`;
export const libras = (valor) => `${unDecimal.format(Number(valor) || 0)} lb`;
// El inventario se lleva en milésimas de libra: donde se decide con el stock, se muestra completo.
const tresDecimales = new Intl.NumberFormat('es-NI', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
export const librasExactas = (valor) => `${tresDecimales.format(Number(valor) || 0)} lb`;
export const entero = (valor) => sinDecimales.format(Number(valor) || 0);

/** Para ejes de gráficos: C$ 12 mil, C$ 1.2 M. */
export function cordobasCompactos(valor) {
  const v = Number(valor) || 0;
  if (Math.abs(v) >= 1_000_000) return `C$ ${unDecimal.format(v / 1_000_000)} M`;
  if (Math.abs(v) >= 1_000) return `C$ ${unDecimal.format(v / 1_000)} mil`;
  return `C$ ${sinDecimales.format(v)}`;
}

const fechaLarga = new Intl.DateTimeFormat('es-NI', { day: 'numeric', month: 'short', year: 'numeric' });
const fechaCorta = new Intl.DateTimeFormat('es-NI', { day: 'numeric', month: 'short' });
const horaCorta = new Intl.DateTimeFormat('es-NI', { hour: 'numeric', minute: '2-digit', hour12: true });
const mesLargo = new Intl.DateTimeFormat('es-NI', { month: 'long', year: 'numeric' });
const mesCorto = new Intl.DateTimeFormat('es-NI', { month: 'short' });
const diaSemana = new Intl.DateTimeFormat('es-NI', { weekday: 'long', day: 'numeric', month: 'long' });

// Las fechas "AAAA-MM-DD" se anclan al mediodía local para que no se corran de día.
const aFecha = (valor) => (typeof valor === 'string' && valor.length === 10 ? new Date(`${valor}T12:00:00`) : new Date(valor));

export const fecha = (valor) => (valor ? fechaLarga.format(aFecha(valor)) : '—');
export const fechaBreve = (valor) => (valor ? fechaCorta.format(aFecha(valor)) : '—');
export const hora = (valor) => (valor ? horaCorta.format(aFecha(valor)) : '—');
export const fechaHora = (valor) => (valor ? `${fecha(valor)}, ${hora(valor)}` : '—');
const capitalizar = (texto) => texto.charAt(0).toUpperCase() + texto.slice(1);
export const fechaCompleta = (valor) => capitalizar(diaSemana.format(aFecha(valor)));
export const nombreMes = (claveMes) => capitalizar(mesLargo.format(new Date(`${claveMes}-15T12:00:00`)));
export const mesAbreviado = (claveMes) => mesCorto.format(new Date(`${claveMes}-15T12:00:00`)).replace('.', '');
export const NOMBRES_MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export function hoyISO(desplazamientoDias = 0) {
  const d = new Date();
  d.setDate(d.getDate() + desplazamientoDias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function haceCuanto(valor) {
  const minutos = Math.round((Date.now() - new Date(valor).getTime()) / 60000);
  if (minutos < 1) return 'hace un momento';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.round(horas / 24);
  if (dias === 1) return 'ayer';
  if (dias < 30) return `hace ${dias} días`;
  return fecha(valor);
}

export const NOMBRE_ROL = { ADMIN: 'Dueño / Administrador', VENTAS: 'Gerente de Ventas', PRODUCCION: 'Responsable de Producción' };
export const NOMBRE_CATEGORIA = { GRANDE: 'Grande (mayorista)', PEQUENO: 'Pequeño (minorista)' };

export function nombreMetodo(metodo, moneda) {
  if (metodo === 'DEPOSITO') return moneda === 'USD' ? 'Depósito en dólares' : 'Depósito';
  return moneda === 'USD' ? 'Efectivo en dólares' : 'Efectivo';
}

/** Convierte el texto de un campo numérico a número; vacío o inválido da null. */
export function aNumero(textoCampo) {
  if (textoCampo === '' || textoCampo === null || textoCampo === undefined) return null;
  const n = Number(String(textoCampo).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
