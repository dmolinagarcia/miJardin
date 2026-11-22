// estado.js — datos del usuario que ha entrado, cargados del servidor.
//   /api/fichas  → catálogo central de fichas, cada una con las notas de este usuario
//   /api/jardin  → el plano, las plantas y las fichas que tiene en su jardín

import { parsearFicha, slug } from './md.js';
import * as api from './api.js';

const COLORES = ['#b0243b', '#5b4687', '#2f7357', '#9a6a12', '#2c5f8a', '#8a4f2c', '#5f7420', '#a33f73'];

export const estado = {
  yo: null, // { id, usuario, nombre, rol }
  suscripcion: { premium: false, limite: Infinity }, // ver servidor/suscripcion.js
  config: { registroAbierto: false, limitePlantas: Infinity, pagos: false, precio: '' },
  jardin: null,
  versionJardin: 0,
  catalogo: new Map(), // id → { id, texto, version, actualizada, notas, vista } tal como llega del servidor
  fichas: new Map(), // id → ficha preparada (base + notas del usuario)
  avisoCarga: '',
  borradoresNuevos: new Map(), // id → texto de una ficha nueva aún sin guardar (admin)
};

export const esAdmin = () => estado.yo?.rol === 'admin';

function numero(v, defecto = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : defecto;
}

export function normalizarJardin(datos) {
  const j = datos && typeof datos === 'object' && !Array.isArray(datos) ? datos : {};
  const fichas = Array.isArray(j.fichas) ? [...new Set(j.fichas.filter((x) => typeof x === 'string' && /^[\w-]+$/.test(x)))] : [];
  const plano = j.plano && typeof j.plano === 'object' ? j.plano : {};
  let contorno = Array.isArray(plano.contorno)
    ? plano.contorno.filter((p) => Array.isArray(p) && p.length >= 2).map((p) => [numero(p[0]), numero(p[1])])
    : [];
  if (contorno.length < 3) contorno = [[0, 0], [10, 0], [10, 6], [0, 6]];
  const zonas = (Array.isArray(plano.zonas) ? plano.zonas : [])
    .filter((z) => z && typeof z === 'object')
    .map((z) => ({ ...z, nombre: String(z.nombre ?? ''), x: numero(z.x), y: numero(z.y) }));
  const usados = new Set();
  const plantas = (Array.isArray(j.plantas) ? j.plantas : [])
    .filter((p) => p && typeof p === 'object')
    .map((p, k) => {
      let id = String(p.id || p.etiqueta || `planta-${k + 1}`).toLowerCase().replace(/[^\w-]+/g, '-');
      while (usados.has(id)) id += '-b';
      usados.add(id);
      return {
        ...p,
        id,
        etiqueta: String(p.etiqueta ?? id),
        ficha: String(p.ficha ?? ''),
        x: numero(p.x),
        y: numero(p.y),
        notas: String(p.notas ?? ''),
      };
    });
  // Toda ficha que use una planta del plano forma parte del jardín.
  for (const p of plantas) if (p.ficha && /^[\w-]+$/.test(p.ficha) && !fichas.includes(p.ficha)) fichas.push(p.ficha);
  return { ...j, nombre: String(j.nombre || 'Mi jardín'), fichas, plano: { ...plano, contorno, zonas }, plantas };
}

// JSON legible: arrays y objetos cortos en una línea, el resto con sangría.
function bonito(v, nivel = 0) {
  const pad = '  '.repeat(nivel);
  const pad2 = '  '.repeat(nivel + 1);
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    if (v.every((x) => x === null || typeof x !== 'object')) {
      const linea = `[${v.map((x) => JSON.stringify(x)).join(', ')}]`;
      if (pad.length + linea.length <= 76) return linea;
    }
    return `[\n${v.map((x) => pad2 + bonito(x, nivel + 1)).join(',\n')}\n${pad}]`;
  }
  if (v && typeof v === 'object') {
    const claves = Object.keys(v).filter((k) => v[k] !== undefined);
    if (!claves.length) return '{}';
    if (claves.length <= 4 && claves.every((k) => v[k] === null || typeof v[k] !== 'object')) {
      const linea = `{ ${claves.map((k) => `${JSON.stringify(k)}: ${JSON.stringify(v[k])}`).join(', ')} }`;
      if (pad.length + linea.length <= 76) return linea;
    }
    return `{\n${claves.map((k) => `${pad2}${JSON.stringify(k)}: ${bonito(v[k], nivel + 1)}`).join(',\n')}\n${pad}}`;
  }
  return JSON.stringify(v);
}

export function jardinATexto(jardin) {
  return `${bonito(jardin)}\n`;
}

// ---------- Fichas: base del catálogo + notas del usuario ----------

const colorPorPosicion = (posicion) => COLORES[Math.max(0, posicion) % COLORES.length];

// Las notas usan el mismo formato que las fichas: texto libre arriba, «## Calendario» con tareas
// y secciones con meses entre paréntesis. Se suman a la ficha base marcadas como propias.
export function parsearNotas(id, texto) {
  const n = parsearFicha(id, texto || '');
  const libre = [n.titulo ? `**${n.titulo}**` : '', n.intro].filter(Boolean).join('\n\n');
  return {
    texto: texto || '',
    intro: libre,
    secciones: n.secciones
      .filter((s) => s.tipo !== 'calendario')
      .map((s) => ({ ...s, propia: true, ancla: `nota-${s.ancla}` })),
    calendario: n.calendario.map((t) => ({ ...t, propia: true, orden: 1000 + t.orden })),
  };
}

export function prepararFicha(id, texto, posicion, { notas = '', extra = {} } = {}) {
  const base = parsearFicha(id, texto);
  base.color = base.color || colorPorPosicion(posicion);
  const n = parsearNotas(id, notas);
  return {
    ...base,
    ...extra,
    base,
    notas: { ...n, ...(extra.notas || {}), texto: n.texto, intro: n.intro, secciones: n.secciones, calendario: n.calendario },
    secciones: [...base.secciones, ...n.secciones],
    calendario: [...base.calendario, ...n.calendario],
  };
}

function prepararDesdeCatalogo(c, posicion) {
  return prepararFicha(c.id, c.texto, posicion, {
    notas: c.notas?.texto || '',
    extra: {
      version: c.version,
      actualizada: c.actualizada,
      vista: c.vista || 0,
      notas: { version: c.notas?.version || 0, actualizada: c.notas?.actualizada || null },
    },
  });
}

function rehacerFichas() {
  estado.fichas.clear();
  [...estado.catalogo.values()].forEach((c, i) => estado.fichas.set(c.id, prepararDesdeCatalogo(c, i)));
}

export async function cargarYo() {
  const { usuario, suscripcion } = await api.get('yo');
  estado.yo = usuario;
  if (suscripcion) estado.suscripcion = suscripcion;
  return usuario;
}

export async function cargarConfig() {
  try {
    estado.config = { ...estado.config, ...(await api.get('config')) };
  } catch {
    /* se sigue con lo que hubiera */
  }
  return estado.config;
}

// Plan gratuito: cuántas plantas caben todavía en el plano (Infinity si no hay límite).
export function plantasLibres(n = estado.jardin?.plantas.length || 0) {
  if (estado.suscripcion.premium) return Infinity;
  return Math.max(0, estado.suscripcion.limite - n);
}

export async function cargarTodo() {
  estado.avisoCarga = '';
  const [{ fichas }, jardin] = await Promise.all([api.get('fichas'), api.get('jardin'), cargarConfig()]);
  estado.catalogo = new Map(fichas.map((f) => [f.id, f]));
  rehacerFichas();
  estado.jardin = normalizarJardin(jardin.datos);
  estado.versionJardin = jardin.version;
  const perdidas = estado.jardin.fichas.filter((id) => !estado.fichas.has(id));
  if (perdidas.length) estado.avisoCarga = `Tu jardín usa fichas que ya no están en el catálogo: ${perdidas.join(', ')}.`;
}

// ---------- Consultas ----------

// Las fichas del jardín del usuario, en su orden.
export const listaFichas = () => estado.jardin.fichas.map((id) => estado.fichas.get(id)).filter(Boolean);
// Todo el catálogo, por nombre.
export const listaCatalogo = () =>
  [...estado.fichas.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
export const enMiJardin = (id) => estado.jardin.fichas.includes(id);
export const plantasDe = (id, jardin = estado.jardin) => jardin.plantas.filter((p) => p.ficha === id);
export const periodosDelMes = (ficha, mes) => ficha.secciones.filter((s) => s.tipo === 'periodo' && s.meses.includes(mes));
export const calendarioOrdenado = (ficha) =>
  [...ficha.calendario].sort((a, b) => Math.min(...a.meses) - Math.min(...b.meses) || a.orden - b.orden);
export const tareasDelMes = (ficha, mes) => calendarioOrdenado(ficha).filter((t) => t.meses.includes(mes));
export const colorDe = (fichaId) => estado.fichas.get(fichaId)?.color || '#6b756f';
export const mesActual = () => new Date().getMonth() + 1;
// La ficha base ha cambiado desde la última vez que el usuario la abrió.
export const tieneNovedad = (f) => Boolean(f.vista && f.version > f.vista);
export const idDeNombre = (texto) => slug(texto).slice(0, 40).replace(/-+$/, '');

// ---------- Guardado ----------

export async function guardarJardin(nuevo, { forzar = false } = {}) {
  const limpio = normalizarJardin(JSON.parse(JSON.stringify(nuevo)));
  const r = await api.put('jardin', { datos: limpio, version: estado.versionJardin, forzar });
  estado.jardin = limpio;
  estado.versionJardin = r.version;
  return r;
}

export async function ponerEnMiJardin(id, si) {
  const j = JSON.parse(JSON.stringify(estado.jardin));
  if (si && !j.fichas.includes(id)) j.fichas.push(id);
  if (!si) j.fichas = j.fichas.filter((x) => x !== id);
  return guardarJardin(j);
}

export async function guardarNotas(id, texto, { forzar = false } = {}) {
  const c = estado.catalogo.get(id);
  const r = await api.put(`fichas/${encodeURIComponent(id)}/notas`, { texto, version: c.notas?.version || 0, forzar });
  c.notas = r.notas;
  rehacerFichas();
  return r;
}

export async function marcarVista(id) {
  const c = estado.catalogo.get(id);
  if (!c || c.vista >= c.version) return;
  c.vista = c.version;
  estado.fichas.get(id).vista = c.version;
  try {
    await api.post(`fichas/${encodeURIComponent(id)}/vista`, { version: c.version });
  } catch {
    /* no es importante */
  }
}

// Solo administradores: crear o actualizar la ficha base del catálogo.
export async function guardarFichaBase(id, texto, { forzar = false } = {}) {
  const c = estado.catalogo.get(id);
  const r = c
    ? await api.put(`admin/fichas/${encodeURIComponent(id)}`, { texto, version: c.version, forzar })
    : await api.post('admin/fichas', { id, texto });
  const nueva = { id, texto, version: r.version, actualizada: r.actualizada, notas: c?.notas || { texto: '', version: 0 }, vista: r.version };
  estado.catalogo.set(id, nueva);
  if (!c) estado.catalogo = new Map([...estado.catalogo.entries()].sort(([a], [b]) => a.localeCompare(b)));
  rehacerFichas();
  estado.borradoresNuevos.delete(id);
  api.post(`fichas/${encodeURIComponent(id)}/vista`, { version: r.version }).catch(() => {});
  return r;
}
