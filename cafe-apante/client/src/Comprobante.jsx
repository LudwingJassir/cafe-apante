import { cordobas, dinero, fechaHora, nombreMetodo } from './formato.js';

function Fila({ etiqueta, valor, fuerte = false }) {
  return (
    <div className={`flex justify-between gap-4 ${fuerte ? 'text-lg font-bold' : ''}`}>
      <span>{etiqueta}</span>
      <span className="tabular-nums">{valor}</span>
    </div>
  );
}

/** Comprobante de venta: se ve en pantalla y es lo único que sale al imprimir. */
export default function Comprobante({ venta, negocio, tasaIVA }) {
  const anulada = venta.estado === 'ANULADA';
  const efectivo = venta.metodoPago === 'EFECTIVO';
  return (
    <article className="imprimible mx-auto w-full max-w-sm rounded-xl border border-hueso-300 bg-white p-5 font-mono text-[0.88rem] leading-relaxed text-cafe-900">
      <header className="text-center">
        <p className="font-display text-xl font-bold">{negocio?.nombre ?? 'Café Apante'}</p>
        {negocio?.ruc && <p>RUC: {negocio.ruc}</p>}
        {negocio?.direccion && <p>{negocio.direccion}</p>}
        {negocio?.telefono && <p>Tel.: {negocio.telefono}</p>}
      </header>

      <div className="my-3 border-y border-dashed border-cafe-400 py-2">
        <Fila etiqueta="Comprobante N.º" valor={venta.numeroFactura} />
        <Fila etiqueta="Fecha" valor={fechaHora(venta.fecha)} />
        <Fila etiqueta="Cliente" valor={venta.cliente ?? 'Consumidor final'} />
        {venta.clienteIdentificacion && <Fila etiqueta="RUC / Cédula" valor={venta.clienteIdentificacion} />}
        <Fila etiqueta="Atendió" valor={venta.vendedor} />
      </div>

      {anulada && <p className="my-2 border-2 border-peligro-600 py-1 text-center text-lg font-bold tracking-widest text-peligro-700">ANULADA</p>}

      <table className="w-full">
        <thead>
          <tr className="border-b border-cafe-400 text-left">
            <th className="py-1 font-bold">Cant.</th>
            <th className="py-1 font-bold">Descripción</th>
            <th className="py-1 text-right font-bold">Importe</th>
          </tr>
        </thead>
        <tbody>
          {venta.detalles.map((d, i) => (
            <tr key={i} className="align-top">
              <td className="py-1 pr-2 tabular-nums">{d.cantidad}</td>
              <td className="py-1 pr-2">
                {d.descripcion}
                <span className="block text-[0.8rem] text-cafe-600">c/u {cordobas(d.precioUnitario)}</span>
              </td>
              <td className="py-1 text-right tabular-nums">{cordobas(d.importe)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-2 border-t border-dashed border-cafe-400 pt-2">
        <Fila etiqueta="Subtotal" valor={cordobas(venta.subtotal)} />
        <Fila etiqueta={`IVA${tasaIVA != null && venta.ivaCalculado > 0 ? ` (${Number(tasaIVA)} %)` : ''}`} valor={cordobas(venta.ivaCalculado)} />
        <Fila etiqueta="Total" valor={cordobas(venta.total)} fuerte={venta.retencionDGI === 0} />
        {venta.retencionDGI > 0 && (
          <>
            <Fila etiqueta="Retención IR" valor={`− ${cordobas(venta.retencionDGI)}`} />
            <Fila etiqueta="Neto a pagar" valor={cordobas(venta.totalCobrar)} fuerte />
          </>
        )}
      </div>

      <div className="mt-2 border-t border-dashed border-cafe-400 pt-2">
        <Fila etiqueta="Forma de pago" valor={nombreMetodo(venta.metodoPago, venta.monedaPago)} />
        {efectivo && <Fila etiqueta="Recibido" valor={dinero(venta.montoRecibido, venta.monedaPago)} />}
        {efectivo && venta.monedaPago === 'USD' && <Fila etiqueta="Tipo de cambio" valor={`C$ ${Number(venta.tipoCambio).toFixed(4)}`} />}
        {efectivo && <Fila etiqueta="Vuelto" valor={cordobas(venta.vuelto)} />}
        {!efectivo && venta.monedaPago === 'USD' && <Fila etiqueta="Equivalente" valor={dinero(venta.montoRecibido, 'USD')} />}
        {venta.referenciaDeposito && <Fila etiqueta="Referencia" valor={venta.referenciaDeposito} />}
      </div>

      <footer className="mt-3 text-center">
        <p>{Number(venta.totalLibras).toFixed(2)} lb de café en esta compra</p>
        {negocio?.mensajeComprobante && <p className="mt-1 font-bold">{negocio.mensajeComprobante}</p>}
      </footer>
    </article>
  );
}
