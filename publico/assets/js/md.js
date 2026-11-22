// md.js — Markdown sencillo, lectura de fichas y utilidades de meses.
// Sin dependencias. Todo el texto se escapa antes de convertirlo en HTML.

export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const INICIALES = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

const TOKENS_MES = { sept: 9, set: 9, setiembre: 9 };
MESES.forEach((nombre, i) => {
  TOKENS_MES[nombre] = i + 1;
  TOKENS_MES[MESES_CORTOS[i]] = i + 1;
});

export const ESTACIONES = { invierno: 'Invierno', primavera: 'Primavera', verano: 'Verano', otono: 'Otoño' };

export const CATEGORIAS = {
  cosecha: 'Cosecha',
  poda: 'Poda',
  abono: 'Abonado',
  riego: 'Riego',
  proteccion: 'Protección',
  plagas: 'Plagas',
  flor: 'Floración',
  hoja: 'Hojas y brotes',
  plantar: 'Plantación',
  otro: 'Otras tareas',
};

// Palabras que delatan la categoría de una tarea. El orden importa.
const PISTAS = [
  ['cosecha', /cosech|recolec/],
  ['poda', /poda|podar|despunt|aclare/],
  ['abono', /abon|fertiliz/],
  ['riego', /rieg|regar/],
  ['plagas', /plaga|pulgon|arana|avispa|pajaro|hongo|cochinilla|caracol|babosa|oruga/],
  ['proteccion', /helad|frio|prote[cg]|manta|acolch|arpiller|sombr/],
  ['flor', /flor/],
  ['hoja', /hoja|brot|color/],
  ['plantar', /plant|sembr|esqueje|acodo/],
];

// Etiquetas que se pueden poner al final de una tarea: «- oct: Revisar tutores #poda»
const ETIQUETAS = {
  cosecha: 'cosecha', poda: 'poda', abono: 'abono', abonado: 'abono', riego: 'riego',
  proteccion: 'proteccion', helada: 'proteccion', heladas: 'proteccion', plagas: 'plagas', plaga: 'plagas',
  flor: 'flor', floracion: 'flor', hoja: 'hoja', hojas: 'hoja', brotacion: 'hoja',
  plantar: 'plantar', plantacion: 'plantar', otro: 'otro', otros: 'otro',
};

export function normalizar(texto) {
  return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function slug(texto) {
  return normalizar(texto).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
}

// ---------- Meses ----------

export function rangoMeses(desde, hasta) {
  const meses = [desde];
  for (let m = desde; m !== hasta;) {
    m = (m % 12) + 1;
    meses.push(m);
  }
  return meses;
}

// «oct–nov», «dic-feb», «finales de febrero a marzo», «todo el año»… → [10, 11]
export function parsearMeses(texto) {
  const n = normalizar(texto);
  if (/todo el ano|todos los meses/.test(n)) return rangoMeses(1, 12);
  const encontrados = n.split(/[^a-z]+/).map((t) => TOKENS_MES[t]).filter(Boolean);
  if (!encontrados.length) return null;
  return rangoMeses(encontrados[0], encontrados[encontrados.length - 1]);
}

export function textoRango(meses) {
  if (!meses || !meses.length) return '';
  if (meses.length >= 12) return 'todo el año';
  const a = MESES_CORTOS[meses[0] - 1];
  const b = MESES_CORTOS[meses[meses.length - 1] - 1];
  return meses.length === 1 ? a : `${a}–${b}`;
}

export function estacionDeNombre(nombre) {
  const n = normalizar(nombre);
  return ['invierno', 'primavera', 'verano', 'otono'].find((e) => n.includes(e)) || null;
}

export function estacionDelMes(mes) {
  if (mes === 12 || mes <= 2) return 'invierno';
  if (mes <= 5) return 'primavera';
  if (mes <= 8) return 'verano';
  return 'otono';
}

export function categoria(texto) {
  const n = normalizar(texto);
  const cabeza = n.split(/[:;,(]| y | o /)[0];
  for (const [clave, re] of PISTAS) if (re.test(cabeza)) return clave;
  for (const [clave, re] of PISTAS) if (re.test(n)) return clave;
  return 'otro';
}

// ---------- Markdown en línea ----------

const RE_EN_LINEA = /(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)|!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)|\[([^\]]+)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)|<(https?:\/\/[^>\s]+)>|(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"»])/g;

function urlSegura(url) {
  const u = String(url).trim();
  if (/^(https?:|mailto:|tel:)/i.test(u)) return u;
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return '#';
  return u;
}

function enlace(href, contenido) {
  const u = urlSegura(href);
  const externo = /^https?:/i.test(u);
  return `<a href="${esc(u)}"${externo ? ' target="_blank" rel="noopener noreferrer"' : ''}>${contenido}</a>`;
}

function enfasis(s) {
  return s
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
    .replace(/__(?=\S)([\s\S]*?\S)__/g, '<strong>$1</strong>')
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>')
    .replace(/\*(?=\S)([^*]*?\S)\*/g, '<em>$1</em>')
    .replace(/(^|[\s(«¿¡])_(?=\S)([^_]*?\S)_(?=$|[\s).,;:!?»])/g, '$1<em>$2</em>');
}

export function enLinea(texto) {
  const src = String(texto ?? '');
  const re = new RegExp(RE_EN_LINEA.source, 'g');
  let html = '';
  let ultimo = 0;
  let m;
  while ((m = re.exec(src))) {
    html += enfasis(esc(src.slice(ultimo, m.index)));
    if (m[1]) html += `<code>${esc(m[2])}</code>`;
    else if (m[4] !== undefined) html += `<img src="${esc(urlSegura(m[4]))}" alt="${esc(m[3])}" loading="lazy">`;
    else if (m[6] !== undefined) html += enlace(m[6], enLinea(m[5]));
    else if (m[7]) html += enlace(m[7], esc(m[7]));
    else if (m[8]) html += enlace(m[8], esc(m[8]));
    ultimo = re.lastIndex;
  }
  return html + enfasis(esc(src.slice(ultimo)));
}

// ---------- Markdown de bloque ----------

const RE_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const esRegla = (l) => /^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(l);
const esSeparadorTabla = (l) => l.includes('|') && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const esInicioBloque = (l) =>
  /^\s{0,3}#{1,6}(\s|$)/.test(l) || /^\s*(```|~~~)/.test(l) || /^\s*>/.test(l) || esRegla(l) || RE_ITEM.test(l);

function parrafo(lineas) {
  return lineas
    .map((l, k) => {
      const ultima = k === lineas.length - 1;
      const salto = !ultima && (/ {2,}$/.test(l) || /\\$/.test(l));
      return enLinea(l.replace(/\\$/, '').trim()) + (ultima ? '' : salto ? '<br>' : '\n');
    })
    .join('');
}

function celdas(linea) {
  let t = linea.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|')) t = t.slice(0, -1);
  return t.split('|').map((c) => c.trim());
}

function tabla(lineas, i) {
  const cabecera = celdas(lineas[i]);
  const alineacion = celdas(lineas[i + 1]).map((c) => (/^:-+:$/.test(c) ? 'center' : /-:$/.test(c) ? 'right' : ''));
  let j = i + 2;
  const filas = [];
  while (j < lineas.length && lineas[j].trim() && lineas[j].includes('|')) filas.push(celdas(lineas[j++]));
  const celda = (tag, c, k) => `<${tag}${alineacion[k] ? ` style="text-align:${alineacion[k]}"` : ''}>${enLinea(c)}</${tag}>`;
  const html =
    `<div class="tabla"><table><thead><tr>${cabecera.map((c, k) => celda('th', c, k)).join('')}</tr></thead>` +
    `<tbody>${filas.map((f) => `<tr>${cabecera.map((_, k) => celda('td', f[k] ?? '', k)).join('')}</tr>`).join('')}</tbody></table></div>`;
  return { html, fin: j };
}

function lista(lineas, inicio) {
  const primera = lineas[inicio].match(RE_ITEM);
  const base = primera[1].length;
  const ordenada = /\d/.test(primera[2]);
  const items = [];
  let i = inicio;
  while (i < lineas.length) {
    const l = lineas[i];
    const m = esRegla(l) ? null : l.match(RE_ITEM);
    if (m) {
      const sangria = m[1].length;
      if (sangria < base) break;
      if (sangria < base + 2 && items.length && /\d/.test(m[2]) !== ordenada) break;
      if (sangria < base + 2 || !items.length) {
        items.push({ lineas: [m[3]], sub: '' });
        i++;
        continue;
      }
      const r = lista(lineas, i);
      items[items.length - 1].sub += r.html;
      i = r.fin;
      continue;
    }
    if (!l.trim()) {
      let j = i + 1;
      while (j < lineas.length && !lineas[j].trim()) j++;
      if (j >= lineas.length) break;
      const mj = esRegla(lineas[j]) ? null : lineas[j].match(RE_ITEM);
      if (mj && mj[1].length >= base && (mj[1].length >= base + 2 || /\d/.test(mj[2]) === ordenada)) {
        i = j;
        continue;
      }
      const sangriaJ = lineas[j].match(/^\s*/)[0].length;
      if (!mj && items.length && sangriaJ >= base + 2) {
        items[items.length - 1].lineas.push('');
        i = j;
        continue;
      }
      break;
    }
    if (items.length && !esInicioBloque(l)) {
      items[items.length - 1].lineas.push(l.trim());
      i++;
      continue;
    }
    break;
  }
  const etiqueta = ordenada ? 'ol' : 'ul';
  const comienzo = ordenada ? parseInt(primera[2], 10) : 1;
  const html = items
    .map((it) => {
      const grupos = [[]];
      for (const l of it.lineas) {
        if (l === '') grupos.push([]);
        else grupos[grupos.length - 1].push(l);
      }
      const llenos = grupos.filter((g) => g.length);
      const cuerpo = llenos.length > 1 ? llenos.map((g) => `<p>${parrafo(g)}</p>`).join('') : parrafo(llenos[0] || ['']);
      return `<li>${cuerpo}${it.sub}</li>`;
    })
    .join('');
  return { html: `<${etiqueta}${comienzo !== 1 ? ` start="${comienzo}"` : ''}>${html}</${etiqueta}>`, fin: i };
}

export function markdown(md) {
  const lineas = String(md ?? '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
  let html = '';
  let i = 0;
  while (i < lineas.length) {
    const l = lineas[i];
    if (!l.trim()) {
      i++;
      continue;
    }
    let m = l.match(/^\s*(```|~~~)/);
    if (m) {
      const valla = m[1];
      const codigo = [];
      i++;
      while (i < lineas.length && !lineas[i].trim().startsWith(valla)) codigo.push(lineas[i++]);
      i++;
      html += `<pre><code>${esc(codigo.join('\n'))}</code></pre>`;
      continue;
    }
    m = l.match(/^\s{0,3}(#{1,6})(?:\s+(.*?))?\s*#*\s*$/);
    if (m) {
      const n = m[1].length;
      html += `<h${n}>${enLinea(m[2] || '')}</h${n}>`;
      i++;
      continue;
    }
    if (esRegla(l)) {
      html += '<hr>';
      i++;
      continue;
    }
    if (/^\s*>/.test(l)) {
      const cita = [];
      while (i < lineas.length && lineas[i].trim() && /^\s*>/.test(lineas[i])) cita.push(lineas[i++].replace(/^\s*>\s?/, ''));
      html += `<blockquote>${markdown(cita.join('\n'))}</blockquote>`;
      continue;
    }
    if (l.includes('|') && i + 1 < lineas.length && esSeparadorTabla(lineas[i + 1])) {
      const r = tabla(lineas, i);
      html += r.html;
      i = r.fin;
      continue;
    }
    if (RE_ITEM.test(l)) {
      const r = lista(lineas, i);
      html += r.html;
      i = r.fin;
      continue;
    }
    const texto = [l];
    i++;
    while (
      i < lineas.length &&
      lineas[i].trim() &&
      !esInicioBloque(lineas[i]) &&
      !(lineas[i].includes('|') && i + 1 < lineas.length && esSeparadorTabla(lineas[i + 1]))
    ) {
      texto.push(lineas[i++]);
    }
    html += `<p>${parrafo(texto)}</p>`;
  }
  return html;
}

// ---------- Fichas ----------

export function separarCabecera(texto) {
  const t = String(texto ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const m = t.match(/^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
  if (!m) return { meta: {}, cuerpo: t };
  const meta = {};
  for (const linea of m[1].split('\n')) {
    const mm = linea.match(/^\s*([\w-]+)\s*:\s*(.*?)\s*$/);
    if (mm) meta[normalizar(mm[1])] = mm[2].replace(/^(["'])(.*)\1$/, '$2');
  }
  return { meta, cuerpo: t.slice(m[0].length) };
}

function colorValido(c) {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(c || '').trim()) ? String(c).trim() : null;
}

function leerTarea(linea, orden) {
  const m = linea.match(/^\s*[-*+]\s+(.+)$/);
  if (!m) return null;
  const k = m[1].indexOf(':');
  if (k < 1) return null;
  const cuando = m[1].slice(0, k);
  const meses = cuando.length <= 40 ? parsearMeses(cuando) : null;
  if (!meses) return null;
  let texto = m[1].slice(k + 1).replace(/^[\s*_]+/, '').trim();
  let cat = null;
  const etiqueta = texto.match(/\s#([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)\s*$/);
  if (etiqueta && ETIQUETAS[normalizar(etiqueta[1])]) {
    cat = ETIQUETAS[normalizar(etiqueta[1])];
    texto = texto.slice(0, etiqueta.index).trim();
  }
  if (!texto) return null;
  return { meses, cuando: textoRango(meses), texto, categoria: cat || categoria(texto), orden };
}

export function parsearFicha(id, texto) {
  const { meta, cuerpo } = separarCabecera(texto);
  let titulo = '';
  const intro = [];
  const bloques = [];
  let actual = null;
  let enCodigo = false;
  for (const linea of cuerpo.split('\n')) {
    if (/^\s*(```|~~~)/.test(linea)) enCodigo = !enCodigo;
    if (!enCodigo) {
      const h1 = linea.match(/^#\s+(.+?)\s*#*\s*$/);
      if (h1 && !titulo && !actual) {
        titulo = h1[1];
        continue;
      }
      const h2 = linea.match(/^##\s+(.+?)\s*#*\s*$/);
      if (h2) {
        actual = { titulo: h2[1], lineas: [] };
        bloques.push(actual);
        continue;
      }
    }
    (actual ? actual.lineas : intro).push(linea);
  }

  const secciones = bloques.map((b, i) => {
    const parentesis = b.titulo.match(/\(([^)]*)\)/);
    const nombre = b.titulo.replace(/\s*\([^)]*\)\s*/g, ' ').trim() || b.titulo;
    const esCalendario = /^calendario\b/.test(normalizar(nombre));
    const meses = !esCalendario && parentesis ? parsearMeses(parentesis[1]) : null;
    return {
      indice: i,
      titulo: b.titulo,
      nombre,
      tipo: esCalendario ? 'calendario' : meses ? 'periodo' : 'general',
      meses,
      estacion: meses ? estacionDeNombre(nombre) : null,
      ancla: `sec-${slug(nombre)}-${i}`,
      cuerpo: b.lineas.join('\n').trim(),
    };
  });

  const calendario = [];
  for (const s of secciones.filter((x) => x.tipo === 'calendario')) {
    for (const linea of s.cuerpo.split('\n')) {
      const tarea = leerTarea(linea, calendario.length);
      if (tarea) calendario.push(tarea);
    }
  }

  return {
    id,
    meta,
    nombre: meta.nombre || titulo || id,
    titulo,
    cientifico: meta.cientifico || meta['nombre-cientifico'] || '',
    color: colorValido(meta.color),
    intro: intro.join('\n').trim(),
    secciones,
    calendario,
    texto,
  };
}
