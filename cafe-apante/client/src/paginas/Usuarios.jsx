import { Check, KeyRound, Minus, Pencil, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { api, useDatos } from '../api.js';
import { useAvisos, useSesion } from '../contexto.jsx';
import { fechaHora, NOMBRE_ROL } from '../formato.js';
import { Boton, Cargando, Casilla, Encabezado, Entrada, Insignia, MensajeError, Modal, Nota, Selector, Tarjeta } from '../ui.jsx';

const ROLES = ['ADMIN', 'VENTAS', 'PRODUCCION'];
const TONO_ROL = { ADMIN: 'caramelo', VENTAS: 'azul', PRODUCCION: 'verde' };

// Resumen de lo que permite cada rol (lo hace cumplir el servidor en cada petición).
const PERMISOS = [
  ['Dashboard y reportes gerenciales', true, false, false],
  ['Caja: registrar ventas y comprobantes', true, true, false],
  ['Arqueo y cierre de caja', true, true, false],
  ['Anular ventas', true, false, false],
  ['Clientes', true, true, false],
  ['Consultar existencias', true, true, true],
  ['Entradas, mermas y ajustes de inventario', true, false, true],
  ['Productos y precios', true, false, false],
  ['Proyección de demanda', true, false, true],
  ['Impuestos DGI y gastos', true, false, false],
  ['Usuarios, configuración y respaldos', true, false, false],
  ['Notificaciones de su área', true, true, true],
];

const NOMBRE_ACCION = {
  LOGIN: 'Inició sesión', LOGIN_BLOQUEADO: 'Bloqueo por intentos fallidos', CAMBIO_CONTRASENA: 'Cambió su contraseña', CONTRASENA_RESTABLECIDA: 'Restableció una contraseña',
  USUARIO_CREADO: 'Creó un usuario', USUARIO_EDITADO: 'Editó un usuario', PRODUCTO_CREADO: 'Creó un producto', PRODUCTO_EDITADO: 'Editó un producto',
  CAJA_ABIERTA: 'Abrió la caja', CAJA_CERRADA: 'Cerró la caja', VENTA_ANULADA: 'Anuló una venta', GASTO_REGISTRADO: 'Registró un gasto', GASTO_EDITADO: 'Editó un gasto',
  GASTO_ELIMINADO: 'Eliminó un gasto', CONFIG_TRIBUTARIA: 'Cambió parámetros tributarios', CONFIG_NEGOCIO: 'Cambió la configuración', RESPALDO: 'Respaldo de datos',
};

function FormularioUsuario({ usuario, esUnoMismo, alGuardar, alCancelar }) {
  const avisos = useAvisos();
  const [datos, setDatos] = useState({ nombre: usuario?.nombre ?? '', usuario: usuario?.usuario ?? '', correo: usuario?.correo ?? '', rol: usuario?.rol ?? 'VENTAS', estado: usuario?.estado ?? 'ACTIVO', contrasena: '' });
  const [guardando, setGuardando] = useState(false);
  const cambiar = (campo) => (e) => setDatos((d) => ({ ...d, [campo]: e.target.value }));
  const valido = datos.nombre.trim() && (usuario || (datos.usuario.trim().length >= 3 && datos.contrasena.length >= 8));

  async function alEnviar(e) {
    e.preventDefault();
    setGuardando(true);
    try {
      if (usuario) await api(`/usuarios/${usuario.idUsuario}`, { metodo: 'PUT', cuerpo: { nombre: datos.nombre, correo: datos.correo, rol: datos.rol, estado: datos.estado } });
      else await api('/usuarios', { metodo: 'POST', cuerpo: { nombre: datos.nombre, usuario: datos.usuario.trim(), correo: datos.correo, rol: datos.rol, contrasena: datos.contrasena } });
      avisos.exito(usuario ? 'El usuario se actualizó.' : 'Usuario creado. Deberá cambiar la contraseña temporal al entrar por primera vez.');
      alGuardar();
    } catch (err) {
      avisos.error(err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={alEnviar} className="space-y-5">
      <Entrada etiqueta="Nombre completo" value={datos.nombre} onChange={cambiar('nombre')} maxLength={100} required autoFocus />
      {!usuario && <Entrada etiqueta="Nombre de usuario" value={datos.usuario} onChange={cambiar('usuario')} maxLength={40} autoCapitalize="none" spellCheck={false} ayuda="Es lo que escribirá para entrar. Sin espacios, por ejemplo: maria.lopez" required />}
      <Entrada etiqueta="Correo" opcional type="email" value={datos.correo} onChange={cambiar('correo')} maxLength={120} />
      <Selector etiqueta="Rol" value={datos.rol} onChange={cambiar('rol')} disabled={esUnoMismo} ayuda={esUnoMismo ? 'No puede cambiar su propio rol.' : 'El rol define a qué partes del sistema puede entrar.'}>
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {NOMBRE_ROL[r]}
          </option>
        ))}
      </Selector>
      {!usuario && <Entrada etiqueta="Contraseña temporal" type="text" value={datos.contrasena} onChange={cambiar('contrasena')} maxLength={72} autoComplete="off" ayuda="Al menos 8 caracteres, con letras y números. La persona la cambiará al entrar." required />}
      {usuario && !esUnoMismo && (
        <Casilla etiqueta="Usuario activo" ayuda="Si lo desmarca, esa persona ya no podrá entrar al sistema. Su historial se conserva." checked={datos.estado === 'ACTIVO'} onChange={(activo) => setDatos((d) => ({ ...d, estado: activo ? 'ACTIVO' : 'INACTIVO' }))} />
      )}
      <div className="flex flex-wrap justify-end gap-3">
        <Boton variante="secundario" onClick={alCancelar}>
          Cancelar
        </Boton>
        <Boton type="submit" cargando={guardando} disabled={!valido}>
          {usuario ? 'Guardar cambios' : 'Crear usuario'}
        </Boton>
      </div>
    </form>
  );
}

function RestablecerClave({ usuario, alTerminar, alCancelar }) {
  const avisos = useAvisos();
  const [contrasena, setContrasena] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function alEnviar(e) {
    e.preventDefault();
    setGuardando(true);
    try {
      await api(`/usuarios/${usuario.idUsuario}/restablecer`, { metodo: 'POST', cuerpo: { contrasena } });
      avisos.exito(`Contraseña temporal asignada a ${usuario.nombre}. Deberá cambiarla al entrar.`);
      alTerminar();
    } catch (err) {
      avisos.error(err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={alEnviar} className="space-y-5">
      <p className="text-cafe-700">Escriba una contraseña temporal y entréguesela en persona. El sistema le pedirá cambiarla en cuanto entre, y cualquier sesión que tuviera abierta se cierra.</p>
      <Entrada etiqueta="Contraseña temporal" type="text" value={contrasena} onChange={(e) => setContrasena(e.target.value)} maxLength={72} autoComplete="off" ayuda="Al menos 8 caracteres, con letras y números." autoFocus />
      <div className="flex flex-wrap justify-end gap-3">
        <Boton variante="secundario" onClick={alCancelar}>
          Cancelar
        </Boton>
        <Boton type="submit" icono={KeyRound} cargando={guardando} disabled={contrasena.length < 8}>
          Asignar contraseña temporal
        </Boton>
      </div>
    </form>
  );
}

export default function Usuarios() {
  const { usuario: yo } = useSesion();
  const usuarios = useDatos('/usuarios');
  const bitacora = useDatos('/usuarios/bitacora');
  const [editando, setEditando] = useState(null); // null | 'nuevo' | usuario
  const [restableciendo, setRestableciendo] = useState(null);

  function alGuardar() {
    setEditando(null);
    setRestableciendo(null);
    usuarios.recargar();
    bitacora.recargar();
  }

  return (
    <>
      <Encabezado titulo="Usuarios y permisos" descripcion="Quién puede entrar al sistema y qué puede hacer. Como todos comparten la misma laptop, cada persona debe usar su propio usuario.">
        <Boton icono={UserPlus} onClick={() => setEditando('nuevo')}>
          Nuevo usuario
        </Boton>
      </Encabezado>

      {usuarios.error && <MensajeError mensaje={usuarios.error} alReintentar={usuarios.recargar} />}
      {usuarios.cargando && !usuarios.datos && <Cargando />}

      {usuarios.datos && (
        <Tarjeta relleno={false}>
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th>Último acceso</th>
                  <th>
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {usuarios.datos.map((u) => (
                  <tr key={u.idUsuario} className={u.estado === 'ACTIVO' ? '' : 'opacity-60'}>
                    <td>
                      <p className="font-semibold">
                        {u.nombre} {u.idUsuario === yo.idUsuario && <span className="font-normal text-cafe-500">(usted)</span>}
                      </p>
                      <p className="text-sm text-cafe-500">
                        Entra como <span className="font-mono font-semibold text-cafe-700">{u.usuario}</span>
                        {u.correo ? ` · ${u.correo}` : ''}
                      </p>
                    </td>
                    <td>
                      <Insignia tono={TONO_ROL[u.rol]}>{NOMBRE_ROL[u.rol]}</Insignia>
                    </td>
                    <td>
                      <div className="flex flex-col items-start gap-1.5">
                        {u.estado === 'ACTIVO' ? <Insignia tono="verde">Activo</Insignia> : <Insignia tono="rojo">Inactivo</Insignia>}
                        {u.debeCambiarContrasena && <Insignia>Contraseña temporal</Insignia>}
                      </div>
                    </td>
                    <td className="whitespace-nowrap">{u.ultimoAcceso ? fechaHora(u.ultimoAcceso) : 'Nunca ha entrado'}</td>
                    <td>
                      <div className="flex justify-end gap-2">
                        <Boton variante="secundario" tamano="sm" icono={Pencil} onClick={() => setEditando(u)} aria-label={`Editar a ${u.nombre}`}>
                          Editar
                        </Boton>
                        <Boton variante="secundario" tamano="sm" icono={KeyRound} onClick={() => setRestableciendo(u)} aria-label={`Dar una contraseña temporal a ${u.nombre}`}>
                          Contraseña
                        </Boton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Tarjeta titulo="Qué puede hacer cada rol" relleno={false}>
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Función</th>
                  <th className="text-center">Dueño</th>
                  <th className="text-center">Ventas</th>
                  <th className="text-center">Producción</th>
                </tr>
              </thead>
              <tbody>
                {PERMISOS.map(([funcion, ...porRol]) => (
                  <tr key={funcion}>
                    <td>{funcion}</td>
                    {porRol.map((permitido, i) => (
                      <td key={i} className="text-center">
                        {permitido ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-hoja-700">
                            <Check className="size-5" aria-hidden /> Sí
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-cafe-500">
                            <Minus className="size-5" aria-hidden /> No
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Tarjeta>

        <Tarjeta titulo="Actividad reciente" descripcion="Registro de acciones importantes, para saber quién hizo qué." relleno={false}>
          {bitacora.cargando && !bitacora.datos && <Cargando />}
          <ul className="max-h-[34rem] divide-y divide-hueso-200 overflow-y-auto">
            {bitacora.datos?.map((b) => (
              <li key={b.idBitacora} className="px-5 py-3">
                <p className="font-semibold">
                  {NOMBRE_ACCION[b.accion] ?? b.accion} <span className="font-normal text-cafe-500">· {b.usuario ?? 'Sistema'}</span>
                </p>
                {b.detalle && <p className="text-sm text-cafe-600">{b.detalle}</p>}
                <p className="text-xs text-cafe-500">{fechaHora(b.fecha)}</p>
              </li>
            ))}
            {bitacora.datos?.length === 0 && <li className="px-5 py-8 text-center text-cafe-500">Sin actividad todavía.</li>}
          </ul>
        </Tarjeta>
      </div>

      <Nota className="mt-6 max-w-3xl" titulo="Seguridad en la laptop compartida">
        Cierre sesión al terminar su turno; por seguridad, el sistema también la cierra sola tras 30 minutos sin uso. Tras 5 contraseñas incorrectas seguidas, ese dispositivo queda bloqueado 5 minutos para ese usuario y el sistema le avisa al Dueño.
      </Nota>

      <Modal abierto={Boolean(editando)} titulo={editando === 'nuevo' ? 'Nuevo usuario' : 'Editar usuario'} alCerrar={() => setEditando(null)}>
        {editando && <FormularioUsuario usuario={editando === 'nuevo' ? null : editando} esUnoMismo={editando !== 'nuevo' && editando.idUsuario === yo.idUsuario} alGuardar={alGuardar} alCancelar={() => setEditando(null)} />}
      </Modal>

      <Modal abierto={Boolean(restableciendo)} titulo={`Nueva contraseña para ${restableciendo?.nombre ?? ''}`} alCerrar={() => setRestableciendo(null)}>
        {restableciendo && <RestablecerClave usuario={restableciendo} alTerminar={alGuardar} alCancelar={() => setRestableciendo(null)} />}
      </Modal>
    </>
  );
}
