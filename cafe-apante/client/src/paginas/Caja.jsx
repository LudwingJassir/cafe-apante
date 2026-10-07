import { Banknote, Check, CircleCheck, Lock, LockOpen, Minus, Plus, Printer, QrCode, Search, ShoppingBasket, Trash2, User, UserPlus } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { calcularVenta, calcularVuelto, redondear } from '../../../shared/calculos.js';
import { api, useDatos } from '../api.js';
import Comprobante from '../Comprobante.jsx';
import { useAvisos, useSesion } from '../contexto.jsx';
import { aNumero, cordobas, dinero, dolares, fechaHora, librasExactas as libras } from '../formato.js';
import { Boton, Cargando, Encabezado, Entrada, EstadoVacio, MensajeError, Modal, Nota, Segmentado, Semaforo, Tarjeta } from '../ui.jsx';
import { FormularioCliente, InsigniaCategoria } from './Clientes.jsx';

const BILLETES = { NIO: [100, 200, 500, 1000], USD: [5, 10, 20, 50, 100] };

export function AbrirCaja({ alAbrir }) {
  const avisos = useAvisos();
  const [monto, setMonto] = useState('');
  const [abriendo, setAbriendo] = useState(false);

  async function alEnviar(e) {
    e.preventDefault();
    setAbriendo(true);
    try {
      await api('/caja/abrir', { metodo: 'POST', cuerpo: { montoInicial: aNumero(monto) ?? 0 } });
      avisos.exito('La caja quedó abierta. Ya puede vender.');
      await alAbrir(); // se espera la recarga: un segundo clic no debe intentar abrirla otra vez
    } catch (err) {
      avisos.error(err.message);
    } finally {
      setAbriendo(false);
    }
  }

  return (
    <Tarjeta className="mx-auto max-w-xl">
      <div className="flex flex-col items-center text-center">
        <span className="mb-4 flex size-16 items-center justify-center rounded-full bg-hueso-200 text-cafe-600">
          <Lock className="size-8" aria-hidden />
        </span>
        <h2 className="text-2xl font-semibold">La caja está cerrada</h2>
        <p className="mt-1.5 max-w-md text-cafe-600">Para empezar a vender, cuente el dinero que hay en la gaveta y anótelo como fondo inicial.</p>
      </div>
      <form onSubmit={alEnviar} className="mt-6 space-y-5">
        <Entrada etiqueta="Fondo inicial en la gaveta" prefijo="C$" type="text" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={monto} onChange={(e) => setMonto(e.target.value)} ayuda="Si la gaveta está vacía, déjelo en cero." autoFocus />
        <Boton type="submit" tamano="lg" variante="exito" icono={LockOpen} cargando={abriendo} className="w-full">
          Abrir caja
        </Boton>
      </form>
    </Tarjeta>
  );
}

function SelectorCliente({ abierto, alElegir, alCerrar }) {
  const [buscar, setBuscar] = useState('');
  const [consulta, setConsulta] = useState('');
  const [creando, setCreando] = useState(false);
  useEffect(() => {
    const espera = setTimeout(() => setConsulta(buscar.trim()), 300);
    return () => clearTimeout(espera);
  }, [buscar]);
  useEffect(() => {
    // Se limpia al cerrar, para que al reabrir no aparezca por un instante el formulario anterior.
    if (!abierto) {
      setBuscar('');
      setCreando(false);
    }
  }, [abierto]);
  const { datos, cargando } = useDatos(abierto && !creando ? `/clientes${consulta ? `?buscar=${encodeURIComponent(consulta)}` : ''}` : null);

  return (
    <Modal abierto={abierto} titulo={creando ? 'Registrar cliente nuevo' : '¿A quién le vende?'} alCerrar={alCerrar} ancho="md">
      {creando ? (
        <FormularioCliente alCancelar={() => setCreando(false)} alGuardar={alElegir} />
      ) : (
        <div className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-cafe-400" aria-hidden />
            <input className="control pl-12" type="search" placeholder="Buscar cliente por nombre o teléfono" value={buscar} onChange={(e) => setBuscar(e.target.value)} aria-label="Buscar cliente" />
          </div>
          <ul className="max-h-[21rem] space-y-2 overflow-y-auto pr-1">
            <li>
              <button type="button" onClick={() => alElegir(null)} className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-hueso-300 bg-white px-4 text-left hover:border-caramelo-500 hover:bg-caramelo-50">
                <User className="size-5 shrink-0 text-cafe-500" aria-hidden />
                <span className="font-semibold">Consumidor final</span>
                <span className="text-sm text-cafe-500">(sin registrar)</span>
              </button>
            </li>
            {cargando && !datos && <Cargando />}
            {datos?.map((c) => (
              <li key={c.idCliente}>
                <button type="button" onClick={() => alElegir(c)} className="flex min-h-14 w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-hueso-300 bg-white px-4 py-2 text-left hover:border-caramelo-500 hover:bg-caramelo-50">
                  <span className="font-semibold">{c.nombre}</span>
                  <InsigniaCategoria categoria={c.categoria} />
                  {c.telefono && <span className="text-sm text-cafe-500">{c.telefono}</span>}
                </button>
              </li>
            ))}
            {datos?.length === 0 && consulta && <li className="py-4 text-center text-cafe-500">No hay clientes con ese nombre.</li>}
          </ul>
          <Boton variante="secundario" icono={UserPlus} className="w-full" onClick={() => setCreando(true)}>
            Registrar un cliente nuevo
          </Boton>
        </div>
      )}
    </Modal>
  );
}

function QrDeposito({ negocio, moneda, monto }) {
  const cuenta = moneda === 'USD' ? negocio.cuentaUSD : negocio.cuentaNIO;
  const [imagen, setImagen] = useState(null);
  const contenido = useMemo(
    () => [negocio.nombre, negocio.banco && `Banco: ${negocio.banco}`, negocio.titularCuenta && `Titular: ${negocio.titularCuenta}`, `Cuenta ${moneda === 'USD' ? 'US$' : 'C$'}: ${cuenta}`, `Monto: ${dinero(monto, moneda)}`].filter(Boolean).join('\n'),
    [negocio, moneda, cuenta, monto],
  );
  useEffect(() => {
    let vigente = true;
    if (!cuenta) return undefined;
    QRCode.toDataURL(contenido, { margin: 1, width: 360, color: { dark: '#261a14', light: '#ffffff' } })
      .then((url) => vigente && setImagen(url))
      .catch(() => vigente && setImagen(null));
    return () => {
      vigente = false;
    };
  }, [contenido, cuenta]);

  if (!cuenta) {
    return (
      <Nota tono="ambar" titulo={`Falta la cuenta en ${moneda === 'USD' ? 'dólares' : 'córdobas'}`}>
        El Dueño / Administrador debe anotarla en <Link to="/configuracion" className="font-semibold underline">Configuración</Link> para que aparezca el código QR.
      </Nota>
    );
  }
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-hueso-300 bg-white p-4 sm:flex-row sm:items-start">
      {imagen ? <img src={imagen} alt="Código QR con los datos de la cuenta bancaria" className="size-44 shrink-0 rounded-lg" /> : <div className="size-44 shrink-0 animate-pulse rounded-lg bg-hueso-200" />}
      <dl className="w-full space-y-1.5">
        <div>
          <dt className="text-sm text-cafe-500">Banco</dt>
          <dd className="font-semibold">{negocio.banco || '—'}</dd>
        </div>
        <div>
          <dt className="text-sm text-cafe-500">A nombre de</dt>
          <dd className="font-semibold">{negocio.titularCuenta || negocio.nombre}</dd>
        </div>
        <div>
          <dt className="text-sm text-cafe-500">Número de cuenta ({moneda === 'USD' ? 'dólares' : 'córdobas'})</dt>
          <dd className="font-mono text-xl font-bold tracking-wide">{cuenta}</dd>
        </div>
        <div>
          <dt className="text-sm text-cafe-500">Monto a depositar</dt>
          <dd className="font-display text-2xl font-semibold">{dinero(monto, moneda)}</dd>
        </div>
      </dl>
    </div>
  );
}

export default function Caja() {
  const { config, cargarConfig, usuario, refrescarNotificaciones } = useSesion();
  const avisos = useAvisos();
  const caja = useDatos('/caja/actual');
  const productos = useDatos('/productos');

  const [carrito, setCarrito] = useState([]); // [{ idPresentacion, cantidad }]
  const [cliente, setCliente] = useState(null);
  const [eligiendoCliente, setEligiendoCliente] = useState(false);
  const [metodo, setMetodo] = useState('EFECTIVO');
  const [moneda, setMoneda] = useState('NIO');
  const [recibido, setRecibido] = useState('');
  const [referencia, setReferencia] = useState('');
  const [cobrando, setCobrando] = useState(false);
  const [ventaHecha, setVentaHecha] = useState(null);

  const catalogo = useMemo(() => {
    const mapa = new Map();
    for (const p of productos.datos ?? []) for (const pr of p.presentaciones) mapa.set(pr.idPresentacion, { ...pr, producto: p.nombre, aplicaIVA: Boolean(p.aplicaIVA), stockActual: p.stockActual });
    return mapa;
  }, [productos.datos]);

  const lineas = useMemo(
    () =>
      carrito
        .filter((c) => catalogo.has(c.idPresentacion))
        .map((c) => {
          const pr = catalogo.get(c.idPresentacion);
          return { ...pr, cantidad: c.cantidad, precioUnitario: cliente?.categoria === 'GRANDE' ? pr.precioMayorista : pr.precio, cantidadLibras: redondear(pr.pesoLibras * c.cantidad, 3) };
        }),
    [carrito, catalogo, cliente],
  );

  const librasEnCarrito = useMemo(() => {
    const mapa = new Map();
    for (const l of lineas) mapa.set(l.idProducto, redondear((mapa.get(l.idProducto) ?? 0) + l.cantidadLibras, 3));
    return mapa;
  }, [lineas]);

  if (config === null) return <MensajeError mensaje="No se pudo cargar la configuración del negocio." alReintentar={cargarConfig} />;
  if (!config || (caja.cargando && !caja.datos) || (productos.cargando && !productos.datos)) return <Cargando />;
  if (caja.error || productos.error) return <MensajeError mensaje={caja.error ?? productos.error} alReintentar={() => { caja.recargar(); productos.recargar(); }} />;

  if (!caja.datos.sesion) {
    return (
      <>
        <Encabezado titulo="Caja" descripcion="Registro de ventas en efectivo o por depósito bancario." />
        <AbrirCaja alAbrir={caja.recargar} />
      </>
    );
  }

  const { negocio, tributaria } = config;
  const calculo = calcularVenta(lineas, tributaria, cliente);
  const montoRecibido = aNumero(recibido);
  const pago = calcularVuelto({ totalCobrar: calculo.totalCobrar, moneda, montoRecibido: montoRecibido ?? 0, tipoCambio: negocio.tipoCambio });
  const enDolares = redondear(calculo.totalCobrar / negocio.tipoCambio);
  const hayItems = lineas.length > 0;
  const referenciaValida = referencia.trim().length >= 4;
  const puedeCobrar = hayItems && (metodo === 'DEPOSITO' ? referenciaValida : montoRecibido !== null && pago.suficiente);
  const disponible = (pr) => redondear(pr.stockActual - (librasEnCarrito.get(pr.idProducto) ?? 0), 3);

  function cambiarCantidad(idPresentacion, delta) {
    setCarrito((actual) => {
      const existente = actual.find((c) => c.idPresentacion === idPresentacion);
      if (!existente) return delta > 0 ? [...actual, { idPresentacion, cantidad: delta }] : actual;
      const cantidad = existente.cantidad + delta;
      return cantidad <= 0 ? actual.filter((c) => c.idPresentacion !== idPresentacion) : actual.map((c) => (c.idPresentacion === idPresentacion ? { ...c, cantidad } : c));
    });
  }

  function limpiar() {
    setCarrito([]);
    setCliente(null);
    setMetodo('EFECTIVO');
    setMoneda('NIO');
    setRecibido('');
    setReferencia('');
  }

  async function cobrar() {
    setCobrando(true);
    try {
      const venta = await api('/ventas', {
        metodo: 'POST',
        cuerpo: {
          idCliente: cliente?.idCliente ?? null,
          items: lineas.map(({ idPresentacion, cantidad }) => ({ idPresentacion, cantidad })),
          metodoPago: metodo,
          monedaPago: moneda,
          ...(metodo === 'EFECTIVO' ? { montoRecibido } : { referenciaDeposito: referencia.trim() }),
        },
      });
      setVentaHecha(venta);
      limpiar();
      productos.recargar();
      caja.recargar();
      refrescarNotificaciones();
    } catch (err) {
      avisos.error(err.message);
      // Si falló porque cambió el stock o alguien cerró la caja, la pantalla debe reflejarlo.
      productos.recargar();
      caja.recargar();
    } finally {
      setCobrando(false);
    }
  }

  return (
    <>
      <Encabezado titulo="Caja" descripcion={`Caja abierta por ${caja.datos.sesion.abiertaPor} · ${fechaHora(caja.datos.sesion.fechaApertura)}`}>
        <Link to="/arqueo" className="inline-flex min-h-13 items-center gap-2 rounded-xl border border-hueso-400 bg-white px-5 font-semibold text-cafe-800 shadow-sm hover:bg-hueso-200">
          <Lock className="size-5" aria-hidden /> Arqueo y cierre
        </Link>
      </Encabezado>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_27rem]">
        {/* ── Productos ── */}
        <section aria-label="Productos disponibles" className="space-y-4">
          {productos.datos.length === 0 && (
            <Tarjeta>
              <EstadoVacio icono={ShoppingBasket} titulo="Todavía no hay productos" texto={usuario.rol === 'ADMIN' ? 'Cree los productos y sus precios para empezar a vender.' : 'Pídale al Dueño / Administrador que registre los productos y sus precios.'}>
                {usuario.rol === 'ADMIN' && (
                  <Link to="/productos" className="font-semibold text-caramelo-700 underline underline-offset-4">
                    Ir a Productos y precios
                  </Link>
                )}
              </EstadoVacio>
            </Tarjeta>
          )}
          {productos.datos.map((p) => (
            <article key={p.idProducto} className="rounded-2xl border border-hueso-300 bg-white p-4 shadow-tarjeta sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <div>
                  <h2 className="text-xl font-semibold">{p.nombre}</h2>
                  {p.descripcion && <p className="text-sm text-cafe-500">{p.descripcion}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold tabular-nums text-cafe-700">Quedan {libras(disponible({ ...p }))}</span>
                  <Semaforo nivel={p.estadoSemaforo} />
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {p.presentaciones.map((pr) => {
                  const precio = cliente?.categoria === 'GRANDE' ? pr.precioMayorista : pr.precio;
                  const alcanza = disponible({ idProducto: p.idProducto, stockActual: p.stockActual }) >= pr.pesoLibras;
                  const enCarrito = carrito.find((c) => c.idPresentacion === pr.idPresentacion)?.cantidad ?? 0;
                  return (
                    <button
                      key={pr.idPresentacion}
                      type="button"
                      disabled={!alcanza}
                      onClick={() => cambiarCantidad(pr.idPresentacion, 1)}
                      className="group relative flex min-h-[5.5rem] items-center justify-between gap-3 rounded-xl border-2 border-hueso-300 bg-hueso-50 px-4 py-3 text-left transition hover:border-caramelo-500 hover:bg-caramelo-50 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-hueso-300 disabled:hover:bg-hueso-50"
                    >
                      <span>
                        <span className="block text-lg font-bold text-cafe-900">{pr.nombre}</span>
                        <span className="block whitespace-nowrap font-display text-[1.4rem] font-semibold text-caramelo-700">{cordobas(precio)}</span>
                        {!alcanza && <span className="block text-sm font-semibold text-peligro-700">Sin existencias suficientes</span>}
                      </span>
                      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-cafe-800 text-hueso-50 transition group-hover:bg-caramelo-600 group-disabled:bg-cafe-400">
                        <Plus className="size-6" aria-hidden />
                      </span>
                      {enCarrito > 0 && <span className="absolute -right-2 -top-2 flex min-w-8 items-center justify-center rounded-full bg-hoja-700 px-2 py-0.5 text-sm font-bold text-white shadow">{enCarrito}</span>}
                      <span className="sr-only">Agregar a la venta</span>
                    </button>
                  );
                })}
              </div>
            </article>
          ))}
        </section>

        {/* ── Cuenta ── */}
        <section aria-label="Cuenta del cliente" className="xl:sticky xl:top-24 xl:max-h-[calc(100dvh-7.5rem)] xl:self-start xl:overflow-y-auto xl:rounded-2xl">
          <Tarjeta relleno={false}>
            <div className="border-b border-hueso-200 p-4 sm:p-5">
              <p className="mb-1.5 text-[0.95rem] font-semibold text-cafe-800">Cliente</p>
              <button type="button" onClick={() => setEligiendoCliente(true)} className="flex min-h-13 w-full items-center gap-3 rounded-xl border border-hueso-400 bg-white px-4 py-2 text-left shadow-sm hover:border-cafe-400">
                <User className="size-5 shrink-0 text-cafe-500" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{cliente?.nombre ?? 'Consumidor final'}</span>
                  {cliente?.categoria === 'GRANDE' && <span className="block text-sm font-semibold text-caramelo-700">Precio mayorista aplicado</span>}
                </span>
                <span className="shrink-0 text-sm font-semibold text-caramelo-700">Cambiar</span>
              </button>
            </div>

            <div className="p-4 sm:p-5">
              {!hayItems ? (
                <p className="rounded-xl bg-hueso-100 px-4 py-8 text-center text-cafe-500">Toque un producto para agregarlo a la venta.</p>
              ) : (
                <ul className="space-y-3">
                  {lineas.map((l) => (
                    <li key={l.idPresentacion} className="rounded-xl border border-hueso-300 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-semibold leading-snug">
                          {l.producto} <span className="text-cafe-500">· {l.nombre}</span>
                        </p>
                        <button type="button" onClick={() => cambiarCantidad(l.idPresentacion, -l.cantidad)} className="-m-1 flex size-10 shrink-0 items-center justify-center rounded-lg text-cafe-500 hover:bg-peligro-50 hover:text-peligro-700" aria-label={`Quitar ${l.producto} ${l.nombre}`}>
                          <Trash2 className="size-5" />
                        </button>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => cambiarCantidad(l.idPresentacion, -1)} className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-hueso-400 bg-white hover:bg-hueso-200" aria-label={`Quitar una bolsa de ${l.producto} ${l.nombre}`}>
                            <Minus className="size-5" />
                          </button>
                          <span className="min-w-10 text-center text-xl font-bold tabular-nums">
                            {l.cantidad}
                            <span className="sr-only"> bolsas</span>
                          </span>
                          <button type="button" onClick={() => cambiarCantidad(l.idPresentacion, 1)} disabled={disponible(l) < l.pesoLibras} className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-hueso-400 bg-white hover:bg-hueso-200 disabled:opacity-40" aria-label={`Agregar una bolsa de ${l.producto} ${l.nombre}`}>
                            <Plus className="size-5" />
                          </button>
                          <span className="ml-1 text-sm text-cafe-500">× {cordobas(l.precioUnitario)}</span>
                        </div>
                        <span className="text-lg font-bold tabular-nums">{cordobas(redondear(l.precioUnitario * l.cantidad))}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <dl className="mt-4 space-y-1.5 border-t border-hueso-200 pt-4 text-cafe-700">
                <div className="flex justify-between">
                  <dt>Subtotal (sin IVA)</dt>
                  <dd className="tabular-nums">{cordobas(calculo.subtotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>IVA ({Number(tributaria.tasaIVA)} %)</dt>
                  <dd className="tabular-nums">{cordobas(calculo.iva)}</dd>
                </div>
                {calculo.retencion > 0 && (
                  <div className="flex justify-between">
                    <dt>Retención IR ({Number(tributaria.tasaRetencionDGI)} %)</dt>
                    <dd className="tabular-nums">− {cordobas(calculo.retencion)}</dd>
                  </div>
                )}
                <div className="flex items-baseline justify-between border-t border-hueso-200 pt-3 text-cafe-900">
                  <dt className="text-lg font-bold">Total a cobrar</dt>
                  <dd className="font-display text-4xl font-semibold tabular-nums">{cordobas(calculo.totalCobrar)}</dd>
                </div>
                {hayItems && <p className="text-right text-sm text-cafe-500">Equivale a {dolares(enDolares)} al cambio de C$ {Number(negocio.tipoCambio).toFixed(4)}</p>}
              </dl>
            </div>

            {hayItems && (
              <div className="space-y-4 border-t border-hueso-200 bg-hueso-50 p-4 sm:p-5">
                <Segmentado
                  etiqueta="¿Cómo paga?"
                  valor={metodo}
                  alCambiar={(m) => {
                    setMetodo(m);
                    setRecibido('');
                  }}
                  opciones={[
                    { valor: 'EFECTIVO', etiqueta: 'Efectivo', icono: Banknote },
                    { valor: 'DEPOSITO', etiqueta: 'Depósito (QR)', icono: QrCode },
                  ]}
                />
                <Segmentado
                  etiqueta={metodo === 'EFECTIVO' ? '¿En qué moneda entrega el dinero?' : '¿A qué cuenta deposita?'}
                  valor={moneda}
                  alCambiar={(m) => {
                    setMoneda(m);
                    setRecibido('');
                  }}
                  opciones={[
                    { valor: 'NIO', etiqueta: 'Córdobas (C$)' },
                    { valor: 'USD', etiqueta: 'Dólares (US$)' },
                  ]}
                />

                {metodo === 'EFECTIVO' ? (
                  <>
                    <Entrada etiqueta="Dinero que entrega el cliente" prefijo={moneda === 'USD' ? 'US$' : 'C$'} type="text" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={recibido} onChange={(e) => setRecibido(e.target.value)} />
                    <div className="flex flex-wrap gap-2">
                      <Boton variante="secundario" tamano="sm" onClick={() => setRecibido(String(moneda === 'USD' ? Math.ceil((calculo.totalCobrar / negocio.tipoCambio) * 100) / 100 : calculo.totalCobrar))}>
                        Monto exacto
                      </Boton>
                      {BILLETES[moneda].map((b) => (
                        <Boton key={b} variante="secundario" tamano="sm" onClick={() => setRecibido(String(b))}>
                          {moneda === 'USD' ? `$${b}` : `C$${b}`}
                        </Boton>
                      ))}
                    </div>
                    {montoRecibido !== null && (
                      <div className={`rounded-2xl px-4 py-3 ${pago.suficiente ? 'bg-hoja-50 text-hoja-800' : 'bg-peligro-50 text-peligro-700'}`} role="status">
                        {moneda === 'USD' && <p className="text-sm">US$ {montoRecibido.toFixed(2)} equivalen a {cordobas(pago.equivalenteNIO)}</p>}
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-lg font-bold">{pago.suficiente ? 'Vuelto en córdobas' : 'Todavía faltan'}</span>
                          <span className="font-display text-3xl font-semibold tabular-nums">{cordobas(pago.suficiente ? pago.vuelto : pago.faltante)}</span>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <QrDeposito negocio={negocio} moneda={moneda} monto={moneda === 'USD' ? enDolares : calculo.totalCobrar} />
                    <Entrada etiqueta="Número de referencia del depósito" value={referencia} onChange={(e) => setReferencia(e.target.value)} maxLength={40} ayuda="Cópielo del comprobante del cliente y confirme que el depósito llegó antes de entregar el producto." />
                  </>
                )}

                {/* El botón de cobrar se queda siempre a la vista, aunque la cuenta sea larga. */}
                <div className="sticky bottom-0 -mx-4 -mb-4 space-y-2 border-t border-hueso-200 bg-hueso-50 px-4 py-3 sm:-mx-5 sm:-mb-5 sm:px-5">
                  <Boton variante="exito" tamano="lg" icono={Check} cargando={cobrando} disabled={!puedeCobrar} onClick={cobrar} className="w-full">
                    {metodo === 'EFECTIVO' ? 'Cobrar' : 'Confirmar depósito recibido'} · {cordobas(calculo.totalCobrar)}
                  </Boton>
                  <Boton variante="fantasma" tamano="sm" icono={Trash2} onClick={limpiar} className="w-full">
                    Vaciar la venta
                  </Boton>
                </div>
              </div>
            )}
          </Tarjeta>
        </section>
      </div>

      <SelectorCliente
        abierto={eligiendoCliente}
        alCerrar={() => setEligiendoCliente(false)}
        alElegir={(c) => {
          setCliente(c);
          setEligiendoCliente(false);
        }}
      />

      <Modal
        abierto={Boolean(ventaHecha)}
        titulo="Venta registrada"
        alCerrar={() => setVentaHecha(null)}
        pie={
          <>
            <Boton variante="secundario" icono={Printer} onClick={() => window.print()}>
              Imprimir comprobante
            </Boton>
            <Boton variante="exito" icono={Plus} onClick={() => setVentaHecha(null)} data-autofoco>
              Nueva venta
            </Boton>
          </>
        }
      >
        {ventaHecha && (
          <div className="space-y-4">
            <div className="no-imprimir flex items-center gap-3 rounded-2xl bg-hoja-50 px-4 py-3 text-hoja-800">
              <CircleCheck className="size-7 shrink-0" aria-hidden />
              <div>
                <p className="text-lg font-bold">
                  {ventaHecha.metodoPago === 'EFECTIVO' ? `Entregue de vuelto ${cordobas(ventaHecha.vuelto)}` : 'Depósito registrado'}
                </p>
                <p className="text-sm">Comprobante {ventaHecha.numeroFactura}. El inventario ya se descontó.</p>
              </div>
            </div>
            <Comprobante venta={ventaHecha} negocio={negocio} tasaIVA={tributaria.tasaIVA} />
          </div>
        )}
      </Modal>
    </>
  );
}
