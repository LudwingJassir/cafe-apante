import { Calculator, FileSpreadsheet, Landmark, Package, Printer, Receipt, Users, Wallet } from 'lucide-react';
import { useState } from 'react';
import { api, useDatos } from '../api.js';
import { useAvisos } from '../contexto.jsx';
import { cordobas, entero, fechaHora, hoyISO } from '../formato.js';
import { Boton, Cargando, Encabezado, Entrada, Insignia, Modal, Nota, Selector, Tarjeta } from '../ui.jsx';

const TIPOS = [
  { tipo: 'ventas', titulo: 'Ventas', icono: Receipt, texto: 'Cada venta con cliente, forma de pago, IVA, retención y total, más un resumen por producto.' },
  { tipo: 'inventario', titulo: 'Inventario', icono: Package, texto: 'Existencias actuales con su semáforo y los movimientos (entradas, ventas, mermas, ajustes) del periodo.' },
  { tipo: 'clientes', titulo: 'Clientes', icono: Users, texto: 'Catálogo con tipo de cliente, compras, libras y total comprado en el periodo.' },
  { tipo: 'impuestos', titulo: 'Impuestos DGI', icono: Landmark, texto: 'Liquidación mensual (IVA, anticipo de IR, retenciones) y estimación del IR anual.', porAnio: true },
  { tipo: 'arqueos', titulo: 'Arqueos de caja', icono: Calculator, texto: 'Cierres de caja con lo esperado, lo contado y las diferencias.' },
  { tipo: 'gastos', titulo: 'Gastos', icono: Wallet, texto: 'Compras y gastos del negocio con su IVA acreditable.' },
];
const NOMBRE_TIPO = Object.fromEntries(TIPOS.map((t) => [t.tipo, t.titulo]));

function valorCelda(valor, tipo) {
  if (valor === '' || valor === null || valor === undefined) return '';
  if (tipo === 'dinero' && typeof valor === 'number') return cordobas(valor);
  if (tipo === 'numero' && typeof valor === 'number') return valor.toLocaleString('es-NI', { maximumFractionDigits: 3 });
  return String(valor);
}

/** Vista del reporte: es lo único que sale al imprimir, y desde ahí se guarda como PDF. */
function VistaReporte({ reporte }) {
  return (
    <article className="imprimible hoja space-y-6 bg-white text-cafe-900">
      <header>
        <p className="font-display text-2xl font-semibold">Café Apante · {reporte.titulo}</p>
        <p className="text-cafe-600">{reporte.periodo}</p>
        <p className="text-sm text-cafe-500">
          Generado el {reporte.generado} por {reporte.generadoPor}
        </p>
      </header>
      {reporte.hojas.map((hoja) => (
        <section key={hoja.nombre}>
          <h3 className="mb-2 text-lg font-semibold">
            {hoja.nombre} <span className="text-sm font-normal text-cafe-500">({entero(hoja.filas.length)} filas)</span>
          </h3>
          {hoja.filas.length === 0 ? (
            <p className="text-cafe-500">Sin datos en este periodo.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="tabla text-sm">
                <thead>
                  <tr>
                    {hoja.columnas.map((c) => (
                      <th key={c.clave} className={c.tipo === 'texto' ? '' : 'num'}>
                        {c.titulo}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {hoja.filas.map((fila, i) => (
                    <tr key={i}>
                      {hoja.columnas.map((c) => (
                        <td key={c.clave} className={c.tipo === 'texto' ? '' : 'num'}>
                          {valorCelda(fila[c.clave], c.tipo)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {hoja.totales && (
                  <tfoot>
                    <tr className="bg-hueso-100 font-bold">
                      {hoja.columnas.map((c) => (
                        <td key={c.clave} className={`px-3.5 py-2.5 ${c.tipo === 'texto' ? '' : 'num'}`}>
                          {valorCelda(hoja.totales[c.clave], c.tipo)}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </section>
      ))}
    </article>
  );
}

export default function Reportes() {
  const avisos = useAvisos();
  const anioActual = new Date().getFullYear();
  const [desde, setDesde] = useState(`${anioActual}-01-01`);
  const [hasta, setHasta] = useState(hoyISO());
  const [anio, setAnio] = useState(anioActual);
  const [trabajando, setTrabajando] = useState(null);
  const [vista, setVista] = useState(null);
  const historial = useDatos('/reportes/historial');
  const parametros = (formato) => new URLSearchParams({ desde, hasta, anio: String(anio), formato }).toString();
  const fechasInvalidas = desde > hasta;

  async function descargarExcel(tipo) {
    setTrabajando(`${tipo}:xlsx`);
    try {
      const respuesta = await fetch(`/api/reportes/${tipo}?${parametros('xlsx')}`, { credentials: 'same-origin' });
      if (!respuesta.ok) throw new Error((await respuesta.json().catch(() => null))?.error ?? 'No se pudo generar el reporte.');
      const enlace = document.createElement('a');
      enlace.href = URL.createObjectURL(await respuesta.blob());
      enlace.download = `cafe-apante-${tipo}-${hoyISO()}.xlsx`;
      enlace.click();
      URL.revokeObjectURL(enlace.href);
      avisos.exito(`Se descargó el reporte de ${NOMBRE_TIPO[tipo].toLowerCase()} en Excel.`);
      historial.recargar();
    } catch (err) {
      avisos.error(err.message);
    } finally {
      setTrabajando(null);
    }
  }

  async function verParaImprimir(tipo) {
    setTrabajando(`${tipo}:pdf`);
    try {
      setVista(await api(`/reportes/${tipo}?${parametros('json')}`));
      historial.recargar();
    } catch (err) {
      avisos.error(err.message);
    } finally {
      setTrabajando(null);
    }
  }

  return (
    <>
      <Encabezado titulo="Reportes" descripcion="Descargue la información del negocio en Excel, o véala lista para imprimir o guardar como PDF." />

      <Tarjeta titulo="Periodo" className="mb-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Entrada etiqueta="Desde" type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} />
          <Entrada etiqueta="Hasta" type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} error={fechasInvalidas ? 'Debe ser posterior a «Desde».' : null} />
          <Selector etiqueta="Año (reporte de impuestos)" value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
            {[0, 1, 2, 3].map((i) => (
              <option key={i} value={anioActual - i}>
                {anioActual - i}
              </option>
            ))}
          </Selector>
        </div>
      </Tarjeta>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {TIPOS.map(({ tipo, titulo, icono: Icono, texto, porAnio }) => (
          <article key={tipo} className="flex flex-col rounded-2xl border border-hueso-300 bg-white p-5 shadow-tarjeta">
            <div className="flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-xl bg-caramelo-50 text-caramelo-700">
                <Icono className="size-6" aria-hidden />
              </span>
              <h2 className="text-xl font-semibold">{titulo}</h2>
            </div>
            <p className="mt-2 flex-1 text-cafe-600">{texto}</p>
            <p className="mt-2 text-sm text-cafe-500">{porAnio ? `Año ${anio}` : `Del ${desde} al ${hasta}`}</p>
            <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
              <Boton variante="exito" tamano="sm" icono={FileSpreadsheet} cargando={trabajando === `${tipo}:xlsx`} disabled={Boolean(trabajando) || (!porAnio && fechasInvalidas)} onClick={() => descargarExcel(tipo)}>
                Excel
              </Boton>
              <Boton variante="secundario" tamano="sm" icono={Printer} cargando={trabajando === `${tipo}:pdf`} disabled={Boolean(trabajando) || (!porAnio && fechasInvalidas)} onClick={() => verParaImprimir(tipo)}>
                Ver / PDF
              </Boton>
            </div>
          </article>
        ))}
      </div>

      <Nota className="mt-6 max-w-3xl" titulo="¿Cómo guardar en PDF?">
        Pulse «Ver / PDF» y luego «Imprimir o guardar PDF». En la ventana de impresión elija «Guardar como PDF» en lugar de la impresora.
      </Nota>

      <Tarjeta titulo="Reportes generados" descripcion="Registro de cada reporte exportado: qué se generó, cuándo y quién." className="mt-6" relleno={false}>
        {historial.cargando && !historial.datos && <Cargando />}
        {historial.datos?.length === 0 && <p className="px-6 py-8 text-center text-cafe-500">Todavía no se ha generado ningún reporte.</p>}
        {historial.datos?.length > 0 && (
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Reporte</th>
                  <th>Periodo</th>
                  <th>Formato</th>
                  <th>Generó</th>
                </tr>
              </thead>
              <tbody>
                {historial.datos.map((r) => (
                  <tr key={r.idReporte}>
                    <td className="whitespace-nowrap">{fechaHora(r.fechaGeneracion)}</td>
                    <td>{NOMBRE_TIPO[r.tipo] ?? r.tipo}</td>
                    <td className="text-cafe-600">{r.datos}</td>
                    <td>
                      <Insignia tono={r.formato === 'EXCEL' ? 'verde' : 'azul'}>{r.formato === 'EXCEL' ? 'Excel' : 'PDF / impresión'}</Insignia>
                    </td>
                    <td>{r.usuario}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>

      <Modal
        abierto={Boolean(vista)}
        titulo={vista?.titulo ?? ''}
        descripcion={vista?.periodo}
        alCerrar={() => setVista(null)}
        ancho="xl"
        pie={
          <Boton icono={Printer} onClick={() => window.print()}>
            Imprimir o guardar PDF
          </Boton>
        }
      >
        {vista && <VistaReporte reporte={vista} />}
      </Modal>
    </>
  );
}
