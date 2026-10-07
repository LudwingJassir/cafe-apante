import { useCallback, useEffect, useRef, useState } from 'react';

export class ErrorApi extends Error {
  constructor(estado, mensaje) {
    super(mensaje);
    this.estado = estado;
  }
}

export const EVENTO_SESION_VENCIDA = 'apante:sesion-vencida';

/** Llama a la API del sistema. Devuelve los datos o lanza un ErrorApi con un mensaje para mostrar. */
export async function api(ruta, { metodo = 'GET', cuerpo } = {}) {
  let respuesta;
  try {
    respuesta = await fetch(`/api${ruta}`, {
      method: metodo,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'cafe-apante' },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
  } catch {
    throw new ErrorApi(0, 'No hay conexión con el sistema. Revise que el programa esté abierto en la laptop.');
  }
  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    if (respuesta.status === 401 && !ruta.startsWith('/auth/login')) window.dispatchEvent(new Event(EVENTO_SESION_VENCIDA));
    throw new ErrorApi(respuesta.status, datos?.error ?? 'Ocurrió un problema. Intente de nuevo.');
  }
  return datos;
}

/**
 * Carga datos de una ruta y los vuelve a pedir cuando la ruta cambia.
 * Con `ruta` nula no consulta nada (útil para secciones que el rol no puede ver).
 */
export function useDatos(ruta) {
  const [estado, setEstado] = useState({ datos: null, cargando: Boolean(ruta), error: null });
  const pedido = useRef(0);

  const cargar = useCallback(async () => {
    if (!ruta) return;
    const turno = ++pedido.current;
    setEstado((previo) => ({ ...previo, cargando: true, error: null }));
    try {
      const datos = await api(ruta);
      // Si mientras tanto se pidió otra cosa, esta respuesta ya no interesa.
      if (turno === pedido.current) setEstado({ datos, cargando: false, error: null });
    } catch (error) {
      if (turno === pedido.current) setEstado((previo) => ({ ...previo, cargando: false, error: error.message }));
    }
  }, [ruta]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return { ...estado, recargar: cargar };
}
