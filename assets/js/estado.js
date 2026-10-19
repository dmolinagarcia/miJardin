// estado.js — carga y guardado de los datos del jardín.
//   datos/jardin.json  → plano, plantas y lista de fichas
//   fichas/<id>.md     → una ficha por tipo de planta

import { parsearFicha } from './md.js';
import * as gh from './github.js';

export const RUTA_JARDIN = 'datos/jardin.json';
export const rutaFicha = (id) => `fichas/${id}.md`;

const COLORES = ['#b0243b', '#5b4687', '#2f7357', '#9a6a12', '#2c5f8a', '#8a4f2c', '#5f7420', '#a33f73'];

export const estado = {
  jardin: null,
  fichas: new Map(), // id → ficha
  textos: new Map(), // ruta → texto tal como se cargó o se guardó
  shas: new Map(), // ruta → sha del archivo en GitHub
  origen: 'web', // 'github' si se leyó con la API (siempre al día)
  avisoCarga: '',
  borradoresNuevos: new Map(), // id → texto de una ficha nueva aún sin guardar
};

let apiFallida = false;

async function leerTexto(ruta) {
  if (gh.puedeEscribir() && !apiFallida) {
    try {
      const { texto, sha } = await gh.leer(ruta);
      estado.shas.set(ruta, sha);
      estado.textos.set(ruta, texto);
      return texto;
    } catch (e) {
      apiFallida = true;
      estado.avisoCarga = `No se ha podido leer de GitHub (${e.message}) Se muestra la versión publicada.`;
    }
  }
  const r = await fetch(`${ruta}?v=${Date.now()}`, { cache: 'no-store' });
  if (!r.ok) throw Object.assign(new Error(`No se ha podido cargar ${ruta} (error ${r.status}).`), { status: r.status });
  const texto = await r.text();
  estado.textos.set(ruta, texto);
  return texto;
}

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

export function prepararFicha(id, texto, posicion) {
  const f = parsearFicha(id, texto);
  f.color = f.color || COLORES[posicion % COLORES.length];
  return f;
}

function fichaConError(id, e, posicion) {
  return {
    id,
    nombre: id,
    titulo: '',
    cientifico: '',
    color: COLORES[posicion % COLORES.length],
    intro: '',
    secciones: [],
    calendario: [],
    texto: '',
    error: e.message,
  };
}

export async function cargarTodo() {
  apiFallida = false;
  estado.avisoCarga = '';
  estado.shas.clear();
  estado.textos.clear();
  estado.fichas.clear();
  const texto = await leerTexto(RUTA_JARDIN);
  let datos;
  try {
    datos = JSON.parse(texto);
  } catch (e) {
    throw new Error(`El archivo ${RUTA_JARDIN} no es un JSON válido (${e.message}).`);
  }
  estado.jardin = normalizarJardin(datos);
  estado.origen = estado.shas.has(RUTA_JARDIN) ? 'github' : 'web';
  await Promise.all(
    estado.jardin.fichas.map(async (id, i) => {
      try {
        estado.fichas.set(id, prepararFicha(id, await leerTexto(rutaFicha(id)), i));
      } catch (e) {
        estado.fichas.set(id, fichaConError(id, e, i));
      }
    }),
  );
}

// ---------- Consultas ----------

export const listaFichas = () => estado.jardin.fichas.map((id) => estado.fichas.get(id)).filter(Boolean);
export const plantasDe = (id, jardin = estado.jardin) => jardin.plantas.filter((p) => p.ficha === id);
export const periodosDelMes = (ficha, mes) => ficha.secciones.filter((s) => s.tipo === 'periodo' && s.meses.includes(mes));
export const calendarioOrdenado = (ficha) =>
  [...ficha.calendario].sort((a, b) => Math.min(...a.meses) - Math.min(...b.meses) || a.orden - b.orden);
export const tareasDelMes = (ficha, mes) => calendarioOrdenado(ficha).filter((t) => t.meses.includes(mes));
export const colorDe = (fichaId) => estado.fichas.get(fichaId)?.color || '#6b756f';
export const mesActual = () => new Date().getMonth() + 1;

// ---------- Guardado ----------

const igual = (a, b) => String(a ?? '').replace(/\r\n?/g, '\n').trimEnd() === String(b ?? '').replace(/\r\n?/g, '\n').trimEnd();

function conflicto() {
  return Object.assign(new Error('El archivo ha cambiado en GitHub desde que lo abriste.'), { status: 409, conflicto: true });
}

export async function guardarTexto(ruta, texto, mensaje, { forzar = false } = {}) {
  // Al forzar (tras un conflicto) se pide siempre el sha más reciente.
  let sha = forzar ? null : estado.shas.get(ruta);
  if (!sha) {
    // Se cargó desde la web publicada: antes de escribir, mirar si en GitHub hay algo más nuevo.
    try {
      const actual = await gh.leer(ruta);
      const base = estado.textos.get(ruta);
      if (!forzar && base !== undefined && !igual(actual.texto, base) && !igual(actual.texto, texto)) throw conflicto();
      sha = actual.sha;
    } catch (e) {
      if (e.status !== 404) throw e;
      sha = null; // archivo nuevo
    }
  }
  try {
    const r = await gh.escribir(ruta, texto, mensaje, sha);
    estado.shas.set(ruta, r.sha);
    estado.textos.set(ruta, texto);
    return r;
  } catch (e) {
    const shaViejo = e.status === 409 || (e.status === 422 && /sha/i.test(e.message));
    if (!shaViejo) throw e;
    if (!forzar) throw conflicto();
    const actual = await gh.leer(ruta);
    const r = await gh.escribir(ruta, texto, mensaje, actual.sha);
    estado.shas.set(ruta, r.sha);
    estado.textos.set(ruta, texto);
    return r;
  }
}

export async function guardarJardin(nuevo, mensaje, opciones) {
  const limpio = normalizarJardin(JSON.parse(JSON.stringify(nuevo)));
  const r = await guardarTexto(RUTA_JARDIN, jardinATexto(limpio), mensaje, opciones);
  estado.jardin = limpio;
  return r;
}

export async function guardarFicha(id, texto, opciones) {
  const nueva = !estado.jardin.fichas.includes(id);
  const posicion = nueva ? estado.jardin.fichas.length : estado.jardin.fichas.indexOf(id);
  const ficha = prepararFicha(id, texto, posicion);
  const r = await guardarTexto(rutaFicha(id), texto, nueva ? `Nueva ficha: ${ficha.nombre}` : `Actualiza la ficha: ${ficha.nombre}`, opciones);
  estado.fichas.set(id, ficha);
  estado.borradoresNuevos.delete(id);
  if (nueva) {
    const j = JSON.parse(JSON.stringify(estado.jardin));
    j.fichas.push(id);
    await guardarJardin(j, `Añade la ficha ${ficha.nombre} al jardín`);
  }
  return r;
}
