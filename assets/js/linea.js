// linea.js — línea temporal del año: fases de cada planta y barras de tareas.

import { MESES, INICIALES, CATEGORIAS, esc, enLinea } from './md.js';
import { calendarioOrdenado } from './estado.js';

// Una lista de meses (que puede cruzar el año, p. ej. dic–feb) en tramos dentro de ene–dic.
export function tramos(meses) {
  const cruza = meses.length > 1 && meses[0] > meses[meses.length - 1];
  const orden = [...new Set(meses)].sort((a, b) => a - b);
  const res = [];
  for (const m of orden) {
    const ultimo = res[res.length - 1];
    if (ultimo && m === ultimo.hasta + 1) ultimo.hasta = m;
    else res.push({ desde: m, hasta: m });
  }
  for (const t of res) {
    t.sigueAntes = cruza && t.desde === 1;
    t.sigueDespues = cruza && t.hasta === 12;
  }
  return res;
}

export function posicionHoy(fecha = new Date()) {
  const m = fecha.getMonth();
  const dias = new Date(fecha.getFullYear(), m + 1, 0).getDate();
  return ((m + (fecha.getDate() - 0.5) / dias) / 12) * 100;
}

function claseCortes(t) {
  return `${t.sigueAntes ? ' sigue-antes' : ''}${t.sigueDespues ? ' sigue-despues' : ''}`;
}

function filaFases(ficha, enlazar, etiqueta) {
  const fases = ficha.secciones.filter((s) => s.tipo === 'periodo');
  const segmentos = fases
    .flatMap((s) =>
      tramos(s.meses).map((t) => {
        const ancho = t.hasta - t.desde + 1;
        const visible = ancho === 1 ? s.nombre.slice(0, 3) : s.nombre;
        return `<span class="seg est-${s.estacion || 'otra'}${claseCortes(t)}" style="grid-column:${t.desde} / ${t.hasta + 1}" title="${esc(s.titulo)}">
          <span aria-hidden="true">${esc(visible)}</span><span class="sr">${esc(s.nombre)}: ${esc(MESES[t.desde - 1])} a ${esc(MESES[t.hasta - 1])}.</span></span>`;
      }),
    )
    .join('');
  const nombre = etiqueta
    ? `<span class="linea-planta">${esc(etiqueta)}</span>`
    : enlazar
      ? `<a class="linea-planta" href="#/ficha/${esc(ficha.id)}"><span class="muestra" style="--f:${ficha.color}"></span>${esc(ficha.nombre)}</a>`
      : `<span class="linea-planta"><span class="muestra" style="--f:${ficha.color}"></span>${esc(ficha.nombre)}</span>`;
  return `<div class="linea-fila linea-fase">
    <div class="linea-etq">${nombre}</div>
    <div class="linea-barras">${segmentos || '<span class="linea-vacia">Sin temporadas con meses</span>'}</div>
  </div>`;
}

function filasTareas(ficha) {
  return calendarioOrdenado(ficha)
    .map(
      (t) => `<div class="linea-fila linea-tarea">
      <div class="linea-etq"><span class="tarea-texto">${enLinea(t.texto)}</span> <span class="tarea-rango">${esc(t.cuando)}</span></div>
      <div class="linea-barras">${tramos(t.meses)
        .map((tr) => `<span class="barra cat-${t.categoria}${claseCortes(tr)}" style="grid-column:${tr.desde} / ${tr.hasta + 1}" title="${esc(CATEGORIAS[t.categoria])}"></span>`)
        .join('')}</div>
    </div>`,
    )
    .join('');
}

// fichas: lista de fichas; mes: mes destacado (1–12) o null;
// enlaceMes: función que da el enlace de cada mes (o null para cabecera fija);
// tareas: mostrar también las barras del calendario; enlazar: nombre de la planta con enlace;
// etiquetaFases: texto para la fila de épocas en lugar del nombre de la planta.
export function lineaTemporal({ fichas, mes = null, enlaceMes = null, tareas = false, enlazar = true, etiquetaFases = '' }) {
  const hoyMes = new Date().getMonth() + 1;
  const cabecera = INICIALES.map((inicial, k) => {
    const m = k + 1;
    const clases = `linea-mes${m === mes ? ' sel' : ''}${m === hoyMes ? ' hoy' : ''}`;
    const dentro = `<span aria-hidden="true">${inicial}</span><span class="sr">${MESES[k]}${m === hoyMes ? ' (mes actual)' : ''}</span>`;
    return enlaceMes
      ? `<a class="${clases}" href="${enlaceMes(m)}"${m === mes ? ' aria-current="true"' : ''}>${dentro}</a>`
      : `<span class="${clases}">${dentro}</span>`;
  }).join('');
  const grupos = fichas
    .map(
      (f) => `<div class="linea-grupo" role="group" aria-label="${esc(f.nombre)}">
      ${filaFases(f, enlazar, etiquetaFases)}${tareas ? filasTareas(f) : ''}</div>`,
    )
    .join('');
  return `<div class="linea${tareas ? ' con-tareas' : ''}" style="--hoy:${posicionHoy().toFixed(2)}%;${mes ? `--sel:${mes};` : ''}">
    <div class="linea-fila linea-cab"><div class="linea-etq"></div><div class="linea-meses">${cabecera}</div></div>
    ${grupos}
  </div>`;
}

export function leyendaCategorias(fichas) {
  const usadas = new Set(fichas.flatMap((f) => f.calendario.map((t) => t.categoria)));
  return `<ul class="leyenda-cat" aria-label="Colores de las tareas">${Object.entries(CATEGORIAS)
    .filter(([k]) => usadas.has(k))
    .map(([k, nombre]) => `<li class="cat-${k}"><span class="punto" aria-hidden="true"></span>${esc(nombre)}</li>`)
    .join('')}</ul>`;
}
