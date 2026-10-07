import { Ban, Printer, Receipt, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, useDatos } from '../api.js';
import Comprobante from '../Comprobante.jsx';
import { useAvisos, useSesion } from '../contexto.jsx';
import { cordobas, fechaHora, hoyISO, libras, nombreMetodo } from '../formato.js';
import { AreaTexto, Boton, Cargando, Dato, Encabezado, Entrada, EstadoVacio, Insignia, MensajeError, Modal, Nota, Selector, Tarjeta } from '../ui.jsx';

function DetalleVenta({ idVenta, alCambiar }) {
  const { usuario, config, refrescarNotificaciones } = useSesion();
  const avisos = useAvisos();
  const { datos: venta, cargando, error, recargar } = useDatos(`/ventas/${idVenta}`);
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);

  if (cargando && !venta) return <Cargando />;
  if (error) return <MensajeError mensaje={error} />;

  async function anular() {
    setEnviando(true);
    try {
      await api(`/ventas/${idVenta}/anular`, { metodo: 'POST', cuerpo: { motivo } });
      avisos.exito('La venta quedó anulada y el café volvió al inventario.');
      setAnulando(false);
      recargar();
      alCambiar();
      refrescarNotificaciones();
    } catch (err) {
      avisos.error(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-5">
      <Comprobante venta={venta} negocio={config?.negocio} tasaIVA={config?.tributaria.tasaIVA} />

      {venta.estado === 'ANULADA' && (
        <Nota tono="rojo" titulo={`Anulada el ${fechaHora(venta.fechaAnulacion)}`} className="no-imprimir">
          Motivo: {venta.motivoAnulacion}
        </Nota>
      )}

      {anulando ? (
        <div className="no-imprimir space-y-4 rounded-2xl border border-peligro-100 bg-peligro-50 p-4">
          <p className="font-semibold text-peligro-700">Al anular, la venta deja de contar en los reportes y el café regresa al inventario. Esto no se puede deshacer.</p>
          <AreaTexto etiqueta="¿Por qué se anula?" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} placeholder="Ejemplo: el cliente devolvió el producto" autoFocus />
          <div className="flex flex-wrap justify-end gap-3">
            <Boton variante="secundario" onClick={() => setAnulando(false)}>
              No anular
            </Boton>
            <Boton variante="peligro" icono={Ban} cargando={enviando} disabled={motivo.trim().length < 5} onClick={anular}>
              Sí, anular la venta
            </Boton>
          </div>
        </div>
      ) : (
        <div className="no-imprimir flex flex-wrap justify-end gap-3">
          {usuario.rol === 'ADMIN' && venta.estado === 'COMPLETADA' && (
            <Boton variante="secundario" icono={Ban} onClick={() => setAnulando(true)}>
              Anular venta
            </Boton>
          )}
          <Boton icono={Printer} onClick={() => window.print()}>
            Imprimir comprobante
          </Boton>
        </div>
      )}
    </div>
  );
}

export default function Ventas() {
  const [filtros, setFiltros] = useState({ desde: hoyISO(-6), hasta: hoyISO(), estado: '', buscar: '' });
  const [consulta, setConsulta] = useState('');
  const [viendo, setViendo] = useState(null);
  const cambiar = (campo) => (e) => setFiltros((f) => ({ ...f, [campo]: e.target.value }));

  useEffect(() => {
    const espera = setTimeout(() => setConsulta(filtros.buscar.trim()), 300);
    return () => clearTimeout(espera);
  }, [filtros.buscar]);

  const parametros = new URLSearchParams();
  if (filtros.desde) parametros.set('desde', filtros.desde);
  if (filtros.hasta) parametros.set('hasta', filtros.hasta);
  if (filtros.estado) parametros.set('estado', filtros.estado);
  if (consulta) parametros.set('buscar', consulta);
  const { datos, cargando, error, recargar } = useDatos(`/ventas?${parametros}`);

  const vigentes = datos?.filter((v) => v.estado === 'COMPLETADA') ?? [];
  const total = vigentes.reduce((s, v) => s + v.total, 0);
  const totalLibras = vigentes.reduce((s, v) => s + v.totalLibras, 0);

  return (
    <>
      <Encabezado titulo="Ventas y facturas" descripcion="Historial de ventas. Abra cualquiera para ver su comprobante o volver a imprimirlo." />

      <Tarjeta className="mb-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1.4fr]">
          <Entrada etiqueta="Desde" type="date" value={filtros.desde} max={filtros.hasta || undefined} onChange={cambiar('desde')} />
          <Entrada etiqueta="Hasta" type="date" value={filtros.hasta} min={filtros.desde || undefined} onChange={cambiar('hasta')} />
          <Selector etiqueta="Estado" value={filtros.estado} onChange={cambiar('estado')}>
            <option value="">Todas</option>
            <option value="COMPLETADA">Vigentes</option>
            <option value="ANULADA">Anuladas</option>
          </Selector>
          <Entrada etiqueta="Buscar" type="search" placeholder="N.º de comprobante o cliente" value={filtros.buscar} onChange={cambiar('buscar')} />
        </div>
      </Tarjeta>

      {error && <MensajeError mensaje={error} alReintentar={recargar} />}
      {cargando && !datos && <Cargando />}

      {datos && (
        <>
          <div className="mb-5 grid gap-4 sm:grid-cols-3">
            <Dato etiqueta="Ventas vigentes en el periodo" valor={vigentes.length} />
            <Dato etiqueta="Total vendido (con IVA)" valor={cordobas(total)} />
            <Dato etiqueta="Café vendido" valor={libras(totalLibras)} />
          </div>

          <Tarjeta relleno={false}>
            {datos.length === 0 ? (
              <EstadoVacio icono={Receipt} titulo="No hay ventas en este periodo" texto="Cambie las fechas o quite los filtros para ver más." />
            ) : (
              <div className="overflow-x-auto">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Comprobante</th>
                      <th>Cliente</th>
                      <th>Pago</th>
                      <th className="num">Libras</th>
                      <th className="num">Total</th>
                      <th>Estado</th>
                      <th>
                        <span className="sr-only">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.map((v) => (
                      <tr key={v.idVenta}>
                        <td className="whitespace-nowrap">
                          <span className="font-semibold">{v.numeroFactura}</span>
                          <span className="block text-sm text-cafe-500">{fechaHora(v.fecha)}</span>
                        </td>
                        <td>
                          {v.cliente}
                          <span className="block text-sm text-cafe-500">Atendió {v.vendedor}</span>
                        </td>
                        <td className="whitespace-nowrap">{nombreMetodo(v.metodoPago, v.monedaPago)}</td>
                        <td className="num">{libras(v.totalLibras)}</td>
                        <td className={`num font-semibold ${v.estado === 'ANULADA' ? 'text-cafe-400 line-through' : ''}`}>{cordobas(v.total)}</td>
                        <td>{v.estado === 'ANULADA' ? <Insignia tono="rojo" icono={Ban}>Anulada</Insignia> : <Insignia tono="verde">Vigente</Insignia>}</td>
                        <td className="text-right">
                          <Boton variante="secundario" tamano="sm" icono={Search} onClick={() => setViendo(v.idVenta)} aria-label={`Ver el comprobante ${v.numeroFactura}`}>
                            Ver
                          </Boton>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Tarjeta>
          {datos.length === 300 && <p className="mt-3 text-sm text-cafe-500">Se muestran las 300 ventas más recientes del periodo. Acorte las fechas para ver el resto.</p>}
        </>
      )}

      <Modal abierto={viendo !== null} titulo="Comprobante de venta" alCerrar={() => setViendo(null)}>
        {viendo !== null && <DetalleVenta idVenta={viendo} alCambiar={recargar} />}
      </Modal>
    </>
  );
}
