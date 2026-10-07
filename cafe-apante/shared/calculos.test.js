import { describe, expect, it } from 'vitest';
import {
  calcularArqueo,
  calcularIRAnual,
  calcularVenta,
  calcularVuelto,
  gramosALibras,
  mediaMovilPonderada,
  nivelStock,
  proyectarCierre,
  proyectarDemanda,
  redondear,
  resumenMensualDGI,
  tasaIRPorTabla,
} from './calculos.js';

const config = { tasaIVA: 15, preciosIncluyenIVA: true, tasaRetencionDGI: 2, montoMinimoRetencion: 1000 };
const tablaIR = [
  { hasta: 100000, tasa: 10 },
  { hasta: 200000, tasa: 15 },
  { hasta: 350000, tasa: 20 },
  { hasta: 500000, tasa: 25 },
  { hasta: null, tasa: 30 },
];

describe('calcularVenta', () => {
  it('desglosa el IVA cuando el precio ya lo incluye', () => {
    const r = calcularVenta([{ precioUnitario: 345, cantidad: 2, aplicaIVA: true }], config);
    expect(r.total).toBe(690);
    expect(r.subtotal).toBe(600);
    expect(r.iva).toBe(90);
    expect(r.totalCobrar).toBe(690);
  });

  it('suma el IVA cuando el precio no lo incluye', () => {
    const r = calcularVenta([{ precioUnitario: 300, cantidad: 1, aplicaIVA: true }], { ...config, preciosIncluyenIVA: false });
    expect(r.subtotal).toBe(300);
    expect(r.iva).toBe(45);
    expect(r.total).toBe(345);
  });

  it('no cobra IVA en productos exentos', () => {
    const r = calcularVenta([{ precioUnitario: 280, cantidad: 3, aplicaIVA: false }], config);
    expect(r.iva).toBe(0);
    expect(r.subtotal).toBe(840);
    expect(r.total).toBe(840);
  });

  it('el subtotal más el IVA siempre coincide con lo que paga el cliente', () => {
    const r = calcularVenta(
      [
        { precioUnitario: 319.99, cantidad: 3, aplicaIVA: true },
        { precioUnitario: 287.5, cantidad: 7, aplicaIVA: true },
      ],
      config,
    );
    expect(r.total).toBe(2972.47);
    expect(Math.round((r.subtotal + r.iva) * 100)).toBe(Math.round(r.total * 100));
  });

  it('descuenta la retención de IR a un cliente retenedor que supera el mínimo', () => {
    const r = calcularVenta([{ precioUnitario: 345, cantidad: 10, aplicaIVA: true }], config, { esRetenedor: true });
    expect(r.subtotal).toBe(3000);
    expect(r.retencion).toBe(60);
    expect(r.totalCobrar).toBe(3390);
  });

  it('no retiene por debajo del monto mínimo ni a clientes no retenedores', () => {
    const items = [{ precioUnitario: 345, cantidad: 2, aplicaIVA: true }];
    expect(calcularVenta(items, config, { esRetenedor: true }).retencion).toBe(0);
    expect(calcularVenta([{ precioUnitario: 345, cantidad: 10, aplicaIVA: true }], config, { esRetenedor: false }).retencion).toBe(0);
  });
});

describe('calcularVuelto', () => {
  it('calcula el vuelto en córdobas', () => {
    expect(calcularVuelto({ totalCobrar: 690, moneda: 'NIO', montoRecibido: 1000, tipoCambio: 36.6243 })).toMatchObject({
      vuelto: 310,
      suficiente: true,
    });
  });

  it('convierte dólares y entrega el vuelto en córdobas', () => {
    const r = calcularVuelto({ totalCobrar: 690, moneda: 'USD', montoRecibido: 20, tipoCambio: 36.6243 });
    expect(r.equivalenteNIO).toBe(732.49);
    expect(r.vuelto).toBe(42.49);
  });

  it('avisa cuánto falta si el pago no alcanza', () => {
    const r = calcularVuelto({ totalCobrar: 690, moneda: 'NIO', montoRecibido: 500, tipoCambio: 36.6243 });
    expect(r.suficiente).toBe(false);
    expect(r.faltante).toBe(190);
    expect(r.vuelto).toBe(0);
  });
});

describe('nivelStock', () => {
  it('clasifica el semáforo según el punto de reorden', () => {
    expect(nivelStock(0, 20)).toBe('AGOTADO');
    expect(nivelStock(20, 20)).toBe('BAJO');
    expect(nivelStock(25, 20)).toBe('MEDIO');
    expect(nivelStock(30, 20)).toBe('MEDIO');
    expect(nivelStock(30.5, 20)).toBe('OK');
  });

  it('sin punto de reorden solo distingue agotado de disponible', () => {
    expect(nivelStock(0, 0)).toBe('AGOTADO');
    expect(nivelStock(5, 0)).toBe('OK');
  });
});

describe('mediaMovilPonderada', () => {
  it('da más peso a las semanas recientes', () => {
    // (40*4 + 30*3 + 20*2 + 10*1) / 10
    expect(mediaMovilPonderada([10, 20, 30, 40])).toBe(30);
  });

  it('usa solo las últimas semanas disponibles y renormaliza los pesos', () => {
    expect(mediaMovilPonderada([5, 5, 10, 20, 30, 40])).toBe(30);
    expect(mediaMovilPonderada([20, 40])).toBeCloseTo((40 * 4 + 20 * 3) / 7);
    expect(mediaMovilPonderada([])).toBe(0);
  });
});

describe('proyectarDemanda', () => {
  it('sugiere procesar lo que falta para cubrir el horizonte sin tocar el stock mínimo', () => {
    const r = proyectarDemanda({ historialSemanal: [70, 70, 70, 70], stockActual: 50, puntoReorden: 30, diasHorizonte: 14 });
    expect(r.demandaSemanal).toBe(70);
    expect(r.demandaHorizonte).toBe(140);
    expect(r.sugeridoProcesar).toBe(120);
    expect(r.diasCobertura).toBe(5);
  });

  it('no sugiere producir si el stock alcanza, ni calcula cobertura sin ventas', () => {
    const r = proyectarDemanda({ historialSemanal: [], stockActual: 80, puntoReorden: 20, diasHorizonte: 7 });
    expect(r.sugeridoProcesar).toBe(0);
    expect(r.diasCobertura).toBeNull();
  });
});

describe('resumenMensualDGI', () => {
  it('calcula IVA por pagar y anticipo neto de retenciones', () => {
    const r = resumenMensualDGI({ ingresosBrutos: 100000, ivaCobrado: 15000, ivaAcreditable: 4000, retenciones: 300, tasaAnticipoIR: 1 });
    expect(r.ivaPagar).toBe(11000);
    expect(r.anticipoIR).toBe(1000);
    expect(r.anticipoNeto).toBe(700);
    expect(r.totalPagar).toBe(11700);
  });

  it('refleja saldo a favor cuando el crédito fiscal supera al débito', () => {
    const r = resumenMensualDGI({ ingresosBrutos: 10000, ivaCobrado: 1500, ivaAcreditable: 2000, retenciones: 500, tasaAnticipoIR: 1 });
    expect(r.ivaPagar).toBe(0);
    expect(r.saldoFavorIVA).toBe(500);
    expect(r.anticipoNeto).toBe(0);
  });
});

describe('calcularIRAnual', () => {
  const base = { tablaIR, topeTablaProgresiva: 12000000, tasaIRGeneral: 30, tasaAnticipoIR: 1 };

  it('aplica la tasa del estrato a toda la renta neta', () => {
    expect(tasaIRPorTabla(100000, tablaIR)).toBe(10);
    expect(tasaIRPorTabla(100000.01, tablaIR)).toBe(15);
    expect(tasaIRPorTabla(900000, tablaIR)).toBe(30);
    const r = calcularIRAnual({ ...base, ingresosBrutos: 1200000, gastosDeducibles: 900000 });
    expect(r.rentaNeta).toBe(300000);
    expect(r.tasaAplicada).toBe(20);
    expect(r.irRentaNeta).toBe(60000);
    expect(r.irAnual).toBe(60000);
    expect(r.base).toBe('RENTA_NETA');
  });

  it('cobra el pago mínimo definitivo cuando supera al IR sobre la renta neta', () => {
    const r = calcularIRAnual({ ...base, ingresosBrutos: 1000000, gastosDeducibles: 990000 });
    expect(r.irRentaNeta).toBe(1000);
    expect(r.pagoMinimo).toBe(10000);
    expect(r.irAnual).toBe(10000);
    expect(r.base).toBe('PAGO_MINIMO');
  });

  it('con pérdidas se paga igualmente el pago mínimo', () => {
    const r = calcularIRAnual({ ...base, ingresosBrutos: 500000, gastosDeducibles: 600000 });
    expect(r.irRentaNeta).toBe(0);
    expect(r.irAnual).toBe(5000);
  });

  it('usa la tasa general por encima del tope de la tabla progresiva', () => {
    const r = calcularIRAnual({ ...base, ingresosBrutos: 13000000, gastosDeducibles: 12950000 });
    expect(r.tasaAplicada).toBe(30);
  });

  it('descuenta anticipos y retenciones, y reporta saldo a favor', () => {
    const r = calcularIRAnual({ ...base, ingresosBrutos: 1200000, gastosDeducibles: 900000, anticipos: 12000, retenciones: 3000 });
    expect(r.saldoPagar).toBe(45000);
    const favor = calcularIRAnual({ ...base, ingresosBrutos: 1000000, gastosDeducibles: 990000, anticipos: 10000, retenciones: 2500 });
    expect(favor.saldoPagar).toBe(0);
    expect(favor.saldoFavor).toBe(2500);
  });
});

describe('calcularArqueo', () => {
  it('espera en gaveta el fondo inicial más el efectivo, menos el vuelto dado por dólares', () => {
    const r = calcularArqueo({ montoInicial: 500, efectivoNIO: 3450, vueltoPorUSD: 42.49, recibidoUSD: 20, contadoNIO: 3900, contadoUSD: 20 });
    expect(r.esperadoNIO).toBe(3907.51);
    expect(r.esperadoUSD).toBe(20);
    expect(r.diferenciaNIO).toBe(-7.51);
    expect(r.diferenciaUSD).toBe(0);
  });

  it('sin conteo todavía no reporta diferencias', () => {
    const r = calcularArqueo({ montoInicial: 500, efectivoNIO: 0, vueltoPorUSD: 0, recibidoUSD: 0 });
    expect(r.diferenciaNIO).toBeNull();
  });
});

describe('utilidades', () => {
  it('convierte la bolsa de 400 g a libras', () => {
    expect(gramosALibras(400)).toBe(0.882);
    expect(gramosALibras(453.59237)).toBe(1);
  });

  it('proyecta el cierre del periodo con el ritmo diario', () => {
    expect(proyectarCierre({ acumulado: 50000, ritmoDiario: 2500, diasRestantes: 10 })).toBe(75000);
    expect(proyectarCierre({ acumulado: 50000, ritmoDiario: 2500, diasRestantes: -3 })).toBe(50000);
  });
});

describe('redondeo comercial', () => {
  it('sube el medio centavo aunque el punto flotante lo guarde un pelo por debajo', () => {
    expect(redondear(2.055)).toBe(2.06);
    expect(redondear(10.075)).toBe(10.08);
    expect(redondear(20.185)).toBe(20.19);
    expect(redondear(1.005)).toBe(1.01);
    expect(redondear(0)).toBe(0);
    expect(redondear(-7.51)).toBe(-7.51);
  });

  it('el IVA de una línea de C$ 13.70 sin IVA incluido es C$ 2.06', () => {
    const r = calcularVenta([{ precioUnitario: 13.7, cantidad: 1, aplicaIVA: true }], { ...config, preciosIncluyenIVA: false });
    expect(r.iva).toBe(2.06);
    expect(r.total).toBe(15.76);
  });

  it('la retención sobre un subtotal de C$ 1,009.25 es C$ 20.19', () => {
    const r = calcularVenta([{ precioUnitario: 1009.25, cantidad: 1, aplicaIVA: false }], config, { esRetenedor: true });
    expect(r.retencion).toBe(20.19);
  });

  it('retiene justo en el monto mínimo y no un centavo antes', () => {
    const justo = calcularVenta([{ precioUnitario: 1000, cantidad: 1, aplicaIVA: false }], config, { esRetenedor: true });
    const antes = calcularVenta([{ precioUnitario: 999.99, cantidad: 1, aplicaIVA: false }], config, { esRetenedor: true });
    expect(justo.retencion).toBe(20);
    expect(antes.retencion).toBe(0);
  });

  it('mezcla productos gravados y exentos en la misma venta', () => {
    const r = calcularVenta(
      [
        { precioUnitario: 345, cantidad: 1, aplicaIVA: true },
        { precioUnitario: 100, cantidad: 2, aplicaIVA: false },
      ],
      config,
    );
    expect(r.subtotal).toBe(500);
    expect(r.iva).toBe(45);
    expect(r.total).toBe(545);
  });
});

describe('casos límite', () => {
  it('el semáforo respeta la frontera exacta aunque el producto de flotantes no sea exacto', () => {
    expect(nivelStock(1.8, 1.5, 1.2)).toBe('MEDIO'); // 1.5 × 1.2 = 1.7999999999999998
    expect(nivelStock(1.801, 1.5, 1.2)).toBe('OK');
    expect(nivelStock(24, 20, 1.2)).toBe('MEDIO');
  });

  it('no sugiere una libra de más por ruido de punto flotante', () => {
    const r = proyectarDemanda({ historialSemanal: [2.1, 2.1, 2.1, 2.1], stockActual: 0, puntoReorden: 0, diasHorizonte: 10 });
    expect(r.sugeridoProcesar).toBe(3);
  });

  it('una tabla de IR vacía no rompe el cálculo', () => {
    expect(tasaIRPorTabla(50000, [])).toBe(0);
  });

  it('el saldo a favor de IVA y el exceso de retenciones pasan al mes siguiente', () => {
    const marzo = resumenMensualDGI({ ingresosBrutos: 10000, ivaCobrado: 1500, ivaAcreditable: 2000, retenciones: 500, tasaAnticipoIR: 1 });
    expect(marzo.saldoFavorIVA).toBe(500);
    expect(marzo.saldoFavorIR).toBe(400); // anticipo 100 − retenciones 500
    const abril = resumenMensualDGI({ ingresosBrutos: 100000, ivaCobrado: 15000, ivaAcreditable: 4000, retenciones: 0, tasaAnticipoIR: 1, saldoFavorAnteriorIVA: marzo.saldoFavorIVA, saldoFavorAnteriorIR: marzo.saldoFavorIR });
    expect(abril.ivaPagar).toBe(10500);
    expect(abril.anticipoNeto).toBe(600);
    expect(abril.saldoFavorIVA).toBe(0);
  });

  it('el arqueo descuenta el dinero devuelto por anular ventas de cajas anteriores', () => {
    const r = calcularArqueo({ montoInicial: 500, efectivoNIO: 1000, vueltoPorUSD: 0, recibidoUSD: 0, devolucionesNIO: 345 });
    expect(r.esperadoNIO).toBe(1155);
  });
});
