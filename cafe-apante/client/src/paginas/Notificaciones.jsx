import { ArrowRight, BellRing, CheckCheck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, useDatos } from '../api.js';
import { useAvisos, useSesion } from '../contexto.jsx';
import { fechaHora, haceCuanto } from '../formato.js';
import { Boton, Cargando, Encabezado, EstadoVacio, ESTILO_NIVEL, Insignia, MensajeError, Segmentado, Tarjeta } from '../ui.jsx';

const TIPOS = [
  { valor: '', etiqueta: 'Todos los temas' },
  { valor: 'STOCK', etiqueta: 'Inventario' },
  { valor: 'CAJA', etiqueta: 'Caja' },
  { valor: 'VENTA', etiqueta: 'Ventas' },
  { valor: 'IMPUESTOS', etiqueta: 'Impuestos' },
  { valor: 'RESPALDO', etiqueta: 'Respaldos' },
  { valor: 'USUARIOS', etiqueta: 'Usuarios' },
];
const NOMBRE_TIPO = Object.fromEntries(TIPOS.map((t) => [t.valor, t.etiqueta]));

export default function Notificaciones() {
  const { conteo, refrescarNotificaciones } = useSesion();
  const avisos = useAvisos();
  const [vista, setVista] = useState('pendientes');
  const [tipo, setTipo] = useState('');
  const ruta = `/notificaciones?${new URLSearchParams({ ...(vista === 'pendientes' ? { soloNoLeidas: '1' } : {}), ...(tipo ? { tipo } : {}) })}`;
  const { datos, cargando, error, recargar } = useDatos(ruta);

  async function marcar(id) {
    try {
      await api(`/notificaciones/${id}/leer`, { metodo: 'POST' });
      await Promise.all([recargar(), refrescarNotificaciones()]);
    } catch (err) {
      avisos.error(err.message);
    }
  }

  async function marcarTodas() {
    try {
      await api('/notificaciones/leer-todas', { metodo: 'POST' });
      avisos.exito('Todas las notificaciones quedaron marcadas como leídas.');
      await Promise.all([recargar(), refrescarNotificaciones()]);
    } catch (err) {
      avisos.error(err.message);
    }
  }

  return (
    <>
      <Encabezado
        titulo="Notificaciones"
        descripcion="Aquí llegan todos los avisos del sistema: stock bajo o medio, movimientos de caja, respaldos, impuestos y cambios de usuarios."
      >
        <Boton variante="secundario" icono={CheckCheck} onClick={marcarTodas} disabled={conteo.sinLeer === 0}>
          Marcar todas como leídas
        </Boton>
      </Encabezado>

      <div className="mb-5 flex flex-wrap items-end gap-4">
        <Segmentado
          className="w-full sm:w-[26rem]"
          nombre="Qué notificaciones mostrar"
          valor={vista}
          alCambiar={setVista}
          opciones={[
            { valor: 'pendientes', etiqueta: `Sin leer (${conteo.sinLeer})` },
            { valor: 'todas', etiqueta: 'Todas' },
          ]}
        />
        <div className="w-full sm:w-64">
          <label htmlFor="filtro-tipo" className="sr-only">
            Tema
          </label>
          <select id="filtro-tipo" className="control" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.etiqueta}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <MensajeError mensaje={error} alReintentar={recargar} />}
      {cargando && !datos && <Cargando />}

      {datos && datos.length === 0 && (
        <Tarjeta>
          <EstadoVacio
            icono={BellRing}
            titulo={vista === 'pendientes' ? 'Está al día' : 'Todavía no hay notificaciones'}
            texto={vista === 'pendientes' ? 'No tiene avisos pendientes de leer.' : 'Cuando el sistema tenga algo que avisarle, aparecerá aquí.'}
          />
        </Tarjeta>
      )}

      <ul className="space-y-3">
        {datos?.map((n) => {
          const estilo = ESTILO_NIVEL[n.nivel];
          return (
            <li key={n.idNotificacion} className={`flex gap-4 rounded-2xl border border-l-[6px] border-hueso-300 bg-white p-4 shadow-tarjeta sm:p-5 ${estilo.borde} ${n.leida ? 'opacity-70' : ''}`}>
              <span className={`flex size-12 shrink-0 items-center justify-center rounded-full ${estilo.fondo}`}>
                <estilo.Icono className={`size-6 ${estilo.color}`} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <h2 className="text-lg font-semibold text-cafe-900">{n.titulo}</h2>
                  <Insignia tono={estilo.tono}>{estilo.etiqueta}</Insignia>
                  <Insignia>{NOMBRE_TIPO[n.tipo] ?? 'Sistema'}</Insignia>
                </div>
                <p className="mt-1.5 text-cafe-700 [overflow-wrap:anywhere]">{n.mensaje}</p>
                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                  <span className="text-sm text-cafe-500" title={fechaHora(n.fecha)}>
                    {haceCuanto(n.fecha)} · {fechaHora(n.fecha)}
                  </span>
                  {n.enlace && (
                    <Link to={n.enlace} className="inline-flex min-h-10 items-center gap-1.5 font-semibold text-caramelo-700 underline-offset-4 hover:underline">
                      Ir a revisarlo <ArrowRight className="size-4" aria-hidden />
                    </Link>
                  )}
                  {!n.leida && (
                    <Boton variante="secundario" tamano="sm" icono={CheckCheck} onClick={() => marcar(n.idNotificacion)} className="sm:ml-auto">
                      Marcar como leída
                    </Boton>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
