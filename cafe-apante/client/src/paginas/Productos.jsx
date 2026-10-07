import { Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { gramosALibras } from '../../../shared/calculos.js';
import { api, useDatos } from '../api.js';
import { useAvisos, useSesion } from '../contexto.jsx';
import { aNumero, cordobas, libras } from '../formato.js';
import { Boton, Cargando, Casilla, Encabezado, Entrada, EstadoVacio, Insignia, MensajeError, Modal, Nota, Segmentado, Semaforo, Tarjeta } from '../ui.jsx';

const BOLSA_400G = { nombre: 'Bolsa 400 g', pesoLibras: String(gramosALibras(400)), precio: '', precioMayorista: '' };
const BOLSA_1LB = { nombre: 'Bolsa 1 lb', pesoLibras: '1', precio: '', precioMayorista: '' };
const NUEVO = { nombre: '', tipo: 'MOLIDO', descripcion: '', puntoReorden: '', aplicaIVA: true, estado: 'ACTIVO', presentaciones: [BOLSA_400G, BOLSA_1LB] };

function aFormulario(producto) {
  return {
    ...producto,
    descripcion: producto.descripcion ?? '',
    puntoReorden: String(producto.puntoReorden),
    aplicaIVA: Boolean(producto.aplicaIVA),
    presentaciones: producto.presentaciones.map((p) => ({ ...p, pesoLibras: String(p.pesoLibras), precio: String(p.precio), precioMayorista: String(p.precioMayorista) })),
  };
}

function FormularioProducto({ producto, alGuardar, alCancelar }) {
  const avisos = useAvisos();
  const { config } = useSesion();
  const [datos, setDatos] = useState(() => (producto ? aFormulario(producto) : NUEVO));
  const [guardando, setGuardando] = useState(false);
  const cambiar = (campo) => (e) => setDatos((d) => ({ ...d, [campo]: e.target.value }));
  const cambiarPresentacion = (indice, campo) => (e) =>
    setDatos((d) => ({ ...d, presentaciones: d.presentaciones.map((p, i) => (i === indice ? { ...p, [campo]: e.target.value } : p)) }));

  const presentacionesValidas = datos.presentaciones.every((p) => p.nombre.trim() && aNumero(p.pesoLibras) > 0 && aNumero(p.precio) !== null && aNumero(p.precioMayorista) !== null);
  const valido = datos.nombre.trim() && aNumero(datos.puntoReorden) !== null && datos.presentaciones.length > 0 && presentacionesValidas;

  async function alEnviar(e) {
    e.preventDefault();
    setGuardando(true);
    try {
      const cuerpo = {
        nombre: datos.nombre,
        tipo: datos.tipo,
        descripcion: datos.descripcion,
        puntoReorden: aNumero(datos.puntoReorden),
        aplicaIVA: datos.aplicaIVA,
        estado: datos.estado,
        presentaciones: datos.presentaciones.map((p) => ({ idPresentacion: p.idPresentacion ?? null, nombre: p.nombre, pesoLibras: aNumero(p.pesoLibras), precio: aNumero(p.precio), precioMayorista: aNumero(p.precioMayorista) })),
      };
      if (producto) await api(`/productos/${producto.idProducto}`, { metodo: 'PUT', cuerpo });
      else await api('/productos', { metodo: 'POST', cuerpo });
      avisos.exito(producto ? 'El producto se actualizó.' : 'El producto se creó. Ya puede registrarle entradas de café.');
      alGuardar();
    } catch (err) {
      avisos.error(err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={alEnviar} className="space-y-5">
      <Entrada etiqueta="Nombre del producto" value={datos.nombre} onChange={cambiar('nombre')} maxLength={100} placeholder="Ejemplo: Café Molido Tueste Medio" required autoFocus />
      <div className="grid gap-5 sm:grid-cols-2">
        <Segmentado
          etiqueta="Tipo"
          valor={datos.tipo}
          alCambiar={(tipo) => setDatos((d) => ({ ...d, tipo }))}
          opciones={[
            { valor: 'MOLIDO', etiqueta: 'Molido' },
            { valor: 'GRANO', etiqueta: 'En grano' },
          ]}
        />
        <Entrada etiqueta="Punto de reorden" sufijo="lb" type="text" inputMode="decimal" min="0" step="0.1" value={datos.puntoReorden} onChange={cambiar('puntoReorden')} ayuda="Stock mínimo. Al llegar aquí el semáforo se pone en rojo." required />
      </div>
      <Entrada etiqueta="Descripción" opcional value={datos.descripcion} onChange={cambiar('descripcion')} maxLength={200} placeholder="Origen, perfil de tueste, notas…" />

      <fieldset>
        <legend className="mb-1 text-[0.95rem] font-semibold text-cafe-800">Presentaciones y precios</legend>
        <p className="mb-3 text-sm text-cafe-500">
          Cada bolsa descuenta su peso del inventario en libras. {config?.tributaria.preciosIncluyenIVA ? 'Los precios se escriben con el IVA ya incluido.' : 'Los precios se escriben sin IVA; el sistema lo suma al cobrar.'}
        </p>
        <div className="space-y-3">
          {datos.presentaciones.map((p, i) => (
            <div key={p.idPresentacion ?? `nueva-${i}`} className="grid gap-3 rounded-xl border border-hueso-300 bg-white p-3 sm:grid-cols-2 lg:grid-cols-[1.3fr_0.9fr_1fr_1fr_auto] lg:items-end">
              <Entrada etiqueta="Presentación" value={p.nombre} onChange={cambiarPresentacion(i, 'nombre')} maxLength={40} required />
              <Entrada etiqueta="Peso" sufijo="lb" type="text" inputMode="decimal" min="0.001" step="0.001" value={p.pesoLibras} onChange={cambiarPresentacion(i, 'pesoLibras')} required />
              <Entrada etiqueta="Precio normal" prefijo="C$" type="text" inputMode="decimal" min="0" step="0.01" value={p.precio} onChange={cambiarPresentacion(i, 'precio')} required />
              <Entrada etiqueta="Precio mayorista" prefijo="C$" type="text" inputMode="decimal" min="0" step="0.01" value={p.precioMayorista} onChange={cambiarPresentacion(i, 'precioMayorista')} required />
              <button
                type="button"
                onClick={() => setDatos((d) => ({ ...d, presentaciones: d.presentaciones.filter((_, j) => j !== i) }))}
                disabled={datos.presentaciones.length === 1}
                className="flex size-13 items-center justify-center rounded-xl border border-hueso-400 text-cafe-600 hover:bg-peligro-50 hover:text-peligro-700 disabled:opacity-40"
                aria-label={`Quitar la presentación ${p.nombre}`}
              >
                <Trash2 className="size-5" />
              </button>
            </div>
          ))}
        </div>
        <Boton variante="secundario" tamano="sm" icono={Plus} className="mt-3" onClick={() => setDatos((d) => ({ ...d, presentaciones: [...d.presentaciones, { nombre: '', pesoLibras: '', precio: '', precioMayorista: '' }] }))}>
          Agregar otra presentación
        </Boton>
      </fieldset>

      <Casilla etiqueta="Este producto paga IVA" ayuda="Desmárquelo solo si el producto está exento del IVA." checked={datos.aplicaIVA} onChange={(aplicaIVA) => setDatos((d) => ({ ...d, aplicaIVA }))} />
      {producto && (
        <Casilla etiqueta="Producto activo" ayuda="Si lo desmarca, deja de aparecer en la Caja y en el Inventario, pero su historial se conserva." checked={datos.estado === 'ACTIVO'} onChange={(activo) => setDatos((d) => ({ ...d, estado: activo ? 'ACTIVO' : 'INACTIVO' }))} />
      )}

      <div className="flex flex-wrap justify-end gap-3">
        <Boton variante="secundario" onClick={alCancelar}>
          Cancelar
        </Boton>
        <Boton type="submit" cargando={guardando} disabled={!valido}>
          {producto ? 'Guardar cambios' : 'Crear producto'}
        </Boton>
      </div>
    </form>
  );
}

export default function Productos() {
  const { datos, cargando, error, recargar } = useDatos('/productos?todos=1');
  const [editando, setEditando] = useState(null); // null | 'nuevo' | producto

  return (
    <>
      <Encabezado titulo="Productos y precios" descripcion="Catálogo de cafés, sus presentaciones de venta (bolsas de 400 g y de 1 lb) y sus precios normal y mayorista.">
        <Boton icono={Plus} onClick={() => setEditando('nuevo')}>
          Nuevo producto
        </Boton>
      </Encabezado>

      {error && <MensajeError mensaje={error} alReintentar={recargar} />}
      {cargando && !datos && <Cargando />}

      {datos?.length === 0 && (
        <Tarjeta>
          <EstadoVacio icono={Tags} titulo="Empiece por crear sus productos" texto="Registre cada café que vende, con el precio de la bolsa de 400 g y de la bolsa de 1 lb. Después Producción podrá registrar las entradas en libras.">
            <Boton icono={Plus} onClick={() => setEditando('nuevo')}>
              Crear el primer producto
            </Boton>
          </EstadoVacio>
        </Tarjeta>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {datos?.map((p) => (
          <article key={p.idProducto} className={`min-w-0 rounded-2xl border border-hueso-300 bg-white p-5 shadow-tarjeta ${p.estado === 'ACTIVO' ? '' : 'opacity-65'}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-xl font-semibold">{p.nombre}</h2>
                <p className="text-sm text-cafe-500">
                  {p.tipo === 'GRANO' ? 'Café en grano' : 'Café molido'}
                  {p.descripcion ? ` · ${p.descripcion}` : ''}
                </p>
              </div>
              <Boton variante="secundario" tamano="sm" icono={Pencil} onClick={() => setEditando(p)}>
                Editar
              </Boton>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {p.estado === 'ACTIVO' ? <Semaforo nivel={p.estadoSemaforo} /> : <Insignia tono="rojo">Inactivo</Insignia>}
              <Insignia>Hay {libras(p.stockActual)}</Insignia>
              <Insignia>Reorden en {libras(p.puntoReorden)}</Insignia>
              {!p.aplicaIVA && <Insignia tono="azul">Exento de IVA</Insignia>}
            </div>
            <div className="mt-4 overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th className="!px-0">Presentación</th>
                  <th className="num">Precio normal</th>
                  <th className="num !pr-0">Mayorista</th>
                </tr>
              </thead>
              <tbody>
                {p.presentaciones.map((pr) => (
                  <tr key={pr.idPresentacion}>
                    <td className="!px-0">
                      {pr.nombre} <span className="text-sm text-cafe-500">({pr.pesoLibras} lb)</span>
                    </td>
                    <td className="num font-semibold">{cordobas(pr.precio)}</td>
                    <td className="num !pr-0 font-semibold">{cordobas(pr.precioMayorista)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </article>
        ))}
      </div>

      {datos?.length > 0 && (
        <Nota className="mt-6 max-w-3xl">El precio mayorista se aplica solo cuando en la Caja se elige un cliente de tipo «Grande». El stock se modifica desde Inventario, nunca desde aquí.</Nota>
      )}

      <Modal abierto={Boolean(editando)} titulo={editando === 'nuevo' ? 'Nuevo producto' : 'Editar producto'} alCerrar={() => setEditando(null)} ancho="lg">
        {editando && (
          <FormularioProducto
            producto={editando === 'nuevo' ? null : editando}
            alCancelar={() => setEditando(null)}
            alGuardar={() => {
              setEditando(null);
              recargar();
            }}
          />
        )}
      </Modal>
    </>
  );
}
