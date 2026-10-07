import { Banknote, DatabaseBackup, Landmark, Plus, Save, Smartphone, Store, Trash2 } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { api, useDatos } from '../api.js';
import { useAvisos, useSesion } from '../contexto.jsx';
import { aNumero, fechaHora } from '../formato.js';
import { Boton, Cargando, Casilla, Encabezado, Entrada, Insignia, MensajeError, Nota, Segmentado, Tarjeta } from '../ui.jsx';

const SECCIONES = [
  { valor: 'negocio', etiqueta: 'Negocio', icono: Store },
  { valor: 'cobro', etiqueta: 'Cobro', icono: Banknote },
  { valor: 'impuestos', etiqueta: 'Impuestos', icono: Landmark },
  { valor: 'respaldos', etiqueta: 'Respaldos', icono: DatabaseBackup },
  { valor: 'celular', etiqueta: 'Celular', icono: Smartphone },
];

const megas = (bytes) => (bytes ? `${(bytes / 1048576).toFixed(1)} MB` : '—');

function BotonGuardar({ guardando, children = 'Guardar cambios' }) {
  return (
    <div className="flex justify-end pt-2">
      <Boton type="submit" icono={Save} cargando={guardando}>
        {children}
      </Boton>
    </div>
  );
}

/** Negocio, cobro y respaldos comparten el mismo registro: se guardan juntos. */
function useNegocio(inicial, alGuardar) {
  const avisos = useAvisos();
  const { cargarConfig } = useSesion();
  const [n, setN] = useState(() => ({
    ...inicial,
    ...Object.fromEntries(['ruc', 'direccion', 'telefono', 'mensajeComprobante', 'banco', 'titularCuenta', 'cuentaNIO', 'cuentaUSD', 'respaldoDestino'].map((k) => [k, inicial[k] ?? ''])),
    tipoCambio: String(inicial.tipoCambio),
    porcentajeMedio: String(Math.round((inicial.factorStockMedio - 1) * 100)),
    respaldoConservar: String(inicial.respaldoConservar),
  }));
  const [guardando, setGuardando] = useState(false);
  const cambiar = (campo) => (e) => setN((d) => ({ ...d, [campo]: e.target.value }));

  async function guardar(e) {
    e.preventDefault();
    setGuardando(true);
    try {
      await api('/config/negocio', {
        metodo: 'PUT',
        cuerpo: {
          nombre: n.nombre, ruc: n.ruc, direccion: n.direccion, telefono: n.telefono, mensajeComprobante: n.mensajeComprobante,
          banco: n.banco, titularCuenta: n.titularCuenta, cuentaNIO: n.cuentaNIO, cuentaUSD: n.cuentaUSD,
          tipoCambio: aNumero(n.tipoCambio), seriePrefijo: n.seriePrefijo,
          factorStockMedio: 1 + (aNumero(n.porcentajeMedio) ?? 0) / 100,
          respaldoAuto: Boolean(n.respaldoAuto), respaldoHora: n.respaldoHora, respaldoDestino: n.respaldoDestino, respaldoConservar: aNumero(n.respaldoConservar),
        },
      });
      avisos.exito('La configuración se guardó.');
      cargarConfig();
      alGuardar?.();
    } catch (err) {
      avisos.error(err.message);
    } finally {
      setGuardando(false);
    }
  }
  return { n, setN, cambiar, guardar, guardando };
}

function SeccionNegocio({ f }) {
  const { n, cambiar, guardar, guardando } = f;
  return (
    <form onSubmit={guardar} className="space-y-6">
      <Tarjeta titulo="Datos del negocio" descripcion="Aparecen en el encabezado de cada comprobante.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Entrada etiqueta="Nombre del negocio" value={n.nombre} onChange={cambiar('nombre')} maxLength={100} required />
          <Entrada etiqueta="Número RUC" opcional value={n.ruc} onChange={cambiar('ruc')} maxLength={30} />
          <Entrada etiqueta="Dirección" opcional value={n.direccion} onChange={cambiar('direccion')} maxLength={200} className="sm:col-span-2" />
          <Entrada etiqueta="Teléfono" opcional value={n.telefono} onChange={cambiar('telefono')} maxLength={30} inputMode="tel" />
          <Entrada etiqueta="Serie de los comprobantes" value={n.seriePrefijo} onChange={cambiar('seriePrefijo')} maxLength={6} ayuda={`El próximo será ${n.seriePrefijo}-${String(n.siguienteNumero).padStart(6, '0')}`} required />
          <Entrada etiqueta="Mensaje al pie del comprobante" opcional value={n.mensajeComprobante} onChange={cambiar('mensajeComprobante')} maxLength={200} className="sm:col-span-2" />
        </div>
      </Tarjeta>
      <Tarjeta titulo="Semáforo de inventario" descripcion="Rojo al llegar al punto de reorden de cada producto. Aquí define cuándo se pone en amarillo.">
        <Entrada etiqueta="Avisar «stock medio» cuando falte este margen para el punto de reorden" sufijo="%" type="number" inputMode="numeric" min="0" max="400" step="5" value={n.porcentajeMedio} onChange={cambiar('porcentajeMedio')} className="max-w-xl" ayuda={`Ejemplo: con ${n.porcentajeMedio || 0} %, un producto con reorden en 20 lb se pone en amarillo al bajar de ${(20 * (1 + (aNumero(n.porcentajeMedio) ?? 0) / 100)).toFixed(0)} lb.`} />
      </Tarjeta>
      <BotonGuardar guardando={guardando} />
    </form>
  );
}

function SeccionCobro({ f }) {
  const { n, cambiar, guardar, guardando } = f;
  return (
    <form onSubmit={guardar} className="space-y-6">
      <Tarjeta titulo="Tipo de cambio" descripcion="Se usa cuando un cliente paga en dólares; el vuelto siempre se entrega en córdobas.">
        <Entrada etiqueta="Córdobas por cada dólar" prefijo="C$" type="text" inputMode="decimal" min="1" step="0.0001" value={n.tipoCambio} onChange={cambiar('tipoCambio')} className="max-w-xs" ayuda="Revise el tipo de cambio oficial del Banco Central y actualícelo cuando cambie." required />
      </Tarjeta>
      <Tarjeta titulo="Cuenta bancaria para depósitos" descripcion="Con estos datos se arma el código QR que se le muestra al cliente en la Caja.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Entrada etiqueta="Banco" opcional value={n.banco} onChange={cambiar('banco')} maxLength={60} placeholder="Ejemplo: BAC, Banpro, Lafise" />
          <Entrada etiqueta="Cuenta a nombre de" opcional value={n.titularCuenta} onChange={cambiar('titularCuenta')} maxLength={100} />
          <Entrada etiqueta="Número de cuenta en córdobas" opcional value={n.cuentaNIO} onChange={cambiar('cuentaNIO')} maxLength={40} inputMode="numeric" />
          <Entrada etiqueta="Número de cuenta en dólares" opcional value={n.cuentaUSD} onChange={cambiar('cuentaUSD')} maxLength={40} inputMode="numeric" />
        </div>
        <Nota className="mt-5">El sistema no se conecta con el banco: el QR solo muestra el número de cuenta y el monto. Confirme en su banca en línea que el depósito llegó antes de entregar el producto.</Nota>
      </Tarjeta>
      <BotonGuardar guardando={guardando} />
    </form>
  );
}

function SeccionImpuestos({ inicial, alGuardar }) {
  const avisos = useAvisos();
  const { cargarConfig } = useSesion();
  const [t, setT] = useState(() => ({
    tasaIVA: String(inicial.tasaIVA), tasaRetencionDGI: String(inicial.tasaRetencionDGI), montoMinimoRetencion: String(inicial.montoMinimoRetencion),
    tasaAnticipoIR: String(inicial.tasaAnticipoIR), tasaIRGeneral: String(inicial.tasaIRGeneral), topeTablaProgresiva: String(inicial.topeTablaProgresiva),
    preciosIncluyenIVA: inicial.preciosIncluyenIVA,
    tablaIR: inicial.tablaIR.map((e) => ({ hasta: e.hasta === null ? '' : String(e.hasta), tasa: String(e.tasa) })),
  }));
  const [guardando, setGuardando] = useState(false);
  const cambiar = (campo) => (e) => setT((d) => ({ ...d, [campo]: e.target.value }));
  const cambiarEstrato = (i, campo) => (e) => setT((d) => ({ ...d, tablaIR: d.tablaIR.map((fila, j) => (j === i ? { ...fila, [campo]: e.target.value } : fila)) }));

  async function guardar(e) {
    e.preventDefault();
    setGuardando(true);
    try {
      await api('/config/tributaria', {
        metodo: 'PUT',
        cuerpo: {
          tasaIVA: aNumero(t.tasaIVA), tasaRetencionDGI: aNumero(t.tasaRetencionDGI), montoMinimoRetencion: aNumero(t.montoMinimoRetencion),
          tasaAnticipoIR: aNumero(t.tasaAnticipoIR), tasaIRGeneral: aNumero(t.tasaIRGeneral), topeTablaProgresiva: aNumero(t.topeTablaProgresiva),
          preciosIncluyenIVA: t.preciosIncluyenIVA,
          // El último estrato siempre queda abierto ("en adelante").
          tablaIR: t.tablaIR.map((fila, i) => ({ hasta: i === t.tablaIR.length - 1 ? null : aNumero(fila.hasta), tasa: aNumero(fila.tasa) })),
        },
      });
      avisos.exito('Los parámetros tributarios se guardaron. Aplican a las ventas nuevas.');
      cargarConfig();
      alGuardar();
    } catch (err) {
      avisos.error(err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar} className="space-y-6">
      <Nota tono="ambar" titulo="Cambie estos valores solo si la ley cambia o se lo indica su contador">
        Vienen cargados con las tasas del Régimen General (Ley 822 de Concertación Tributaria y sus reformas). Última actualización: {fechaHora(inicial.fechaActualizacion)} por {inicial.actualizadoPor ?? '—'}.
      </Nota>

      <Tarjeta titulo="IVA y retenciones en cada venta">
        <div className="grid gap-5 sm:grid-cols-3">
          <Entrada etiqueta="Tasa de IVA" sufijo="%" type="text" inputMode="decimal" min="0" max="100" step="0.01" value={t.tasaIVA} onChange={cambiar('tasaIVA')} required />
          <Entrada etiqueta="Retención de IR que nos aplican" sufijo="%" type="text" inputMode="decimal" min="0" max="100" step="0.01" value={t.tasaRetencionDGI} onChange={cambiar('tasaRetencionDGI')} ayuda="Solo a clientes marcados como retenedores." required />
          <Entrada etiqueta="Se retiene desde" prefijo="C$" type="text" inputMode="decimal" min="0" step="0.01" value={t.montoMinimoRetencion} onChange={cambiar('montoMinimoRetencion')} ayuda="Monto mínimo de la venta, sin IVA." required />
        </div>
        <div className="mt-5">
          <Casilla etiqueta="Los precios de los productos ya incluyen el IVA" ayuda="Recomendado para venta al público: el cliente paga el precio de lista y el sistema desglosa el IVA. Si lo desmarca, el IVA se suma encima del precio." checked={t.preciosIncluyenIVA} onChange={(preciosIncluyenIVA) => setT((d) => ({ ...d, preciosIncluyenIVA }))} />
        </div>
      </Tarjeta>

      <Tarjeta titulo="Impuesto sobre la Renta (IR)">
        <div className="grid gap-5 sm:grid-cols-3">
          <Entrada etiqueta="Anticipo mensual y pago mínimo" sufijo="%" type="text" inputMode="decimal" min="0" max="100" step="0.01" value={t.tasaAnticipoIR} onChange={cambiar('tasaAnticipoIR')} ayuda="Sobre los ingresos brutos." required />
          <Entrada etiqueta="Tasa general de IR" sufijo="%" type="text" inputMode="decimal" min="0" max="100" step="0.01" value={t.tasaIRGeneral} onChange={cambiar('tasaIRGeneral')} ayuda="Si los ingresos superan el tope." required />
          <Entrada etiqueta="Tope para usar la tabla progresiva" prefijo="C$" type="text" inputMode="decimal" min="0" step="1" value={t.topeTablaProgresiva} onChange={cambiar('topeTablaProgresiva')} ayuda="Ingresos brutos anuales." required />
        </div>

        <h3 className="mb-1 mt-7 text-lg font-semibold">Tabla progresiva del IR anual</h3>
        <p className="mb-3 text-sm text-cafe-500">El porcentaje del estrato se aplica a toda la renta neta del año.</p>
        <div className="space-y-3">
          {t.tablaIR.map((fila, i) => {
            const ultimo = i === t.tablaIR.length - 1;
            return (
              <div key={i} className="grid gap-3 rounded-xl border border-hueso-300 bg-white p-3 sm:grid-cols-[1.4fr_1fr_auto] sm:items-end">
                {ultimo ? (
                  <div>
                    <p className="mb-1.5 text-[0.95rem] font-semibold text-cafe-800">Renta neta anual</p>
                    <p className="flex min-h-13 items-center rounded-xl bg-hueso-200 px-4 font-semibold text-cafe-700">De ahí en adelante</p>
                  </div>
                ) : (
                  <Entrada etiqueta="Renta neta anual hasta" prefijo="C$" type="text" inputMode="decimal" min="1" step="0.01" value={fila.hasta} onChange={cambiarEstrato(i, 'hasta')} required />
                )}
                <Entrada etiqueta="Porcentaje" sufijo="%" type="text" inputMode="decimal" min="0" max="100" step="0.01" value={fila.tasa} onChange={cambiarEstrato(i, 'tasa')} required />
                <button type="button" disabled={t.tablaIR.length === 1} onClick={() => setT((d) => ({ ...d, tablaIR: d.tablaIR.filter((_, j) => j !== i) }))} className="flex size-13 items-center justify-center rounded-xl border border-hueso-400 text-cafe-600 hover:bg-peligro-50 hover:text-peligro-700 disabled:opacity-40" aria-label={`Quitar el estrato ${i + 1}`}>
                  <Trash2 className="size-5" />
                </button>
              </div>
            );
          })}
        </div>
        <Boton variante="secundario" tamano="sm" icono={Plus} className="mt-3" onClick={() => setT((d) => ({ ...d, tablaIR: [...d.tablaIR.slice(0, -1), { hasta: '', tasa: '' }, d.tablaIR.at(-1)] }))}>
          Agregar un estrato
        </Boton>
      </Tarjeta>
      <BotonGuardar guardando={guardando}>Guardar parámetros tributarios</BotonGuardar>
    </form>
  );
}

function SeccionRespaldos({ f, carpeta }) {
  const avisos = useAvisos();
  const { refrescarNotificaciones } = useSesion();
  const { n, setN, cambiar, guardar, guardando } = f;
  const historial = useDatos('/config/respaldos');
  const [respaldando, setRespaldando] = useState(false);

  async function respaldarAhora() {
    setRespaldando(true);
    try {
      const r = await api('/config/respaldos', { metodo: 'POST' });
      if (r.aviso) avisos.info(r.aviso);
      else avisos.exito(`Respaldo creado: ${r.archivo}${r.copiadoA ? `, con copia en ${r.copiadoA}` : ''}.`);
    } catch (err) {
      avisos.error(err.message);
    } finally {
      setRespaldando(false);
      historial.recargar();
      refrescarNotificaciones();
    }
  }

  return (
    <div className="space-y-6">
      <Tarjeta
        titulo="Copia de seguridad"
        descripcion="Guarda toda la información del sistema en un archivo, por si la laptop se daña."
        accion={
          <Boton variante="exito" icono={DatabaseBackup} cargando={respaldando} onClick={respaldarAhora}>
            Respaldar ahora
          </Boton>
        }
      >
        <p className="text-cafe-700">
          Los respaldos se guardan en esta laptop, en la carpeta: <span className="mt-1 block break-all rounded-lg bg-hueso-200 px-3 py-2 font-mono text-[0.9rem]">{carpeta}</span>
        </p>
        <form onSubmit={guardar} className="mt-6 space-y-5">
          <Casilla etiqueta="Hacer un respaldo automático todos los días" ayuda="Se crea solo a la hora indicada, mientras el sistema esté abierto en la laptop." checked={Boolean(n.respaldoAuto)} onChange={(respaldoAuto) => setN((d) => ({ ...d, respaldoAuto }))} />
          <div className="grid gap-5 sm:grid-cols-2">
            <Entrada etiqueta="Hora del respaldo automático" type="time" value={n.respaldoHora} onChange={cambiar('respaldoHora')} disabled={!n.respaldoAuto} required />
            <Entrada etiqueta="Respaldos que se conservan en la laptop" type="number" inputMode="numeric" min="1" max="365" step="1" value={n.respaldoConservar} onChange={cambiar('respaldoConservar')} ayuda="Los más antiguos se borran solos." required />
          </div>
          <Entrada etiqueta="Copiar también a esta carpeta (memoria USB o carpeta sincronizada)" opcional value={n.respaldoDestino} onChange={cambiar('respaldoDestino')} maxLength={260} placeholder="Ejemplo: E:\Respaldos Cafe Apante" ayuda="Escriba la ruta completa y pulse «Guardar cambios» antes de respaldar. Si la memoria USB no está conectada, el respaldo se guarda igual en la laptop y el sistema le avisa." />
          <BotonGuardar guardando={guardando} />
        </form>
      </Tarjeta>

      <Tarjeta titulo="Últimos respaldos" relleno={false}>
        {historial.cargando && !historial.datos && <Cargando />}
        {historial.datos?.respaldos.length === 0 && <p className="px-6 py-8 text-center text-cafe-500">Todavía no se ha creado ningún respaldo.</p>}
        {historial.datos?.respaldos.length > 0 && (
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Archivo</th>
                  <th>Tipo</th>
                  <th className="num">Tamaño</th>
                  <th>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {historial.datos.respaldos.map((r) => (
                  <tr key={r.idRespaldo}>
                    <td className="whitespace-nowrap">{fechaHora(r.fecha)}</td>
                    <td className="break-all font-mono text-[0.9rem]">{r.archivo}</td>
                    <td>{r.tipo === 'MANUAL' ? 'Manual' : 'Automático'}</td>
                    <td className="num">{megas(r.tamanoBytes)}</td>
                    <td>
                      {r.estado === 'OK' ? <Insignia tono={r.copiadoA ? 'verde' : 'neutro'}>{r.copiadoA ? 'Correcto, con copia externa' : 'Correcto'}</Insignia> : <Insignia tono="rojo">Falló</Insignia>}
                      {r.estado === 'OK' && r.mensaje && <span className="mt-1 block max-w-sm text-sm text-alerta-700">{r.mensaje}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>
    </div>
  );
}

function SeccionCelular() {
  const { datos, cargando, error } = useDatos('/config/red');
  const [codigos, setCodigos] = useState({});

  useEffect(() => {
    let vigente = true;
    for (const direccion of datos?.direcciones ?? []) {
      QRCode.toDataURL(direccion, { margin: 1, width: 300, color: { dark: '#261a14', light: '#ffffff' } }).then((url) => vigente && setCodigos((c) => ({ ...c, [direccion]: url })));
    }
    return () => {
      vigente = false;
    };
  }, [datos]);

  if (cargando && !datos) return <Cargando />;
  if (error) return <MensajeError mensaje={error} />;

  return (
    <Tarjeta titulo="Ver el sistema desde el celular" descripcion="El Dueño puede consultar el dashboard en tiempo real desde su teléfono, sin salir a internet.">
      <ol className="list-decimal space-y-2 pl-6 text-lg text-cafe-800">
        <li>Conecte el celular a la misma red Wi-Fi que la laptop.</li>
        <li>Abra la cámara del celular y apunte al código, o escriba la dirección en el navegador.</li>
        <li>Entre con su usuario y contraseña de siempre.</li>
      </ol>
      {datos.direcciones.length === 0 ? (
        <Nota tono="ambar" className="mt-5" titulo="La laptop no está conectada a ninguna red">
          Conéctela al Wi-Fi del negocio y vuelva a abrir esta pantalla.
        </Nota>
      ) : (
        <div className="mt-6 flex flex-wrap gap-5">
          {datos.direcciones.map((direccion) => (
            <div key={direccion} className="flex flex-col items-center gap-3 rounded-2xl border border-hueso-300 bg-white p-5">
              {codigos[direccion] ? <img src={codigos[direccion]} alt={`Código QR para abrir ${direccion}`} className="size-48" /> : <div className="size-48 animate-pulse rounded-lg bg-hueso-200" />}
              <p className="break-all text-center font-mono text-lg font-bold">{direccion}</p>
            </div>
          ))}
        </div>
      )}
      <Nota className="mt-6" titulo="Si el celular no logra abrirlo">
        La primera vez, Windows puede preguntar si permite las conexiones de «Node.js»: elija permitir en redes privadas. El sistema solo funciona dentro de la red del negocio; no queda expuesto a internet.
      </Nota>
    </Tarjeta>
  );
}

function Contenido({ datos, recargar }) {
  const [seccion, setSeccion] = useState('negocio');
  const f = useNegocio(datos.negocio, recargar);
  return (
    <>
      <Segmentado className="mb-6 max-w-4xl" nombre="Sección de la configuración" valor={seccion} alCambiar={setSeccion} opciones={SECCIONES} />
      {seccion === 'negocio' && <SeccionNegocio f={f} />}
      {seccion === 'cobro' && <SeccionCobro f={f} />}
      {seccion === 'impuestos' && <SeccionImpuestos inicial={datos.tributaria} alGuardar={recargar} />}
      {seccion === 'respaldos' && <SeccionRespaldos f={f} carpeta={datos.carpetaRespaldos} />}
      {seccion === 'celular' && <SeccionCelular />}
    </>
  );
}

export default function Configuracion() {
  const { datos, cargando, error, recargar } = useDatos('/config/completa');
  return (
    <>
      <Encabezado titulo="Configuración" descripcion="Datos del negocio, cuenta para depósitos, parámetros tributarios, respaldos y acceso desde el celular." />
      {error && !datos && <MensajeError mensaje={error} alReintentar={recargar} />}
      {cargando && !datos && <Cargando />}
      {datos && <Contenido datos={datos} recargar={recargar} />}
    </>
  );
}
