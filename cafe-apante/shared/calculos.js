// Reglas de negocio puras de Café Apante. Las usan el servidor (fuente de verdad)
// y la interfaz (vista previa), por eso no dependen de la base de datos ni del navegador.

export const GRAMOS_POR_LIBRA = 453.59237;

/**
 * Redondeo comercial (el medio centavo sube). `toPrecision(15)` limpia el ruido del
 * punto flotante antes de redondear: sin eso, 2.055 se guarda como 2.05499999… y bajaría a 2.05.
 */
export function redondear(valor, decimales = 2) {
  const factor = 10 ** decimales;
  return Math.round(Number((Number(valor) * factor).toPrecision(15))) / factor;
}

/** Peso de una bolsa en libras, con la misma precisión (milésimas) con que se lleva el inventario. */
export function gramosALibras(gramos) {
  return redondear(gramos / GRAMOS_POR_LIBRA, 3);
}

/**
 * Desglosa una venta: subtotal sin IVA, IVA, retención de IR y neto a cobrar.
 * @param {{precioUnitario:number, cantidad:number, aplicaIVA:boolean}[]} items
 * @param {{tasaIVA:number, preciosIncluyenIVA:boolean, tasaRetencionDGI:number, montoMinimoRetencion:number}} config tasas en porcentaje
 * @param {{esRetenedor?:boolean}|null} cliente
 */
export function calcularVenta(items, config, cliente = null) {
  const tasa = Number(config.tasaIVA) / 100;
  const lineas = items.map((item) => {
    const bruto = redondear(Number(item.precioUnitario) * Number(item.cantidad));
    if (!item.aplicaIVA) return { subtotal: bruto, iva: 0, importe: bruto };
    if (config.preciosIncluyenIVA) {
      const subtotal = redondear(bruto / (1 + tasa));
      return { subtotal, iva: redondear(bruto - subtotal), importe: bruto };
    }
    const iva = redondear(bruto * tasa);
    return { subtotal: bruto, iva, importe: redondear(bruto + iva) };
  });

  const subtotal = redondear(lineas.reduce((s, l) => s + l.subtotal, 0));
  const iva = redondear(lineas.reduce((s, l) => s + l.iva, 0));
  const total = redondear(subtotal + iva);

  // La retención la practica el cliente retenedor sobre el valor sin IVA,
  // solo cuando la factura alcanza el monto mínimo.
  const aplicaRetencion = Boolean(cliente?.esRetenedor) && subtotal >= Number(config.montoMinimoRetencion);
  const retencion = aplicaRetencion ? redondear(subtotal * (Number(config.tasaRetencionDGI) / 100)) : 0;

  return { lineas, subtotal, iva, total, retencion, totalCobrar: redondear(total - retencion) };
}

/** El vuelto siempre se entrega en córdobas, aunque el cliente pague en dólares. */
export function calcularVuelto({ totalCobrar, moneda, montoRecibido, tipoCambio }) {
  const recibido = Number(montoRecibido) || 0;
  const equivalenteNIO = moneda === 'USD' ? redondear(recibido * Number(tipoCambio)) : redondear(recibido);
  const vuelto = redondear(equivalenteNIO - Number(totalCobrar));
  return { equivalenteNIO, vuelto: Math.max(vuelto, 0), faltante: Math.max(-vuelto, 0), suficiente: vuelto >= 0 };
}

export const NIVELES_STOCK = ['AGOTADO', 'BAJO', 'MEDIO', 'OK'];

/** Semáforo de inventario: rojo (agotado/bajo), amarillo (medio), verde (ok). */
export function nivelStock(stock, puntoReorden, factorMedio = 1.5) {
  const s = Number(stock);
  const reorden = Number(puntoReorden);
  if (s <= 0) return 'AGOTADO';
  if (s <= reorden) return 'BAJO';
  // El límite se redondea a milésimas (como el stock) para que 1.5 × 1.2 sea 1.8 y no 1.7999999….
  if (s <= redondear(reorden * Number(factorMedio), 3)) return 'MEDIO';
  return 'OK';
}

/**
 * Media móvil ponderada. `valores` va del más antiguo al más reciente;
 * el primer peso corresponde al valor más reciente.
 */
export function mediaMovilPonderada(valores, pesos = [4, 3, 2, 1]) {
  const recientes = valores.slice(-pesos.length).reverse();
  if (recientes.length === 0) return 0;
  const usados = pesos.slice(0, recientes.length);
  const sumaPesos = usados.reduce((s, p) => s + p, 0);
  return recientes.reduce((s, v, i) => s + Number(v) * usados[i], 0) / sumaPesos;
}

/**
 * Proyección de demanda de un producto y libras sugeridas a procesar.
 * @param {{historialSemanal:number[], stockActual:number, puntoReorden:number, diasHorizonte:number}} datos
 */
export function proyectarDemanda({ historialSemanal, stockActual, puntoReorden, diasHorizonte }) {
  const demandaSemanal = mediaMovilPonderada(historialSemanal);
  const demandaDiaria = demandaSemanal / 7;
  const demandaHorizonte = demandaDiaria * diasHorizonte;
  // Se produce lo necesario para cubrir el horizonte y terminar con el stock mínimo intacto.
  // Se redondea antes de subir al entero: 3.0000000000000004 lb no debe convertirse en 4.
  const faltante = redondear(demandaHorizonte + Number(puntoReorden) - Number(stockActual), 6);
  const sugeridoProcesar = Math.max(0, Math.ceil(faltante));
  const diasCobertura = demandaDiaria > 0 ? Number(stockActual) / demandaDiaria : null;
  return {
    demandaSemanal: redondear(demandaSemanal, 1),
    demandaDiaria: redondear(demandaDiaria, 2),
    demandaHorizonte: redondear(demandaHorizonte, 1),
    sugeridoProcesar,
    diasCobertura: diasCobertura === null ? null : redondear(diasCobertura, 1),
  };
}

/**
 * Liquidación mensual ante la DGI en Régimen General: IVA y anticipo de IR.
 * Los saldos a favor del mes anterior (IVA y retenciones que superaron al anticipo)
 * se descuentan de este mes y, si sobran, pasan al siguiente.
 */
export function resumenMensualDGI({ ingresosBrutos, ivaCobrado, ivaAcreditable, retenciones, tasaAnticipoIR, saldoFavorAnteriorIVA = 0, saldoFavorAnteriorIR = 0 }) {
  const saldoIVA = redondear(Number(ivaCobrado) - Number(ivaAcreditable) - Number(saldoFavorAnteriorIVA));
  const anticipoIR = redondear(Number(ingresosBrutos) * (Number(tasaAnticipoIR) / 100));
  const saldoIR = redondear(anticipoIR - Number(retenciones) - Number(saldoFavorAnteriorIR));
  const ivaPagar = Math.max(0, saldoIVA);
  const anticipoNeto = Math.max(0, saldoIR);
  return {
    ivaPagar,
    saldoFavorIVA: Math.max(0, -saldoIVA),
    anticipoIR,
    anticipoNeto,
    saldoFavorIR: Math.max(0, -saldoIR),
    totalPagar: redondear(ivaPagar + anticipoNeto),
  };
}

/** Tasa de IR según la tabla de estratos: el porcentaje se aplica a toda la renta neta. */
export function tasaIRPorTabla(rentaNeta, tablaIR) {
  if (!tablaIR?.length) return 0;
  const estrato = tablaIR.find((e) => e.hasta === null || rentaNeta <= Number(e.hasta));
  return Number((estrato ?? tablaIR.at(-1)).tasa);
}

/**
 * IR anual del Régimen General: el mayor entre el IR sobre la renta neta y el
 * pago mínimo definitivo, menos anticipos y retenciones ya acreditados.
 */
export function calcularIRAnual({
  ingresosBrutos,
  gastosDeducibles,
  tablaIR,
  topeTablaProgresiva,
  tasaIRGeneral,
  tasaAnticipoIR,
  anticipos = 0,
  retenciones = 0,
}) {
  const ingresos = Number(ingresosBrutos);
  const rentaNeta = redondear(ingresos - Number(gastosDeducibles));
  const usaTabla = ingresos <= Number(topeTablaProgresiva);
  const tasaAplicada = rentaNeta <= 0 ? 0 : usaTabla ? tasaIRPorTabla(rentaNeta, tablaIR) : Number(tasaIRGeneral);
  const irRentaNeta = redondear(Math.max(rentaNeta, 0) * (tasaAplicada / 100));
  const pagoMinimo = redondear(ingresos * (Number(tasaAnticipoIR) / 100));
  const irAnual = Math.max(irRentaNeta, pagoMinimo);
  const creditos = redondear(Number(anticipos) + Number(retenciones));
  const saldo = redondear(irAnual - creditos);
  return {
    rentaNeta,
    tasaAplicada,
    irRentaNeta,
    pagoMinimo,
    irAnual,
    base: irRentaNeta >= pagoMinimo ? 'RENTA_NETA' : 'PAGO_MINIMO',
    creditos,
    saldoPagar: Math.max(saldo, 0),
    saldoFavor: Math.max(-saldo, 0),
  };
}

/**
 * Efectivo que debería haber en la gaveta al cerrar la caja.
 * `devolucionesNIO`: dinero devuelto hoy por anular ventas en efectivo de cajas anteriores.
 */
export function calcularArqueo({ montoInicial, efectivoNIO, vueltoPorUSD, recibidoUSD, devolucionesNIO = 0, contadoNIO, contadoUSD }) {
  const esperadoNIO = redondear(Number(montoInicial) + Number(efectivoNIO) - Number(vueltoPorUSD) - Number(devolucionesNIO));
  const esperadoUSD = redondear(Number(recibidoUSD));
  return {
    esperadoNIO,
    esperadoUSD,
    diferenciaNIO: contadoNIO == null ? null : redondear(Number(contadoNIO) - esperadoNIO),
    diferenciaUSD: contadoUSD == null ? null : redondear(Number(contadoUSD) - esperadoUSD),
  };
}

/** Estima el cierre de un periodo a partir de lo acumulado y el ritmo diario reciente. */
export function proyectarCierre({ acumulado, ritmoDiario, diasRestantes }) {
  return redondear(Number(acumulado) + Number(ritmoDiario) * Math.max(Number(diasRestantes), 0));
}

/**
 * Billetes y monedas en circulación que se cuentan al cerrar la caja.
 * El C$ 10 existe como billete y como moneda: se cuentan por separado.
 * En dólares solo se reciben billetes.
 */
export const DENOMINACIONES = {
  NIO: [
    { id: 'B1000', valor: 1000, tipo: 'BILLETE' },
    { id: 'B500', valor: 500, tipo: 'BILLETE' },
    { id: 'B200', valor: 200, tipo: 'BILLETE' },
    { id: 'B100', valor: 100, tipo: 'BILLETE' },
    { id: 'B50', valor: 50, tipo: 'BILLETE' },
    { id: 'B20', valor: 20, tipo: 'BILLETE' },
    { id: 'B10', valor: 10, tipo: 'BILLETE' },
    { id: 'M10', valor: 10, tipo: 'MONEDA' },
    { id: 'M5', valor: 5, tipo: 'MONEDA' },
    { id: 'M1', valor: 1, tipo: 'MONEDA' },
    { id: 'M0.50', valor: 0.5, tipo: 'MONEDA' },
    { id: 'M0.25', valor: 0.25, tipo: 'MONEDA' },
    { id: 'M0.10', valor: 0.1, tipo: 'MONEDA' },
  ],
  USD: [
    { id: 'B100', valor: 100, tipo: 'BILLETE' },
    { id: 'B50', valor: 50, tipo: 'BILLETE' },
    { id: 'B20', valor: 20, tipo: 'BILLETE' },
    { id: 'B10', valor: 10, tipo: 'BILLETE' },
    { id: 'B5', valor: 5, tipo: 'BILLETE' },
    { id: 'B2', valor: 2, tipo: 'BILLETE' },
    { id: 'B1', valor: 1, tipo: 'BILLETE' },
  ],
};

/** Suma un conteo por denominación ({ B200: 3, M5: 4 }) de una moneda. Ignora cantidades no válidas. */
export function totalDesglose(moneda, conteo = {}) {
  const total = DENOMINACIONES[moneda].reduce((suma, d) => {
    const cantidad = Number(conteo?.[d.id]);
    return Number.isInteger(cantidad) && cantidad > 0 ? suma + d.valor * cantidad : suma;
  }, 0);
  return redondear(total);
}

/** Deja solo las denominaciones contadas (cantidad mayor que cero), en el orden de la lista. */
export function limpiarDesglose(moneda, conteo = {}) {
  return Object.fromEntries(
    DENOMINACIONES[moneda].filter((d) => Number.isInteger(Number(conteo?.[d.id])) && Number(conteo[d.id]) > 0).map((d) => [d.id, Number(conteo[d.id])]),
  );
}
