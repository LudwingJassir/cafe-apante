import { Building2, Pencil, Search, User, UserPlus, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, useDatos } from '../api.js';
import { useAvisos } from '../contexto.jsx';
import { cordobas, fecha, fechaHora, libras, nombreMetodo } from '../formato.js';
import { Boton, Cargando, Casilla, Dato, Encabezado, Entrada, EstadoVacio, Insignia, MensajeError, Modal, Segmentado, Tarjeta } from '../ui.jsx';

const VACIO = { nombre: '', telefono: '', direccion: '', identificacion: '', categoria: 'PEQUENO', esRetenedor: false, estado: 'ACTIVO' };

export function InsigniaCategoria({ categoria }) {
  return categoria === 'GRANDE' ? (
    <Insignia tono="caramelo" icono={Building2}>
      Grande · mayorista
    </Insignia>
  ) : (
    <Insignia icono={User}>Pequeño · minorista</Insignia>
  );
}

/** Formulario de cliente. Se usa en esta pantalla y también desde la Caja para registrar al vuelo. */
export function FormularioCliente({ cliente = null, alGuardar, alCancelar }) {
  const avisos = useAvisos();
  const [datos, setDatos] = useState(() => ({ ...VACIO, ...(cliente ? Object.fromEntries(Object.keys(VACIO).map((k) => [k, cliente[k] ?? VACIO[k]])) : {}) }));
  const [guardando, setGuardando] = useState(false);
  const cambiar = (campo) => (e) => setDatos((d) => ({ ...d, [campo]: e.target.value }));

  async function alEnviar(e) {
    e.preventDefault();
    setGuardando(true);
    try {
      const cuerpo = { ...datos, esRetenedor: Boolean(datos.esRetenedor) };
      const guardado = cliente
        ? await api(`/clientes/${cliente.idCliente}`, { metodo: 'PUT', cuerpo })
        : await api('/clientes', { metodo: 'POST', cuerpo });
      avisos.exito(cliente ? 'Los datos del cliente se actualizaron.' : `Se registró a ${guardado.nombre}.`);
      alGuardar(guardado);
    } catch (err) {
      avisos.error(err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={alEnviar} className="space-y-5">
      <Entrada etiqueta="Nombre del cliente o del negocio" value={datos.nombre} onChange={cambiar('nombre')} maxLength={120} required autoFocus />
      <Segmentado
        etiqueta="Tipo de cliente"
        valor={datos.categoria}
        alCambiar={(categoria) => setDatos((d) => ({ ...d, categoria, esRetenedor: categoria === 'GRANDE' ? d.esRetenedor : false }))}
        opciones={[
          { valor: 'PEQUENO', etiqueta: 'Pequeño (minorista)', icono: User },
          { valor: 'GRANDE', etiqueta: 'Grande (mayorista)', icono: Building2 },
        ]}
      />
      <p className="-mt-2 text-sm text-cafe-500">
        {datos.categoria === 'GRANDE' ? 'Compra al por mayor o es distribuidor: se le cobra el precio mayorista.' : 'Consumidor final en el punto de venta: se le cobra el precio normal.'}
      </p>
      <div className="grid gap-5 sm:grid-cols-2">
        <Entrada etiqueta="Teléfono" opcional value={datos.telefono ?? ''} onChange={cambiar('telefono')} maxLength={30} inputMode="tel" />
        <Entrada etiqueta="RUC o cédula" opcional value={datos.identificacion ?? ''} onChange={cambiar('identificacion')} maxLength={30} />
      </div>
      <Entrada etiqueta="Dirección" opcional value={datos.direccion ?? ''} onChange={cambiar('direccion')} maxLength={200} />
      {datos.categoria === 'GRANDE' && (
        <Casilla
          etiqueta="Este cliente nos retiene el IR"
          ayuda="Márquelo si es un gran contribuyente que descuenta la retención en la fuente al pagar. El sistema la calcula sola en cada venta."
          checked={Boolean(datos.esRetenedor)}
          onChange={(esRetenedor) => setDatos((d) => ({ ...d, esRetenedor }))}
        />
      )}
      {cliente && (
        <Casilla
          etiqueta="Cliente activo"
          ayuda="Si lo desmarca, deja de aparecer al vender, pero su historial se conserva."
          checked={datos.estado === 'ACTIVO'}
          onChange={(activo) => setDatos((d) => ({ ...d, estado: activo ? 'ACTIVO' : 'INACTIVO' }))}
        />
      )}
      <div className="flex flex-wrap justify-end gap-3 pt-1">
        <Boton variante="secundario" onClick={alCancelar}>
          Cancelar
        </Boton>
        <Boton type="submit" cargando={guardando} disabled={!datos.nombre.trim()}>
          {cliente ? 'Guardar cambios' : 'Registrar cliente'}
        </Boton>
      </div>
    </form>
  );
}

function FichaCliente({ idCliente, alEditar }) {
  const { datos: c, cargando, error } = useDatos(`/clientes/${idCliente}`);
  if (cargando && !c) return <Cargando />;
  if (error) return <MensajeError mensaje={error} />;
  const r = c.resumen;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <InsigniaCategoria categoria={c.categoria} />
        {c.esRetenedor && <Insignia tono="azul">Retiene IR</Insignia>}
        {c.estado !== 'ACTIVO' && <Insignia tono="rojo">Inactivo</Insignia>}
        <span className="text-cafe-600">{[c.telefono, c.identificacion, c.direccion].filter(Boolean).join(' · ') || 'Sin datos de contacto'}</span>
        <Boton variante="secundario" tamano="sm" icono={Pencil} className="ml-auto" onClick={() => alEditar(c)}>
          Editar
        </Boton>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Dato etiqueta="Compras" valor={r.compras} detalle={r.ultimaCompra ? `Última: ${fecha(r.ultimaCompra)}` : 'Aún no compra'} />
        <Dato etiqueta="Total comprado" valor={cordobas(r.totalComprado)} />
        <Dato etiqueta="Café llevado" valor={libras(r.librasCompradas)} />
        <Dato etiqueta="Vuelve cada" valor={r.diasEntreCompras ? `${r.diasEntreCompras} días` : '—'} detalle="Promedio entre compras" />
      </div>

      <div>
        <h3 className="mb-2 text-lg font-semibold">Lo que más compra</h3>
        {c.favoritos.length === 0 ? (
          <p className="text-cafe-500">Todavía no hay compras registradas.</p>
        ) : (
          <ul className="divide-y divide-hueso-200 rounded-xl border border-hueso-300 bg-white">
            {c.favoritos.map((f) => (
              <li key={f.descripcion} className="flex justify-between gap-4 px-4 py-2.5">
                <span>{f.descripcion}</span>
                <span className="shrink-0 font-semibold tabular-nums">
                  {f.bolsas} bolsas · {libras(f.libras)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-lg font-semibold">Historial de compras</h3>
        {c.ventas.length === 0 ? (
          <p className="text-cafe-500">Sin compras todavía.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-hueso-300 bg-white">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Comprobante</th>
                  <th>Pago</th>
                  <th className="num">Libras</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {c.ventas.map((v) => (
                  <tr key={v.idVenta} className={v.estado === 'ANULADA' ? 'text-cafe-500' : ''}>
                    <td className="whitespace-nowrap">{fechaHora(v.fecha)}</td>
                    <td>
                      {v.numeroFactura}
                      {v.estado === 'ANULADA' && <Insignia tono="rojo" className="ml-2">Anulada</Insignia>}
                    </td>
                    <td>{nombreMetodo(v.metodoPago, v.monedaPago)}</td>
                    <td className="num">{libras(v.totalLibras)}</td>
                    <td className="num font-semibold">{cordobas(v.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Clientes() {
  const [buscar, setBuscar] = useState('');
  const [consulta, setConsulta] = useState('');
  const [verInactivos, setVerInactivos] = useState(false);
  const [editando, setEditando] = useState(null); // null | 'nuevo' | cliente
  const [viendo, setViendo] = useState(null);

  // Se espera a que la persona termine de escribir antes de buscar.
  useEffect(() => {
    const espera = setTimeout(() => setConsulta(buscar.trim()), 300);
    return () => clearTimeout(espera);
  }, [buscar]);

  const ruta = `/clientes?${new URLSearchParams({ ...(consulta ? { buscar: consulta } : {}), ...(verInactivos ? { todos: '1' } : {}) })}`;
  const { datos, cargando, error, recargar } = useDatos(ruta);

  return (
    <>
      <Encabezado titulo="Clientes" descripcion="Catálogo de compradores con su historial. Los clientes «Grandes» reciben precio mayorista de forma automática.">
        <Boton icono={UserPlus} onClick={() => setEditando('nuevo')}>
          Nuevo cliente
        </Boton>
      </Encabezado>

      <div className="mb-5 flex flex-wrap items-center gap-4">
        <div className="relative w-full sm:w-96">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-cafe-400" aria-hidden />
          <input className="control pl-12" type="search" placeholder="Buscar por nombre, teléfono o RUC" value={buscar} onChange={(e) => setBuscar(e.target.value)} aria-label="Buscar cliente" />
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-cafe-700">
          <input type="checkbox" className="size-5 accent-caramelo-600" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} />
          Mostrar también los inactivos
        </label>
      </div>

      {error && <MensajeError mensaje={error} alReintentar={recargar} />}
      {cargando && !datos && <Cargando />}

      {datos && (
        <Tarjeta relleno={false}>
          {datos.length === 0 ? (
            <EstadoVacio
              icono={Users}
              titulo={consulta ? 'No se encontró ningún cliente' : 'Aún no hay clientes registrados'}
              texto={consulta ? 'Pruebe con otro nombre o revise la ortografía.' : 'Registre a sus compradores frecuentes para ver su historial y darles precio mayorista.'}
            >
              {!consulta && (
                <Boton icono={UserPlus} onClick={() => setEditando('nuevo')}>
                  Registrar el primer cliente
                </Boton>
              )}
            </EstadoVacio>
          ) : (
            <div className="overflow-x-auto">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Tipo</th>
                    <th className="num">Compras</th>
                    <th className="num">Total comprado</th>
                    <th>Última compra</th>
                    <th>
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {datos.map((c) => (
                    <tr key={c.idCliente} className={c.estado === 'ACTIVO' ? '' : 'opacity-60'}>
                      <td>
                        <p className="font-semibold">
                          {c.nombre} {c.estado !== 'ACTIVO' && <Insignia tono="rojo" className="ml-1">Inactivo</Insignia>}
                        </p>
                        <p className="text-sm text-cafe-500">{[c.telefono, c.identificacion].filter(Boolean).join(' · ') || '—'}</p>
                      </td>
                      <td>
                        <InsigniaCategoria categoria={c.categoria} />
                      </td>
                      <td className="num">{c.compras}</td>
                      <td className="num font-semibold">{cordobas(c.totalComprado)}</td>
                      <td className="whitespace-nowrap">{c.ultimaCompra ? fecha(c.ultimaCompra) : 'Sin compras'}</td>
                      <td className="text-right">
                        <Boton variante="secundario" tamano="sm" onClick={() => setViendo(c)} aria-label={`Ver la ficha de ${c.nombre}`}>
                          Ver ficha
                        </Boton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Tarjeta>
      )}

      <Modal abierto={Boolean(editando)} titulo={editando === 'nuevo' ? 'Nuevo cliente' : 'Editar cliente'} alCerrar={() => setEditando(null)}>
        {editando && (
          <FormularioCliente
            cliente={editando === 'nuevo' ? null : editando}
            alCancelar={() => setEditando(null)}
            alGuardar={() => {
              setEditando(null);
              recargar();
            }}
          />
        )}
      </Modal>

      <Modal abierto={Boolean(viendo)} titulo={viendo?.nombre ?? ''} alCerrar={() => setViendo(null)} ancho="lg">
        {viendo && (
          <FichaCliente
            idCliente={viendo.idCliente}
            alEditar={(cliente) => {
              setViendo(null);
              setEditando(cliente);
            }}
          />
        )}
      </Modal>
    </>
  );
}
