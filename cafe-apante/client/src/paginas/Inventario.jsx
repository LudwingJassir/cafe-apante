import { ClipboardCheck, History, Package, PackageMinus, PackagePlus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, useDatos } from '../api.js';
import { useAvisos, useSesion } from '../contexto.jsx';
import { aNumero, fechaHora, librasExactas as libras } from '../formato.js';
import { AreaTexto, Boton, Cargando, Encabezado, Entrada, EstadoVacio, Insignia, MensajeError, Modal, NIVELES, Nota, Selector, Semaforo, Tarjeta } from '../ui.jsx';

const ACCIONES = {
  entrada: { titulo: 'Registrar entrada de café', descripcion: 'Café procesado que entra a la bodega, en libras.', ruta: '/inventario/entrada', boton: 'Registrar entrada', exito: 'Entrada registrada. El stock ya se actualizó.' },
  merma: { titulo: 'Registrar merma', descripcion: 'Café que se pierde, se daña o se regala como muestra.', ruta: '/inventario/merma', boton: 'Registrar merma', exito: 'Merma registrada. El stock ya se actualizó.' },
  ajuste: { titulo: 'Ajuste por conteo físico', descripcion: 'Si lo contado en bodega no coincide con el sistema, anote lo que realmente hay.', ruta: '/inventario/ajuste', boton: 'Guardar ajuste', exito: 'Ajuste guardado. El stock ya coincide con el conteo.' },
};

const TIPOS_MOVIMIENTO = {
  ENTRADA: { texto: 'Entrada', tono: 'verde' },
  VENTA: { texto: 'Venta', tono: 'neutro' },
  MERMA: { texto: 'Merma', tono: 'rojo' },
  AJUSTE: { texto: 'Ajuste', tono: 'ambar' },
  ANULACION: { texto: 'Anulación', tono: 'azul' },
};

function FormularioMovimiento({ accion, productos, productoInicial, alTerminar, alCancelar }) {
  const avisos = useAvisos();
  const definicion = ACCIONES[accion];
  const [idProducto, setIdProducto] = useState(String(productoInicial ?? productos[0]?.idProducto ?? ''));
  const [cantidad, setCantidad] = useState('');
  const [lote, setLote] = useState('');
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);

  const producto = productos.find((p) => String(p.idProducto) === idProducto);
  const valor = aNumero(cantidad);
  const excede = accion === 'merma' && valor !== null && producto && valor > producto.stockActual;
  const diferencia = accion === 'ajuste' && valor !== null && producto ? Math.round((valor - producto.stockActual) * 1000) / 1000 : null;
  const motivoObligatorio = accion !== 'entrada';
  const valido = producto && valor !== null && (accion === 'ajuste' ? valor >= 0 && diferencia !== 0 : valor > 0) && !excede && (!motivoObligatorio || motivo.trim().length >= 3);

  async function alEnviar(e) {
    e.preventDefault();
    setGuardando(true);
    try {
      const cuerpo = { idProducto: Number(idProducto), motivo };
      if (accion === 'ajuste') cuerpo.stockFisico = valor;
      else cuerpo.cantidadLibras = valor;
      if (accion === 'entrada') cuerpo.lote = lote;
      await api(definicion.ruta, { metodo: 'POST', cuerpo });
      avisos.exito(definicion.exito);
      alTerminar();
    } catch (err) {
      avisos.error(err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={alEnviar} className="space-y-5">
      <Selector etiqueta="Producto" value={idProducto} onChange={(e) => setIdProducto(e.target.value)}>
        {productos.map((p) => (
          <option key={p.idProducto} value={p.idProducto}>
            {p.nombre} — hay {libras(p.stockActual)}
          </option>
        ))}
      </Selector>
      <Entrada
        etiqueta={accion === 'ajuste' ? 'Libras que hay realmente en bodega' : accion === 'entrada' ? 'Libras que entran' : 'Libras que se pierden'}
        sufijo="lb"
        type="text"
        inputMode="decimal"
        min="0"
        step="0.001"
        placeholder="0"
        value={cantidad}
        onChange={(e) => setCantidad(e.target.value)}
        error={excede ? `Solo hay ${libras(producto.stockActual)} en el sistema.` : null}
        autoFocus
      />
      {diferencia !== null && (
        <Nota tono={diferencia === 0 ? 'verde' : 'ambar'}>
          {diferencia === 0
            ? 'El conteo coincide con el sistema: no hace falta ajustar.'
            : `El sistema tiene ${libras(producto.stockActual)}. Se registrará una diferencia de ${diferencia > 0 ? '+' : ''}${diferencia} lb.`}
        </Nota>
      )}
      {accion === 'entrada' && <Entrada etiqueta="Número de lote" opcional value={lote} onChange={(e) => setLote(e.target.value)} maxLength={40} placeholder="Ejemplo: L-2026-041" />}
      <AreaTexto
        etiqueta={accion === 'entrada' ? 'Nota' : 'Motivo'}
        opcional={!motivoObligatorio}
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        maxLength={200}
        placeholder={accion === 'merma' ? 'Ejemplo: bolsa rota, café humedecido, muestra para catación' : accion === 'ajuste' ? 'Ejemplo: conteo físico de fin de mes' : ''}
      />
      <div className="flex flex-wrap justify-end gap-3">
        <Boton variante="secundario" onClick={alCancelar}>
          Cancelar
        </Boton>
        <Boton type="submit" variante={accion === 'entrada' ? 'exito' : 'primario'} cargando={guardando} disabled={!valido}>
          {definicion.boton}
        </Boton>
      </div>
    </form>
  );
}

function BarraStock({ stock, puntoReorden, nivel }) {
  // La escala llega al triple del punto de reorden; la marca indica el mínimo.
  const tope = Math.max(puntoReorden * 3, stock, 1);
  return (
    <div className="relative h-3 w-full min-w-28 rounded-full bg-hueso-200" aria-hidden>
      <div className={`h-full rounded-full ${NIVELES[nivel].barra}`} style={{ width: `${Math.min(100, (stock / tope) * 100)}%` }} />
      {puntoReorden > 0 && <div className="absolute -top-1 h-5 w-0.5 rounded bg-cafe-800" style={{ left: `${(puntoReorden / tope) * 100}%` }} title="Punto de reorden" />}
    </div>
  );
}

function Movimientos({ productos }) {
  const [idProducto, setIdProducto] = useState('');
  const [tipo, setTipo] = useState('');
  const parametros = new URLSearchParams();
  if (idProducto) parametros.set('idProducto', idProducto);
  if (tipo) parametros.set('tipo', tipo);
  const { datos, cargando, error, recargar } = useDatos(`/inventario/movimientos?${parametros}`);

  return (
    <Tarjeta titulo="Historial de movimientos" descripcion="Cada entrada, venta, merma y ajuste queda registrado con su responsable." relleno={false}>
      <div className="grid gap-4 border-b border-hueso-200 p-5 sm:grid-cols-2 lg:max-w-2xl">
        <Selector etiqueta="Producto" value={idProducto} onChange={(e) => setIdProducto(e.target.value)}>
          <option value="">Todos</option>
          {productos.map((p) => (
            <option key={p.idProducto} value={p.idProducto}>
              {p.nombre}
            </option>
          ))}
        </Selector>
        <Selector etiqueta="Tipo de movimiento" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="">Todos</option>
          {Object.entries(TIPOS_MOVIMIENTO).map(([valor, { texto }]) => (
            <option key={valor} value={valor}>
              {texto}
            </option>
          ))}
        </Selector>
      </div>
      {error && <div className="p-5"><MensajeError mensaje={error} alReintentar={recargar} /></div>}
      {cargando && !datos && <Cargando />}
      {datos?.length === 0 && <EstadoVacio icono={History} titulo="Sin movimientos" texto="Todavía no hay movimientos con esos filtros." />}
      {datos?.length > 0 && (
        <div className="overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Producto</th>
                <th>Tipo</th>
                <th className="num">Libras</th>
                <th className="num">Stock después</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {datos.map((m) => (
                <tr key={m.idMovimiento}>
                  <td className="whitespace-nowrap">
                    {fechaHora(m.fecha)}
                    <span className="block text-sm text-cafe-500">{m.usuario}</span>
                  </td>
                  <td>{m.producto}</td>
                  <td>
                    <Insignia tono={TIPOS_MOVIMIENTO[m.tipo].tono}>{TIPOS_MOVIMIENTO[m.tipo].texto}</Insignia>
                  </td>
                  <td className={`num font-semibold ${m.cantidadLibras < 0 ? 'text-peligro-700' : 'text-hoja-700'}`}>
                    {m.cantidadLibras > 0 ? '+' : '−'}
                    {Math.abs(m.cantidadLibras).toLocaleString('es-NI', { maximumFractionDigits: 3 })}
                  </td>
                  <td className="num">{libras(m.stockResultante)}</td>
                  <td className="max-w-xs text-cafe-600">{[m.lote && `Lote ${m.lote}`, m.motivo].filter(Boolean).join(' · ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Tarjeta>
  );
}

export default function Inventario() {
  const { usuario, refrescarNotificaciones } = useSesion();
  const { datos: productos, cargando, error, recargar } = useDatos('/productos');
  const [accion, setAccion] = useState(null); // { tipo, idProducto }
  const [version, setVersion] = useState(0);
  const puedeMover = usuario.rol === 'ADMIN' || usuario.rol === 'PRODUCCION';

  if (cargando && !productos) return <Cargando />;
  if (error) return <MensajeError mensaje={error} alReintentar={recargar} />;

  const cuenta = (niveles) => productos.filter((p) => niveles.includes(p.estadoSemaforo)).length;
  const totalLibras = productos.reduce((s, p) => s + p.stockActual, 0);

  function alTerminar() {
    setAccion(null);
    recargar();
    setVersion((v) => v + 1);
    refrescarNotificaciones();
  }

  return (
    <>
      <Encabezado titulo="Inventario" descripcion="Existencias de café en libras. El semáforo avisa cuando un producto se acerca o llega a su punto de reorden.">
        {puedeMover && productos.length > 0 && (
          <>
            <Boton variante="exito" icono={PackagePlus} onClick={() => setAccion({ tipo: 'entrada' })}>
              Registrar entrada
            </Boton>
            <Boton variante="secundario" icono={PackageMinus} onClick={() => setAccion({ tipo: 'merma' })}>
              Registrar merma
            </Boton>
            <Boton variante="secundario" icono={ClipboardCheck} onClick={() => setAccion({ tipo: 'ajuste' })}>
              Ajuste por conteo
            </Boton>
          </>
        )}
      </Encabezado>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-hueso-300 bg-white p-5 shadow-tarjeta">
          <p className="text-[0.95rem] font-semibold text-cafe-600">Café en bodega</p>
          <p className="mt-2 font-display text-[1.9rem] font-semibold leading-tight tabular-nums">{libras(totalLibras)}</p>
        </div>
        {[
          { niveles: ['OK'], etiqueta: 'Con stock suficiente', nivel: 'OK' },
          { niveles: ['MEDIO'], etiqueta: 'En stock medio', nivel: 'MEDIO' },
          { niveles: ['BAJO', 'AGOTADO'], etiqueta: 'En stock bajo o agotados', nivel: 'BAJO' },
        ].map(({ niveles, etiqueta, nivel }) => {
          const { Icono, tono } = NIVELES[nivel];
          const color = { verde: 'text-hoja-600', ambar: 'text-alerta-600', rojo: 'text-peligro-600' }[tono];
          return (
            <div key={nivel} className="flex items-center gap-4 rounded-2xl border border-hueso-300 bg-white p-5 shadow-tarjeta">
              <Icono className={`size-10 shrink-0 ${color}`} aria-hidden />
              <div>
                <p className="font-display text-[1.9rem] font-semibold leading-none tabular-nums">{cuenta(niveles)}</p>
                <p className="mt-1 text-[0.95rem] font-semibold text-cafe-600">{etiqueta}</p>
              </div>
            </div>
          );
        })}
      </div>

      <Tarjeta titulo="Existencias por producto" relleno={false} className="mb-6">
        {productos.length === 0 ? (
          <EstadoVacio icono={Package} titulo="Todavía no hay productos" texto={usuario.rol === 'ADMIN' ? 'Cree el catálogo de productos para empezar a llevar el inventario.' : 'El Dueño / Administrador debe crear primero el catálogo de productos.'}>
            {usuario.rol === 'ADMIN' && (
              <Link to="/productos" className="font-semibold text-caramelo-700 underline underline-offset-4">
                Ir a Productos y precios
              </Link>
            )}
          </EstadoVacio>
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th className="num">En bodega</th>
                  <th>Equivale a</th>
                  <th className="num">Reorden en</th>
                  <th className="w-52">Semáforo</th>
                  {puedeMover && (
                    <th>
                      <span className="sr-only">Acciones</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {productos.map((p) => (
                  <tr key={p.idProducto}>
                    <td className="min-w-56">
                      <p className="font-semibold">{p.nombre}</p>
                      <p className="text-sm text-cafe-500">{p.tipo === 'GRANO' ? 'Café en grano' : 'Café molido'}{p.descripcion ? ` · ${p.descripcion}` : ''}</p>
                    </td>
                    <td className="num text-lg font-bold">{libras(p.stockActual)}</td>
                    <td className="text-cafe-600">
                      {p.presentaciones.map((pr) => (
                        <span key={pr.idPresentacion} className="block whitespace-nowrap">
                          {Math.floor(p.stockActual / pr.pesoLibras)} × {pr.nombre}
                        </span>
                      ))}
                    </td>
                    <td className="num">{libras(p.puntoReorden)}</td>
                    <td>
                      <Semaforo nivel={p.estadoSemaforo} />
                      <div className="mt-2">
                        <BarraStock stock={p.stockActual} puntoReorden={p.puntoReorden} nivel={p.estadoSemaforo} />
                      </div>
                    </td>
                    {puedeMover && (
                      <td className="text-right">
                        <Boton variante="secundario" tamano="sm" icono={PackagePlus} onClick={() => setAccion({ tipo: 'entrada', idProducto: p.idProducto })}>
                          Entrada
                        </Boton>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>

      {puedeMover ? <Movimientos key={version} productos={productos} /> : <Nota>Usted puede consultar las existencias. Las entradas, mermas y ajustes los registra el Responsable de Producción.</Nota>}

      <Modal abierto={Boolean(accion)} titulo={accion ? ACCIONES[accion.tipo].titulo : ''} descripcion={accion ? ACCIONES[accion.tipo].descripcion : ''} alCerrar={() => setAccion(null)}>
        {accion && <FormularioMovimiento accion={accion.tipo} productos={productos} productoInicial={accion.idProducto} alTerminar={alTerminar} alCancelar={() => setAccion(null)} />}
      </Modal>
    </>
  );
}
