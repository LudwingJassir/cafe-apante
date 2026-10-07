import { Pencil, Plus, Trash2, Wallet } from 'lucide-react';
import { useState } from 'react';
import { api, useDatos } from '../api.js';
import { useAvisos } from '../contexto.jsx';
import { aNumero, cordobas, fecha, hoyISO } from '../formato.js';
import { Boton, Cargando, Confirmar, Dato, Encabezado, Entrada, EstadoVacio, Insignia, MensajeError, Modal, Selector, Tarjeta } from '../ui.jsx';

function FormularioGasto({ gasto, categorias, alGuardar, alCancelar }) {
  const avisos = useAvisos();
  const [datos, setDatos] = useState(() => ({
    fecha: gasto?.fecha ?? hoyISO(),
    categoria: gasto?.categoria ?? categorias[0],
    descripcion: gasto?.descripcion ?? '',
    monto: gasto ? String(gasto.monto) : '',
    ivaAcreditable: gasto?.ivaAcreditable ? String(gasto.ivaAcreditable) : '',
  }));
  const [guardando, setGuardando] = useState(false);
  const cambiar = (campo) => (e) => setDatos((d) => ({ ...d, [campo]: e.target.value }));
  const monto = aNumero(datos.monto);

  async function alEnviar(e) {
    e.preventDefault();
    setGuardando(true);
    try {
      const cuerpo = { ...datos, monto, ivaAcreditable: aNumero(datos.ivaAcreditable) ?? 0 };
      if (gasto) await api(`/finanzas/gastos/${gasto.idGasto}`, { metodo: 'PUT', cuerpo });
      else await api('/finanzas/gastos', { metodo: 'POST', cuerpo });
      avisos.exito(gasto ? 'El gasto se actualizó.' : 'El gasto quedó registrado.');
      alGuardar();
    } catch (err) {
      avisos.error(err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={alEnviar} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Entrada etiqueta="Fecha" type="date" value={datos.fecha} max={hoyISO()} onChange={cambiar('fecha')} required />
        <Selector etiqueta="Categoría" value={datos.categoria} onChange={cambiar('categoria')}>
          {categorias.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Selector>
      </div>
      <Entrada etiqueta="Descripción" value={datos.descripcion} onChange={cambiar('descripcion')} maxLength={200} placeholder="Ejemplo: 3 quintales de café oro, proveedor de Jinotega" required autoFocus={!gasto} />
      <div className="grid gap-5 sm:grid-cols-2">
        <Entrada etiqueta="Monto sin IVA" prefijo="C$" type="text" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={datos.monto} onChange={cambiar('monto')} required />
        <Entrada etiqueta="IVA que le cobraron" opcional prefijo="C$" type="text" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={datos.ivaAcreditable} onChange={cambiar('ivaAcreditable')} ayuda="Solo si la factura lo desglosa: se descuenta del IVA a pagar." />
      </div>
      <div className="flex flex-wrap justify-end gap-3">
        <Boton variante="secundario" onClick={alCancelar}>
          Cancelar
        </Boton>
        <Boton type="submit" cargando={guardando} disabled={!monto || monto <= 0 || datos.descripcion.trim().length < 3}>
          {gasto ? 'Guardar cambios' : 'Registrar gasto'}
        </Boton>
      </div>
    </form>
  );
}

export default function Gastos() {
  const avisos = useAvisos();
  const anioActual = new Date().getFullYear();
  const [anio, setAnio] = useState(anioActual);
  const { datos, cargando, error, recargar } = useDatos(`/finanzas/gastos?anio=${anio}`);
  const [editando, setEditando] = useState(null); // null | 'nuevo' | gasto
  const [borrando, setBorrando] = useState(null);
  const [eliminando, setEliminando] = useState(false);

  async function eliminar() {
    setEliminando(true);
    try {
      await api(`/finanzas/gastos/${borrando.idGasto}`, { metodo: 'DELETE' });
      avisos.exito('El gasto se eliminó.');
      setBorrando(null);
      recargar();
    } catch (err) {
      avisos.error(err.message);
    } finally {
      setEliminando(false);
    }
  }

  const gastos = datos?.gastos ?? [];
  const total = gastos.reduce((s, g) => s + g.monto, 0);
  const iva = gastos.reduce((s, g) => s + g.ivaAcreditable, 0);

  return (
    <>
      <Encabezado titulo="Gastos" descripcion="Compras y gastos del negocio. Sirven para calcular la renta neta del IR anual y el IVA acreditable de cada mes.">
        <div className="w-36">
          <Selector etiqueta="Año" value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
            {[0, 1, 2, 3].map((i) => (
              <option key={i} value={anioActual - i}>
                {anioActual - i}
              </option>
            ))}
          </Selector>
        </div>
        <Boton icono={Plus} onClick={() => setEditando('nuevo')} disabled={!datos}>
          Registrar gasto
        </Boton>
      </Encabezado>

      {error && <MensajeError mensaje={error} alReintentar={recargar} />}
      {cargando && !datos && <Cargando />}

      {datos && (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <Dato etiqueta={`Gastos de ${datos.anio}`} valor={cordobas(total)} detalle={`${gastos.length} registro(s)`} icono={Wallet} />
            <Dato etiqueta="IVA acreditable" valor={cordobas(iva)} detalle="Se resta del IVA por pagar" />
            <Dato etiqueta="Promedio por registro" valor={cordobas(gastos.length ? total / gastos.length : 0)} />
          </div>

          <Tarjeta relleno={false}>
            {gastos.length === 0 ? (
              <EstadoVacio icono={Wallet} titulo={`Sin gastos registrados en ${datos.anio}`} texto="Anote las compras de café, empaque, salarios y servicios para que la estimación del IR anual sea realista.">
                <Boton icono={Plus} onClick={() => setEditando('nuevo')}>
                  Registrar el primer gasto
                </Boton>
              </EstadoVacio>
            ) : (
              <div className="overflow-x-auto">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Categoría</th>
                      <th>Descripción</th>
                      <th className="num">Monto sin IVA</th>
                      <th className="num">IVA</th>
                      <th>
                        <span className="sr-only">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {gastos.map((g) => (
                      <tr key={g.idGasto}>
                        <td className="whitespace-nowrap">{fecha(g.fecha)}</td>
                        <td>
                          <Insignia>{g.categoria}</Insignia>
                        </td>
                        <td>
                          {g.descripcion}
                          <span className="block text-sm text-cafe-500">Registró {g.usuario}</span>
                        </td>
                        <td className="num font-semibold">{cordobas(g.monto)}</td>
                        <td className="num">{g.ivaAcreditable > 0 ? cordobas(g.ivaAcreditable) : '—'}</td>
                        <td>
                          <div className="flex justify-end gap-2">
                            <Boton variante="secundario" tamano="sm" icono={Pencil} onClick={() => setEditando(g)} aria-label={`Editar el gasto ${g.descripcion}`}>
                              Editar
                            </Boton>
                            <Boton variante="secundario" tamano="sm" icono={Trash2} onClick={() => setBorrando(g)} aria-label={`Eliminar el gasto ${g.descripcion}`}>
                              Eliminar
                            </Boton>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Tarjeta>
        </>
      )}

      <Modal abierto={Boolean(editando)} titulo={editando === 'nuevo' ? 'Registrar gasto' : 'Editar gasto'} alCerrar={() => setEditando(null)}>
        {editando && datos && (
          <FormularioGasto
            gasto={editando === 'nuevo' ? null : editando}
            categorias={datos.categorias}
            alCancelar={() => setEditando(null)}
            alGuardar={() => {
              setEditando(null);
              recargar();
            }}
          />
        )}
      </Modal>

      <Confirmar abierto={Boolean(borrando)} titulo="¿Eliminar este gasto?" textoConfirmar="Sí, eliminar" variante="peligro" cargando={eliminando} alConfirmar={eliminar} alCancelar={() => setBorrando(null)}>
        {borrando && (
          <p>
            Se eliminará «{borrando.descripcion}» por <strong>{cordobas(borrando.monto)}</strong>. Dejará de contar en los cálculos de impuestos.
          </p>
        )}
      </Confirmar>
    </>
  );
}
