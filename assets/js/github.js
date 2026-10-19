// github.js — leer y guardar archivos del repositorio desde el navegador.
// Usa la API de contenidos de GitHub con un token personal que se guarda
// solo en este navegador (localStorage). No hay ningún servidor intermedio.

const CLAVE = 'jardin:github';
const API = 'https://api.github.com';

function leerAlmacen() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE)) || {};
  } catch {
    return {};
  }
}

function escribirAlmacen(datos) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(datos));
    return true;
  } catch {
    return false;
  }
}

// En https://usuario.github.io/repositorio/ se deduce usuario y repositorio.
export function detectarRepositorio() {
  const m = location.hostname.match(/^([a-z0-9-]+)\.github\.io$/i);
  if (!m) return {};
  const usuario = m[1];
  const primero = location.pathname.split('/').filter(Boolean)[0];
  const repositorio = primero && !/\.html?$/i.test(primero) ? primero : `${usuario}.github.io`;
  return { usuario, repositorio };
}

export function config() {
  const guardada = leerAlmacen();
  const detectada = detectarRepositorio();
  return {
    usuario: guardada.usuario || detectada.usuario || '',
    repositorio: guardada.repositorio || detectada.repositorio || '',
    rama: guardada.rama || 'main',
    carpeta: String(guardada.carpeta || '').replace(/^\/+|\/+$/g, ''),
    token: guardada.token || '',
  };
}

export function configGuardada() {
  return leerAlmacen();
}

export function guardarConfig(cambios) {
  const datos = { ...leerAlmacen(), ...cambios };
  for (const k of Object.keys(datos)) {
    if (typeof datos[k] === 'string') datos[k] = datos[k].trim();
    if (datos[k] === '') delete datos[k];
  }
  return escribirAlmacen(datos);
}

export function olvidarToken() {
  const datos = leerAlmacen();
  delete datos.token;
  escribirAlmacen(datos);
}

export function repoConocido() {
  const c = config();
  return Boolean(c.usuario && c.repositorio);
}

export function puedeEscribir() {
  const c = config();
  return Boolean(c.usuario && c.repositorio && c.token);
}

function rutaEnRepo(c, ruta) {
  return (c.carpeta ? `${c.carpeta}/` : '') + ruta;
}

function codificarRuta(ruta) {
  return ruta.split('/').map(encodeURIComponent).join('/');
}

function urlContenido(c, ruta) {
  return `${API}/repos/${encodeURIComponent(c.usuario)}/${encodeURIComponent(c.repositorio)}/contents/${codificarRuta(rutaEnRepo(c, ruta))}`;
}

// Enlace para editar el archivo en la web de GitHub (sirve también desde el móvil).
export function urlEditar(ruta) {
  const c = config();
  if (!c.usuario || !c.repositorio) return null;
  return `https://github.com/${c.usuario}/${c.repositorio}/edit/${encodeURIComponent(c.rama)}/${codificarRuta(rutaEnRepo(c, ruta))}`;
}

export function urlVer(ruta) {
  const c = config();
  if (!c.usuario || !c.repositorio) return null;
  return `https://github.com/${c.usuario}/${c.repositorio}/blob/${encodeURIComponent(c.rama)}/${codificarRuta(rutaEnRepo(c, ruta))}`;
}

export function urlNuevo(carpeta) {
  const c = config();
  if (!c.usuario || !c.repositorio) return null;
  return `https://github.com/${c.usuario}/${c.repositorio}/new/${encodeURIComponent(c.rama)}/${codificarRuta(rutaEnRepo(c, carpeta))}`;
}

// ---------- Base64 con UTF-8 (tildes, eñes…) ----------

export function aBase64(texto) {
  const bytes = new TextEncoder().encode(texto);
  let binario = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(binario);
}

export function desdeBase64(b64) {
  const binario = atob(String(b64).replace(/\s/g, ''));
  const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// ---------- Peticiones ----------

function error(status, mensaje) {
  return Object.assign(new Error(mensaje), { status });
}

function mensajeError(status, detalle) {
  switch (status) {
    case 401:
      return 'GitHub no acepta el token. Puede que haya caducado o que esté mal copiado. Revísalo en Ajustes.';
    case 403:
      return /rate limit/i.test(detalle)
        ? 'GitHub ha limitado las peticiones durante un rato. Prueba de nuevo en unos minutos.'
        : 'El token no tiene permiso para escribir en este repositorio. Necesita el permiso «Contents» en «Read and write».';
    case 404:
      return 'GitHub no encuentra el repositorio o el archivo. Revisa usuario, repositorio y rama en Ajustes, y que el token tenga acceso a ese repositorio.';
    case 409:
      return 'El archivo ha cambiado en GitHub desde que lo abriste.';
    case 422:
      return `GitHub ha rechazado el cambio${detalle ? `: ${detalle}` : '.'}`;
    default:
      return `GitHub ha respondido con un error ${status}${detalle ? `: ${detalle}` : '.'}`;
  }
}

async function peticion(url, { metodo = 'GET', cuerpo } = {}) {
  const c = config();
  let r;
  try {
    r = await fetch(url, {
      method: metodo,
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${c.token}`,
        ...(cuerpo ? { 'Content-Type': 'application/json' } : {}),
      },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
  } catch {
    throw error(0, 'No hay conexión con GitHub. Comprueba que tienes internet y prueba otra vez.');
  }
  if (r.ok) return r.status === 204 ? null : r.json();
  let detalle = '';
  try {
    detalle = (await r.json()).message || '';
  } catch {
    /* sin cuerpo */
  }
  throw error(r.status, mensajeError(r.status, detalle));
}

export async function leer(ruta) {
  const c = config();
  const j = await peticion(`${urlContenido(c, ruta)}?ref=${encodeURIComponent(c.rama)}`);
  if (Array.isArray(j) || j.type !== 'file') throw error(400, `${ruta} no es un archivo.`);
  return { texto: desdeBase64(j.content || ''), sha: j.sha };
}

export async function escribir(ruta, texto, mensaje, sha) {
  const c = config();
  const cuerpo = { message: mensaje, content: aBase64(texto), branch: c.rama };
  if (sha) cuerpo.sha = sha;
  const j = await peticion(urlContenido(c, ruta), { metodo: 'PUT', cuerpo });
  return { sha: j.content.sha, commit: j.commit && j.commit.html_url };
}

export async function probar() {
  const c = config();
  const base = `${API}/repos/${encodeURIComponent(c.usuario)}/${encodeURIComponent(c.repositorio)}`;
  const repo = await peticion(base);
  try {
    await peticion(`${base}/branches/${encodeURIComponent(c.rama)}`);
  } catch (e) {
    if (e.status === 404) throw error(404, `El repositorio existe, pero no tiene una rama «${c.rama}». Su rama principal es «${repo.default_branch}».`);
    throw e;
  }
  return { nombre: repo.full_name, privado: repo.private, ramaPrincipal: repo.default_branch };
}
