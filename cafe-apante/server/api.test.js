// Prueba de integración: recorre el flujo completo del negocio contra una base
// de datos de pruebas en SQL Server (se borra y se crea de nuevo en cada corrida).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from './app.js';
import { SQL_BASE } from './config.js';
import { cerrarPool, crearPool } from './db/conexion.js';
import { inicializarBase } from './db/init.js';
import { respaldoProgramado } from './servicios/tareas.js';

// Las contraseñas temporales se generan al azar en cada instalación: se toman de lo que devuelve la inicialización.
let credenciales = [];
const claveInicial = (usuario) => credenciales.find((c) => c.usuario === usuario).contrasena;
const CLAVE_NUEVA = 'Prueba-Segura-2026';

let servidor;
let base;
const sesiones = {};

async function cambiarClave(usuario, actual, nueva) {
  const r = await api('POST', '/auth/cambiar-contrasena', { como: usuario, cuerpo: { actual, nueva } });
  if (r.cookie) sesiones[usuario] = r.cookie; // el cambio entrega una sesión nueva e invalida la anterior
  return r;
}

async function api(metodo, ruta, { cuerpo, como, encabezado = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (encabezado) headers['X-Requested-With'] = 'cafe-apante';
  if (como) headers.Cookie = sesiones[como];
  const respuesta = await fetch(`${base}/api${ruta}`, { method: metodo, headers, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  const datos = await respuesta.json().catch(() => null);
  return { estado: respuesta.status, datos, cookie: respuesta.headers.get('set-cookie')?.split(';')[0] };
}

async function entrar(usuario, contrasena) {
  const r = await api('POST', '/auth/login', { cuerpo: { usuario, contrasena } });
  if (r.cookie) sesiones[usuario] = r.cookie;
  return r;
}

beforeAll(async () => {
  if (!SQL_BASE.endsWith('_Pruebas')) throw new Error('Las pruebas solo corren sobre una base terminada en _Pruebas.');
  const maestro = await crearPool('master').connect();
  await maestro.request().query(
    `IF DB_ID(N'${SQL_BASE}') IS NOT NULL BEGIN
       ALTER DATABASE [${SQL_BASE}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
       DROP DATABASE [${SQL_BASE}];
     END`,
  );
  await maestro.close();
  ({ credenciales } = await inicializarBase());
  await new Promise((listo) => {
    servidor = crearApp().listen(0, '127.0.0.1', listo);
  });
  base = `http://127.0.0.1:${servidor.address().port}`;
}, 60000);

afterAll(async () => {
  await new Promise((listo) => servidor.close(listo));
  await cerrarPool();
});

describe('acceso y roles', () => {
  it('rechaza credenciales incorrectas y peticiones sin sesión', async () => {
    expect((await entrar('admin', 'no-es-la-clave')).estado).toBe(401);
    expect((await api('GET', '/productos')).estado).toBe(401);
  });

  it('obliga a cambiar la contraseña temporal antes de usar el sistema', async () => {
    const r = await entrar('admin', claveInicial('admin'));
    expect(r.estado).toBe(200);
    expect(r.datos.debeCambiarContrasena).toBe(true);
    expect((await api('GET', '/productos', { como: 'admin' })).estado).toBe(403);

    expect((await cambiarClave('admin', claveInicial('admin'), 'corta')).estado).toBe(400);
    expect((await cambiarClave('admin', claveInicial('admin'), 'Admin-Facil-2026')).estado).toBe(400); // contiene el nombre de usuario

    const sesionAnterior = sesiones.admin;
    expect((await cambiarClave('admin', claveInicial('admin'), CLAVE_NUEVA)).estado).toBe(200);
    expect((await api('GET', '/productos', { como: 'admin' })).estado).toBe(200);

    // Cambiar la contraseña invalida las sesiones abiertas con la anterior.
    sesiones.vieja = sesionAnterior;
    expect((await api('GET', '/productos', { como: 'vieja' })).estado).toBe(401);
  });

  it('tras 5 contraseñas incorrectas bloquea a ese dispositivo para ese usuario, sin afectar a los demás', async () => {
    for (let i = 0; i < 5; i += 1) expect((await entrar('intruso', 'adivinando-123')).estado).toBe(401);
    expect((await entrar('intruso', 'adivinando-123')).estado).toBe(429);
    expect((await entrar('admin', CLAVE_NUEVA)).estado).toBe(200);
  });

  it('bloquea escrituras que no traen el encabezado propio (CSRF)', async () => {
    const r = await api('POST', '/caja/abrir', { como: 'admin', cuerpo: { montoInicial: 100 }, encabezado: false });
    expect(r.estado).toBe(403);
  });

  it('cada rol entra solo a lo suyo', async () => {
    for (const usuario of ['ventas', 'produccion']) {
      await entrar(usuario, claveInicial(usuario));
      expect((await cambiarClave(usuario, claveInicial(usuario), CLAVE_NUEVA)).estado).toBe(200);
    }
    expect((await api('GET', '/usuarios', { como: 'ventas' })).estado).toBe(403);
    expect((await api('GET', '/finanzas/impuestos', { como: 'ventas' })).estado).toBe(403);
    expect((await api('GET', '/analisis/dashboard', { como: 'produccion' })).estado).toBe(403);
    expect((await api('GET', '/caja/actual', { como: 'produccion' })).estado).toBe(403);
    expect((await api('GET', '/inventario/movimientos', { como: 'ventas' })).estado).toBe(403);
    expect((await api('GET', '/analisis/proyeccion', { como: 'produccion' })).estado).toBe(200);
    expect((await api('GET', '/config/completa', { como: 'ventas' })).estado).toBe(403);
    expect((await api('GET', '/config', { como: 'ventas' })).estado).toBe(200);
  });

  it('el administrador gestiona usuarios sin poder dejarse fuera', async () => {
    const nuevo = await api('POST', '/usuarios', { como: 'admin', cuerpo: { nombre: 'Cajera de apoyo', usuario: 'apoyo', correo: '', rol: 'VENTAS', contrasena: 'Temporal-2026' } });
    expect(nuevo.estado).toBe(201);
    expect(nuevo.datos.contrasena).toBeUndefined();
    const repetido = await api('POST', '/usuarios', { como: 'admin', cuerpo: { nombre: 'Otro', usuario: 'apoyo', rol: 'VENTAS', contrasena: 'Temporal-2026' } });
    expect(repetido.estado).toBe(409);

    const yo = (await api('GET', '/auth/yo', { como: 'admin' })).datos;
    const suicidio = await api('PUT', `/usuarios/${yo.idUsuario}`, { como: 'admin', cuerpo: { nombre: yo.nombre, rol: 'VENTAS', estado: 'ACTIVO' } });
    expect(suicidio.estado).toBe(400);

    const baja = await api('PUT', `/usuarios/${nuevo.datos.idUsuario}`, { como: 'admin', cuerpo: { nombre: 'Cajera de apoyo', rol: 'VENTAS', estado: 'INACTIVO' } });
    expect(baja.datos.estado).toBe('INACTIVO');
    expect((await entrar('apoyo', 'Temporal-2026')).estado).toBe(401);
  });
});

describe('inventario, caja y ventas', () => {
  let producto;
  let bolsa400;
  let libra;
  let mayorista;
  let venta;

  it('crea un producto con sus presentaciones', async () => {
    const r = await api('POST', '/productos', {
      como: 'admin',
      cuerpo: {
        nombre: 'Café Molido Tueste Medio', tipo: 'MOLIDO', descripcion: 'Matagalpa', puntoReorden: 20, aplicaIVA: true,
        presentaciones: [
          { nombre: 'Bolsa 400 g', pesoLibras: 0.8818, precio: 345, precioMayorista: 310.5 },
          { nombre: 'Bolsa 1 lb', pesoLibras: 1, precio: 391, precioMayorista: 356.5 },
        ],
      },
    });
    expect(r.estado).toBe(201);
    producto = r.datos;
    [bolsa400, libra] = producto.presentaciones;
    expect(producto.estadoSemaforo).toBe('AGOTADO');
    expect((await api('POST', '/productos', { como: 'produccion', cuerpo: {} })).estado).toBe(403);
  });

  it('producción registra entradas y mermas, y el semáforo reacciona', async () => {
    const entrada = await api('POST', '/inventario/entrada', { como: 'produccion', cuerpo: { idProducto: producto.idProducto, cantidadLibras: 50, lote: 'L-001' } });
    expect(entrada.datos.stockActual).toBe(50);
    const merma = await api('POST', '/inventario/merma', { como: 'produccion', cuerpo: { idProducto: producto.idProducto, cantidadLibras: 2.5, motivo: 'Bolsa rota' } });
    expect(merma.datos.stockActual).toBe(47.5);
    const sinMotivo = await api('POST', '/inventario/merma', { como: 'produccion', cuerpo: { idProducto: producto.idProducto, cantidadLibras: 1, motivo: '' } });
    expect(sinMotivo.estado).toBe(400);
    const excesiva = await api('POST', '/inventario/merma', { como: 'produccion', cuerpo: { idProducto: producto.idProducto, cantidadLibras: 500, motivo: 'Error de digitación' } });
    expect(excesiva.estado).toBe(409);

    const [actual] = (await api('GET', '/productos', { como: 'ventas' })).datos;
    expect(actual.estadoSemaforo).toBe('OK');
  });

  it('no deja vender con la caja cerrada', async () => {
    const r = await api('POST', '/ventas', { como: 'ventas', cuerpo: { items: [{ idPresentacion: bolsa400.idPresentacion, cantidad: 1 }], metodoPago: 'EFECTIVO', montoRecibido: 500 } });
    expect(r.estado).toBe(409);
  });

  it('abre la caja una sola vez', async () => {
    expect((await api('POST', '/caja/abrir', { como: 'ventas', cuerpo: { montoInicial: 500 } })).estado).toBe(201);
    expect((await api('POST', '/caja/abrir', { como: 'admin', cuerpo: { montoInicial: 100 } })).estado).toBe(409);
  });

  it('vende en efectivo, desglosa el IVA y descuenta el inventario en libras', async () => {
    const r = await api('POST', '/ventas', {
      como: 'ventas',
      cuerpo: { items: [{ idPresentacion: bolsa400.idPresentacion, cantidad: 2 }, { idPresentacion: libra.idPresentacion, cantidad: 1 }], metodoPago: 'EFECTIVO', monedaPago: 'NIO', montoRecibido: 1200 },
    });
    expect(r.estado).toBe(201);
    venta = r.datos;
    expect(venta.total).toBe(1081);
    expect(venta.subtotal).toBe(940);
    expect(venta.ivaCalculado).toBe(141);
    expect(venta.retencionDGI).toBe(0);
    expect(venta.vuelto).toBe(119);
    expect(venta.numeroFactura).toBe('A-000001');
    expect(venta.totalLibras).toBe(2.764);
    expect(venta.detalles).toHaveLength(2);

    const [actual] = (await api('GET', '/productos', { como: 'ventas' })).datos;
    expect(actual.stockActual).toBe(44.736);
  });

  it('rechaza un pago insuficiente y una venta mayor que el stock', async () => {
    const corto = await api('POST', '/ventas', { como: 'ventas', cuerpo: { items: [{ idPresentacion: libra.idPresentacion, cantidad: 1 }], metodoPago: 'EFECTIVO', montoRecibido: 100 } });
    expect(corto.estado).toBe(400);
    const sinStock = await api('POST', '/ventas', { como: 'ventas', cuerpo: { items: [{ idPresentacion: libra.idPresentacion, cantidad: 500 }], metodoPago: 'DEPOSITO', referenciaDeposito: 'TRX-001' } });
    expect(sinStock.estado).toBe(409);
    const sinReferencia = await api('POST', '/ventas', { como: 'ventas', cuerpo: { items: [{ idPresentacion: libra.idPresentacion, cantidad: 1 }], metodoPago: 'DEPOSITO' } });
    expect(sinReferencia.estado).toBe(400);
    const sinMonto = await api('POST', '/ventas', { como: 'ventas', cuerpo: { items: [{ idPresentacion: libra.idPresentacion, cantidad: 1 }], metodoPago: 'EFECTIVO', montoRecibido: null } });
    expect(sinMonto.estado).toBe(400);
    const [actual] = (await api('GET', '/productos', { como: 'ventas' })).datos;
    expect(actual.stockActual).toBe(44.736); // la venta fallida no dejó rastro
  });

  it('cobra en dólares y entrega el vuelto en córdobas', async () => {
    const r = await api('POST', '/ventas', { como: 'ventas', cuerpo: { items: [{ idPresentacion: bolsa400.idPresentacion, cantidad: 1 }], metodoPago: 'EFECTIVO', monedaPago: 'USD', montoRecibido: 10 } });
    expect(r.estado).toBe(201);
    expect(r.datos.vuelto).toBe(21.24); // 10 × 36.6243 = 366.24 − 345
  });

  it('a un cliente grande retenedor le aplica precio mayorista y retención de IR', async () => {
    const cliente = await api('POST', '/clientes', { como: 'ventas', cuerpo: { nombre: 'Distribuidora La Sultana', categoria: 'GRANDE', esRetenedor: true, identificacion: 'J0310000000001' } });
    expect(cliente.estado).toBe(201);
    mayorista = cliente.datos;
    const r = await api('POST', '/ventas', {
      como: 'ventas',
      cuerpo: { idCliente: mayorista.idCliente, items: [{ idPresentacion: libra.idPresentacion, cantidad: 10 }], metodoPago: 'DEPOSITO', referenciaDeposito: 'TRX-778' },
    });
    expect(r.estado).toBe(201);
    expect(r.datos.total).toBe(3565); // 10 × 356.50
    expect(r.datos.subtotal).toBe(3100);
    expect(r.datos.retencionDGI).toBe(62);
    expect(r.datos.totalCobrar).toBe(3503);

    // La misma referencia bancaria no puede respaldar otra venta.
    const repetida = await api('POST', '/ventas', { como: 'ventas', cuerpo: { items: [{ idPresentacion: libra.idPresentacion, cantidad: 1 }], metodoPago: 'DEPOSITO', referenciaDeposito: 'TRX-778' } });
    expect(repetida.estado).toBe(409);

    const ficha = (await api('GET', `/clientes/${mayorista.idCliente}`, { como: 'ventas' })).datos;
    expect(ficha.resumen.compras).toBe(1);
    expect(ficha.favoritos[0].libras).toBe(10);
  });

  it('avisa por notificación cuando el stock cruza a medio y a bajo', async () => {
    // Stock actual: 44.736 − 0.882 − 10 = 33.854 lb. Punto de reorden 20 → medio hasta 30.
    await api('POST', '/inventario/merma', { como: 'produccion', cuerpo: { idProducto: producto.idProducto, cantidadLibras: 5, motivo: 'Muestra para catación' } });
    let notas = (await api('GET', '/notificaciones?tipo=STOCK', { como: 'produccion' })).datos;
    expect(notas.some((n) => n.titulo.startsWith('Stock medio'))).toBe(true);

    await api('POST', '/inventario/ajuste', { como: 'produccion', cuerpo: { idProducto: producto.idProducto, stockFisico: 18, motivo: 'Conteo físico semanal' } });
    notas = (await api('GET', '/notificaciones?tipo=STOCK', { como: 'ventas' })).datos;
    expect(notas.some((n) => n.titulo.startsWith('Stock bajo') && n.nivel === 'CRITICO')).toBe(true);

    const conteo = (await api('GET', '/notificaciones/conteo', { como: 'ventas' })).datos;
    expect(conteo.sinLeer).toBeGreaterThan(0);
    await api('POST', '/notificaciones/leer-todas', { como: 'ventas' });
    expect((await api('GET', '/notificaciones/conteo', { como: 'ventas' })).datos.sinLeer).toBe(0);
    // Leerlas como Ventas no las marca para Producción.
    expect((await api('GET', '/notificaciones/conteo', { como: 'produccion' })).datos.sinLeer).toBeGreaterThan(0);
  });

  it('solo el administrador anula ventas, y la anulación devuelve el café', async () => {
    expect((await api('POST', `/ventas/${venta.idVenta}/anular`, { como: 'ventas', cuerpo: { motivo: 'Cliente devolvió' } })).estado).toBe(403);
    const r = await api('POST', `/ventas/${venta.idVenta}/anular`, { como: 'admin', cuerpo: { motivo: 'Cliente devolvió el producto' } });
    expect(r.datos.estado).toBe('ANULADA');
    const [actual] = (await api('GET', '/productos', { como: 'admin' })).datos;
    expect(actual.stockActual).toBe(20.764); // 18 + 2.764
    expect((await api('POST', `/ventas/${venta.idVenta}/anular`, { como: 'admin', cuerpo: { motivo: 'Segunda vez' } })).estado).toBe(409);
  });

  it('el arqueo espera el efectivo correcto y registra la diferencia al cerrar', async () => {
    const actual = (await api('GET', '/caja/actual', { como: 'ventas' })).datos;
    // Fondo 500; la venta en córdobas se anuló; por la venta en dólares salieron C$ 21.24 de vuelto.
    expect(actual.arqueo.esperadoNIO).toBe(478.76);
    expect(actual.arqueo.esperadoUSD).toBe(10);
    expect(actual.resumen.totalDepositos).toBe(3503);

    const cierre = await api('POST', '/caja/cerrar', { como: 'ventas', cuerpo: { contadoNIO: 470, contadoUSD: 10, observacion: 'Faltó cambio' } });
    expect(cierre.estado).toBe(200);
    expect(cierre.datos.arqueo.diferenciaNIO).toBe(-8.76);
    expect((await api('GET', '/caja/actual', { como: 'ventas' })).datos.sesion).toBeNull();
    expect((await api('GET', '/caja/sesiones', { como: 'admin' })).datos).toHaveLength(1);
  });
});

describe('análisis, impuestos y configuración', () => {
  it('el dashboard resume las ventas vigentes y proyecta el cierre del mes', async () => {
    const d = (await api('GET', '/analisis/dashboard', { como: 'admin' })).datos;
    expect(d.kpi.ventasHoy).toBe(3910); // 345 + 3565; la anulada no cuenta
    expect(d.kpi.transaccionesHoy).toBe(2);
    expect(d.serieDiaria).toHaveLength(30);
    expect(d.serieDiaria.at(-1).ventas).toBe(3910);
    expect(d.serieMensual).toHaveLength(12);
    expect(d.proyeccion.cierreMes).toBeGreaterThanOrEqual(3910);
    expect(d.porCategoria.find((c) => c.categoria === 'GRANDE').ventas).toBe(3565);
  });

  it('la proyección de demanda sugiere libras a procesar', async () => {
    const p = (await api('GET', '/analisis/proyeccion?dias=15', { como: 'produccion' })).datos;
    expect(p.productos).toHaveLength(1);
    expect(p.productos[0].estimacionParcial).toBe(true);
    expect(p.productos[0].demandaHorizonte).toBeGreaterThan(0);
    expect(p.productos[0].sugeridoProcesar).toBeGreaterThan(0);
  });

  it('calcula la liquidación mensual y la estimación anual del IR', async () => {
    const gasto = await api('POST', '/finanzas/gastos', { como: 'admin', cuerpo: { fecha: `${new Date().getFullYear()}-01-15`, categoria: 'Compra de café', descripcion: 'Café oro de Jinotega', monto: 1000, ivaAcreditable: 150 } });
    expect(gasto.estado).toBe(201);

    const r = (await api('GET', '/finanzas/impuestos', { como: 'admin' })).datos;
    expect(r.acumulado.ingresosBrutos).toBe(3400); // 300 + 3100, sin IVA
    expect(r.acumulado.ivaCobrado).toBe(510);
    expect(r.acumulado.retenciones).toBe(62);
    expect(r.acumulado.gastos).toBe(1000);
    expect(r.liquidacion.rentaNeta).toBe(2400);
    expect(r.liquidacion.irRentaNeta).toBe(240); // 10 % del primer estrato
    expect(r.liquidacion.pagoMinimo).toBe(34);
    expect(r.liquidacion.irAnual).toBe(240);
    expect(r.liquidacion.creditos).toBe(62); // el anticipo del mes (34) quedó cubierto por la retención
    expect(r.proyeccion.liquidacion.irAnual).toBeGreaterThan(240);
    expect(r.meses.find((m) => m.mes === 1).ivaAcreditable).toBe(150);
  });

  it('valida y guarda los parámetros tributarios, que rigen las ventas nuevas', async () => {
    const completa = (await api('GET', '/config/completa', { como: 'admin' })).datos;
    const malo = await api('PUT', '/config/tributaria', { como: 'admin', cuerpo: { ...completa.tributaria, tasaIVA: 150 } });
    expect(malo.estado).toBe(400);
    const tablaRota = await api('PUT', '/config/tributaria', { como: 'admin', cuerpo: { ...completa.tributaria, tablaIR: [{ hasta: 100000, tasa: 10 }] } });
    expect(tablaRota.estado).toBe(400);
    const ok = await api('PUT', '/config/tributaria', { como: 'admin', cuerpo: { ...completa.tributaria, preciosIncluyenIVA: false } });
    expect(ok.estado).toBe(200);
    expect(ok.datos.preciosIncluyenIVA).toBe(false);
  });

  it('crea un respaldo de la base de datos', async () => {
    const r = await api('POST', '/config/respaldos', { como: 'admin' });
    expect(r.estado).toBe(201);
    expect(r.datos.tamanoBytes).toBeGreaterThan(0);
    const lista = (await api('GET', '/config/respaldos', { como: 'admin' })).datos;
    expect(lista.respaldos[0].estado).toBe('OK');
  }, 30000);
});

describe('correcciones de las revisiones', () => {
  it('cambiar el margen de stock medio recalcula el semáforo de los productos', async () => {
    // Stock 20.764 lb con reorden en 20: con margen 1.5 está en MEDIO; con margen 1.0 pasa a OK.
    const { negocio } = (await api('GET', '/config/completa', { como: 'admin' })).datos;
    expect((await api('GET', '/productos', { como: 'admin' })).datos[0].estadoSemaforo).toBe('MEDIO');
    const r = await api('PUT', '/config/negocio', { como: 'admin', cuerpo: { ...negocio, factorStockMedio: 1 } });
    expect(r.estado).toBe(200);
    expect((await api('GET', '/productos', { como: 'admin' })).datos[0].estadoSemaforo).toBe('OK');
  });

  it('rechaza carpetas de respaldo en la red, fechas que no existen y campos numéricos vacíos', async () => {
    const { negocio } = (await api('GET', '/config/completa', { como: 'admin' })).datos;
    const enRed = await api('PUT', '/config/negocio', { como: 'admin', cuerpo: { ...negocio, respaldoDestino: '\\192.168.1.50\respaldos' } });
    expect(enRed.estado).toBe(400);
    const local = await api('PUT', '/config/negocio', { como: 'admin', cuerpo: { ...negocio, respaldoDestino: null } });
    expect(local.estado).toBe(200);

    const fechaFalsa = await api('POST', '/finanzas/gastos', { como: 'admin', cuerpo: { fecha: `${new Date().getFullYear()}-02-31`, categoria: 'Otros', descripcion: 'Fecha imposible', monto: 100 } });
    expect(fechaFalsa.estado).toBe(400);

    const [producto] = (await api('GET', '/productos', { como: 'admin' })).datos;
    const ajusteVacio = await api('POST', '/inventario/ajuste', { como: 'produccion', cuerpo: { idProducto: producto.idProducto, stockFisico: null, motivo: 'Conteo sin dato' } });
    expect(ajusteVacio.estado).toBe(400);
    expect((await api('GET', '/productos', { como: 'admin' })).datos[0].stockActual).toBe(producto.stockActual);
  });

  it('anular una venta en efectivo de una caja cerrada exige caja abierta y descuenta la devolución en el arqueo', async () => {
    const ventas = (await api('GET', '/ventas?estado=COMPLETADA', { como: 'admin' })).datos;
    const enDolares = ventas.find((v) => v.metodoPago === 'EFECTIVO' && v.monedaPago === 'USD');
    const motivo = 'El cliente devolvió el café al día siguiente';

    const sinCaja = await api('POST', `/ventas/${enDolares.idVenta}/anular`, { como: 'admin', cuerpo: { motivo } });
    expect(sinCaja.estado).toBe(409);

    expect((await api('POST', '/caja/abrir', { como: 'admin', cuerpo: { montoInicial: 400 } })).estado).toBe(201);
    const anulada = await api('POST', `/ventas/${enDolares.idVenta}/anular`, { como: 'admin', cuerpo: { motivo } });
    expect(anulada.datos.estado).toBe('ANULADA');

    const actual = (await api('GET', '/caja/actual', { como: 'admin' })).datos;
    expect(actual.resumen.devolucionesNIO).toBe(345);
    expect(actual.arqueo.esperadoNIO).toBe(55); // fondo 400 − 345 devueltos
  });
});

describe('tareas automáticas', () => {
  it('el respaldo programado se hace una sola vez por horario, aunque la tarea corra cada minuto', async () => {
    const automaticos = async () => (await api('GET', '/config/respaldos', { como: 'admin' })).datos.respaldos.filter((r) => r.tipo === 'AUTOMATICO').length;
    expect(await automaticos()).toBe(0);
    await respaldoProgramado(); // no había ninguno desde el último horario: se pone al día
    expect(await automaticos()).toBe(1);
    await respaldoProgramado(); // un minuto después ya no debe repetirlo
    await respaldoProgramado();
    expect(await automaticos()).toBe(1);
  }, 60000);
});
