// api.js — peticiones al servidor del jardín.

function error(status, mensaje, extra = {}) {
  return Object.assign(new Error(mensaje), { status, ...extra });
}

export async function pedir(metodo, ruta, cuerpo) {
  let r;
  try {
    r = await fetch(`api/${ruta.replace(/^\/+/, '')}`, {
      method: metodo,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
    });
  } catch {
    throw error(0, 'No hay conexión con el servidor. Comprueba la red y prueba otra vez.');
  }
  let datos = null;
  try {
    datos = await r.json();
  } catch {
    /* sin cuerpo JSON */
  }
  if (r.ok) return datos;
  if (r.status === 401 && !/^sesion$/.test(ruta)) window.dispatchEvent(new Event('jardin:sin-sesion'));
  const { error: mensaje, ...extra } = datos || {};
  throw error(r.status, mensaje || `El servidor ha respondido con un error ${r.status}.`, extra);
}

export const get = (ruta) => pedir('GET', ruta);
export const post = (ruta, cuerpo = {}) => pedir('POST', ruta, cuerpo);
export const put = (ruta, cuerpo = {}) => pedir('PUT', ruta, cuerpo);
export const patch = (ruta, cuerpo = {}) => pedir('PATCH', ruta, cuerpo);
export const borrar = (ruta) => pedir('DELETE', ruta);
