// Reportes exportables (clase «Reporte» del diagrama UML): cada uno se arma una sola vez como
// hojas de datos y se entrega en JSON (vista para imprimir o guardar en PDF) o en Excel.
import ExcelJS from 'exceljs';
import { Router } from 'express';
import { z } from 'zod';
import { q } from '../db/conexion.js';
import { estimacionAnual } from '../servicios/impuestos.js';
import { ErrorApp, fechaISO, fechaLocal, validar } from '../util.js';

const router = Router();

const NOMBRE_MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const col = (titulo, clave, tipo = 'texto') => ({ titulo, clave, tipo });
const suma = (filas, clave) => Math.round(filas.reduce((s, f) => s + Number(f[clave] ?? 0), 0) * 100) / 100;
const rango = ({ desde, hasta }) => ({ desde, hastaExclusivo: fechaLocal(new Date(new Date(`${hasta}T12:00:00`).getTime() + 86400000)) });

const REPORTES = {
  ventas: {
    titulo: 'Reporte de ventas',
    async hojas(p) {
      const r = rango(p);
      const ventas = await q(
        `SELECT CONVERT(CHAR(16), v.fecha, 120) AS fecha, f.numeroFactura, ISNULL(c.nombre, N'Consumidor final') AS cliente,
                CASE WHEN c.categoria = 'GRANDE' THEN N'Grande' ELSE N'Pequeño' END AS categoria,
                CASE v.metodoPago WHEN 'DEPOSITO' THEN N'Depósito' ELSE N'Efectivo' END + ' ' + v.monedaPago AS pago,
                v.totalLibras, v.subtotal, v.ivaCalculado AS iva, v.retencionDGI AS retencion, v.total, v.estado, u.nombre AS vendedor
         FROM dbo.Venta v JOIN dbo.Usuario u ON u.idUsuario = v.idUsuario
         LEFT JOIN dbo.Factura f ON f.idVenta = v.idVenta LEFT JOIN dbo.Cliente c ON c.idCliente = v.idCliente
         WHERE v.fecha >= @desde AND v.fecha < @hastaExclusivo ORDER BY v.fecha`,
        r,
      );
      const vigentes = ventas.filter((v) => v.estado === 'COMPLETADA');
      const porProducto = await q(
        `SELECT p.nombre AS producto, SUM(d.cantidad) AS bolsas, SUM(d.cantidadLibras) AS libras, SUM(d.importe) AS importe
         FROM dbo.DetalleVenta d JOIN dbo.Venta v ON v.idVenta = d.idVenta JOIN dbo.Producto p ON p.idProducto = d.idProducto
         WHERE v.estado = 'COMPLETADA' AND v.fecha >= @desde AND v.fecha < @hastaExclusivo
         GROUP BY p.idProducto, p.nombre ORDER BY SUM(d.importe) DESC`,
        r,
      );
      return [
        {
          nombre: 'Ventas',
          columnas: [col('Fecha', 'fecha'), col('Comprobante', 'numeroFactura'), col('Cliente', 'cliente'), col('Tipo', 'categoria'), col('Pago', 'pago'), col('Libras', 'totalLibras', 'numero'), col('Subtotal', 'subtotal', 'dinero'), col('IVA', 'iva', 'dinero'), col('Retención', 'retencion', 'dinero'), col('Total', 'total', 'dinero'), col('Estado', 'estado'), col('Vendedor', 'vendedor')],
          filas: ventas,
          totales: { fecha: `Vigentes: ${vigentes.length}`, totalLibras: suma(vigentes, 'totalLibras'), subtotal: suma(vigentes, 'subtotal'), iva: suma(vigentes, 'iva'), retencion: suma(vigentes, 'retencion'), total: suma(vigentes, 'total') },
        },
        { nombre: 'Por producto', columnas: [col('Producto', 'producto'), col('Bolsas', 'bolsas', 'numero'), col('Libras', 'libras', 'numero'), col('Importe', 'importe', 'dinero')], filas: porProducto, totales: { producto: 'Total', bolsas: suma(porProducto, 'bolsas'), libras: suma(porProducto, 'libras'), importe: suma(porProducto, 'importe') } },
      ];
    },
  },
  inventario: {
    titulo: 'Reporte de inventario',
    async hojas(p) {
      const existencias = await q(
        `SELECT nombre, CASE tipo WHEN 'GRANO' THEN N'En grano' ELSE N'Molido' END AS tipo, stockActual, puntoReorden,
                CASE estadoSemaforo WHEN 'OK' THEN N'Suficiente' WHEN 'MEDIO' THEN N'Stock medio' WHEN 'BAJO' THEN N'Stock bajo' ELSE N'Agotado' END AS semaforo
         FROM dbo.Producto WHERE estado = 'ACTIVO' ORDER BY nombre`,
      );
      const movimientos = await q(
        `SELECT CONVERT(CHAR(16), m.fecha, 120) AS fecha, p.nombre AS producto, m.tipo, m.cantidadLibras, m.stockResultante, ISNULL(m.lote, '') AS lote, ISNULL(m.motivo, '') AS motivo, u.nombre AS responsable
         FROM dbo.MovimientoInventario m JOIN dbo.Producto p ON p.idProducto = m.idProducto JOIN dbo.Usuario u ON u.idUsuario = m.idUsuario
         WHERE m.fecha >= @desde AND m.fecha < @hastaExclusivo ORDER BY m.fecha`,
        rango(p),
      );
      return [
        { nombre: 'Existencias', columnas: [col('Producto', 'nombre'), col('Tipo', 'tipo'), col('En bodega (lb)', 'stockActual', 'numero'), col('Punto de reorden (lb)', 'puntoReorden', 'numero'), col('Semáforo', 'semaforo')], filas: existencias, totales: { nombre: 'Total', stockActual: suma(existencias, 'stockActual') } },
        { nombre: 'Movimientos', columnas: [col('Fecha', 'fecha'), col('Producto', 'producto'), col('Tipo', 'tipo'), col('Libras', 'cantidadLibras', 'numero'), col('Stock después (lb)', 'stockResultante', 'numero'), col('Lote', 'lote'), col('Motivo', 'motivo'), col('Responsable', 'responsable')], filas: movimientos },
      ];
    },
  },
  clientes: {
    titulo: 'Reporte de clientes',
    async hojas(p) {
      const filas = await q(
        `SELECT c.nombre, CASE c.categoria WHEN 'GRANDE' THEN N'Grande (mayorista)' ELSE N'Pequeño (minorista)' END AS categoria,
                ISNULL(c.telefono, '') AS telefono, ISNULL(c.identificacion, '') AS identificacion, CASE WHEN c.esRetenedor = 1 THEN N'Sí' ELSE N'No' END AS retenedor,
                COUNT(v.idVenta) AS compras, ISNULL(SUM(v.totalLibras), 0) AS libras, ISNULL(SUM(v.total), 0) AS total, ISNULL(CONVERT(CHAR(10), MAX(v.fecha), 23), '') AS ultimaCompra
         FROM dbo.Cliente c
         LEFT JOIN dbo.Venta v ON v.idCliente = c.idCliente AND v.estado = 'COMPLETADA' AND v.fecha >= @desde AND v.fecha < @hastaExclusivo
         WHERE c.estado = 'ACTIVO'
         GROUP BY c.idCliente, c.nombre, c.categoria, c.telefono, c.identificacion, c.esRetenedor ORDER BY ISNULL(SUM(v.total), 0) DESC`,
        rango(p),
      );
      return [{ nombre: 'Clientes', columnas: [col('Cliente', 'nombre'), col('Tipo', 'categoria'), col('Teléfono', 'telefono'), col('RUC / cédula', 'identificacion'), col('Retiene IR', 'retenedor'), col('Compras', 'compras', 'numero'), col('Libras', 'libras', 'numero'), col('Total comprado', 'total', 'dinero'), col('Última compra', 'ultimaCompra')], filas, totales: { nombre: 'Total', compras: suma(filas, 'compras'), libras: suma(filas, 'libras'), total: suma(filas, 'total') } }];
    },
  },
  impuestos: {
    titulo: 'Reporte de impuestos DGI',
    async hojas(p) {
      const d = await estimacionAnual(p.anio);
      const meses = d.meses.map((m) => ({ ...m, nombreMes: NOMBRE_MES[m.mes - 1] }));
      const l = d.liquidacion;
      const anual = [
        ['Ingresos brutos (sin IVA)', d.acumulado.ingresosBrutos], ['Costos y gastos deducibles', d.acumulado.gastos], ['Renta neta', l.rentaNeta],
        [`IR sobre la renta neta (${l.tasaAplicada} %)`, l.irRentaNeta], ['Pago mínimo definitivo', l.pagoMinimo], ['IR anual (el mayor)', l.irAnual],
        ['Anticipos y retenciones acreditados', l.creditos], ['Saldo a pagar', l.saldoPagar], ['Saldo a favor', l.saldoFavor],
      ].map(([concepto, monto]) => ({ concepto, monto }));
      return [
        { nombre: `Mensual ${p.anio}`, columnas: [col('Mes', 'nombreMes'), col('Ingresos', 'ingresosBrutos', 'dinero'), col('IVA cobrado', 'ivaCobrado', 'dinero'), col('IVA acreditable', 'ivaAcreditable', 'dinero'), col('IVA por pagar', 'ivaPagar', 'dinero'), col('Anticipo IR', 'anticipoNeto', 'dinero'), col('Retenciones', 'retenciones', 'dinero'), col('Total a pagar', 'totalPagar', 'dinero')], filas: meses, totales: { nombreMes: 'Total del año', ingresosBrutos: suma(meses, 'ingresosBrutos'), ivaCobrado: suma(meses, 'ivaCobrado'), ivaAcreditable: suma(meses, 'ivaAcreditable'), ivaPagar: suma(meses, 'ivaPagar'), anticipoNeto: suma(meses, 'anticipoNeto'), retenciones: suma(meses, 'retenciones'), totalPagar: suma(meses, 'totalPagar') } },
        { nombre: `IR anual ${p.anio}`, columnas: [col('Concepto', 'concepto'), col('Monto', 'monto', 'dinero')], filas: anual },
      ];
    },
  },
  arqueos: {
    titulo: 'Reporte de arqueos de caja',
    async hojas(p) {
      const filas = await q(
        `SELECT CONVERT(CHAR(16), s.fechaApertura, 120) AS apertura, CONVERT(CHAR(16), s.fechaCierre, 120) AS cierre, c.nombre AS responsable,
                s.montoInicial, s.totalVentas, s.totalDepositos, s.esperadoNIO, s.contadoNIO, s.diferenciaNIO, s.esperadoUSD, s.contadoUSD, s.diferenciaUSD, ISNULL(s.observacion, '') AS observacion
         FROM dbo.SesionCaja s LEFT JOIN dbo.Usuario c ON c.idUsuario = s.idUsuarioCierre
         WHERE s.estado = 'CERRADA' AND s.fechaCierre >= @desde AND s.fechaCierre < @hastaExclusivo ORDER BY s.fechaCierre`,
        rango(p),
      );
      return [{ nombre: 'Arqueos', columnas: [col('Apertura', 'apertura'), col('Cierre', 'cierre'), col('Responsable', 'responsable'), col('Fondo inicial', 'montoInicial', 'dinero'), col('Ventas', 'totalVentas', 'dinero'), col('Depósitos', 'totalDepositos', 'dinero'), col('Esperado C$', 'esperadoNIO', 'dinero'), col('Contado C$', 'contadoNIO', 'dinero'), col('Diferencia C$', 'diferenciaNIO', 'dinero'), col('Esperado US$', 'esperadoUSD', 'numero'), col('Contado US$', 'contadoUSD', 'numero'), col('Diferencia US$', 'diferenciaUSD', 'numero'), col('Observación', 'observacion')], filas, totales: { apertura: `Cierres: ${filas.length}`, totalVentas: suma(filas, 'totalVentas'), totalDepositos: suma(filas, 'totalDepositos'), diferenciaNIO: suma(filas, 'diferenciaNIO') } }];
    },
  },
  gastos: {
    titulo: 'Reporte de gastos',
    async hojas(p) {
      const filas = await q(
        `SELECT CONVERT(CHAR(10), g.fecha, 23) AS fecha, g.categoria, g.descripcion, g.monto, g.ivaAcreditable, u.nombre AS registro
         FROM dbo.Gasto g JOIN dbo.Usuario u ON u.idUsuario = g.idUsuario
         WHERE g.fecha >= @desde AND g.fecha < @hastaExclusivo ORDER BY g.fecha`,
        rango(p),
      );
      return [{ nombre: 'Gastos', columnas: [col('Fecha', 'fecha'), col('Categoría', 'categoria'), col('Descripción', 'descripcion'), col('Monto sin IVA', 'monto', 'dinero'), col('IVA acreditable', 'ivaAcreditable', 'dinero'), col('Registró', 'registro')], filas, totales: { fecha: 'Total', monto: suma(filas, 'monto'), ivaAcreditable: suma(filas, 'ivaAcreditable') } }];
    },
  },
};

const FORMATO_EXCEL = { dinero: '"C$" #,##0.00', numero: '#,##0.###' };

async function aExcel(reporte) {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'Café Apante';
  for (const hoja of reporte.hojas) {
    const h = libro.addWorksheet(hoja.nombre.slice(0, 31));
    h.addRow([`${reporte.titulo} · ${reporte.periodo}`]).font = { bold: true, size: 14 };
    h.addRow([`Generado el ${reporte.generado} por ${reporte.generadoPor}`]).font = { italic: true, color: { argb: 'FF5E4739' } };
    h.addRow([]);
    const encabezado = h.addRow(hoja.columnas.map((c) => c.titulo));
    encabezado.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    encabezado.eachCell((celda) => {
      celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF33241B' } };
    });
    for (const fila of hoja.filas) h.addRow(hoja.columnas.map((c) => fila[c.clave] ?? ''));
    if (hoja.totales) h.addRow(hoja.columnas.map((c) => hoja.totales[c.clave] ?? '')).font = { bold: true };
    hoja.columnas.forEach((c, i) => {
      const columna = h.getColumn(i + 1);
      if (FORMATO_EXCEL[c.tipo]) columna.numFmt = FORMATO_EXCEL[c.tipo];
      columna.width = Math.min(45, Math.max(c.titulo.length + 2, ...hoja.filas.slice(0, 200).map((f) => String(f[c.clave] ?? '').length + 2)));
    });
    h.views = [{ state: 'frozen', ySplit: 4 }];
    h.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: hoja.columnas.length } };
  }
  return libro.xlsx.writeBuffer();
}

router.get('/historial', async (_req, res) => {
  res.json(
    await q(
      `SELECT TOP 30 r.idReporte, r.tipo, r.fechaGeneracion, r.datos, r.formato, u.nombre AS usuario
       FROM dbo.Reporte r JOIN dbo.Usuario u ON u.idUsuario = r.idUsuario ORDER BY r.idReporte DESC`,
    ),
  );
});

router.get('/:tipo', async (req, res) => {
  const definicion = REPORTES[req.params.tipo];
  if (!definicion) throw new ErrorApp(404, 'Ese reporte no existe.');
  const actual = new Date().getFullYear();
  const p = validar(
    z.object({
      desde: fechaISO.default(`${actual}-01-01`),
      hasta: fechaISO.default(fechaLocal()),
      anio: z.coerce.number().int().min(2020).max(actual + 1).default(actual),
      formato: z.enum(['json', 'xlsx']).default('json'),
    }),
    req.query,
  );
  if (p.desde > p.hasta) throw new ErrorApp(400, 'La fecha inicial no puede ser posterior a la final.');

  const periodo = req.params.tipo === 'impuestos' ? `Año ${p.anio}` : req.params.tipo === 'inventario' ? `Existencias al ${fechaLocal()} · movimientos del ${p.desde} al ${p.hasta}` : `Del ${p.desde} al ${p.hasta}`;
  const reporte = { tipo: req.params.tipo, titulo: definicion.titulo, periodo, generado: new Date().toLocaleString('es-NI'), generadoPor: req.usuario.nombre, hojas: await definicion.hojas(p) };

  // Cada reporte generado queda registrado, como pide la clase Reporte del diagrama.
  await q('INSERT INTO dbo.Reporte (tipo, idUsuario, datos, formato) VALUES (@tipo, @idUsuario, @datos, @formato)', {
    tipo: req.params.tipo, idUsuario: req.usuario.idUsuario, datos: periodo, formato: p.formato === 'xlsx' ? 'EXCEL' : 'PDF',
  });

  if (p.formato === 'xlsx') {
    const archivo = `cafe-apante-${req.params.tipo}-${fechaLocal()}.xlsx`;
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.set('Content-Disposition', `attachment; filename="${archivo}"`);
    return res.send(Buffer.from(await aExcel(reporte)));
  }
  res.json(reporte);
});

export default router;
