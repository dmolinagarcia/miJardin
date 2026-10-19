// ui.js — piezas de interfaz compartidas: iconos, avisos, hoja inferior y confirmaciones.

import { esc } from './md.js';

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

const svg = (d) =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;

export const ICONOS = {
  temporada: svg('<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8 14h3"/>'),
  plano: svg('<path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z"/><path d="M9 4v13.5M15 6.5V20"/>'),
  fichas: svg('<path d="M5.5 19C5 11 10 5 19.5 4.5 20 14 14 19.5 5.5 19z"/><path d="M5.5 19 13.5 11"/>'),
  ajustes: svg('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>'),
  cerrar: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  izquierda: svg('<path d="M15 5l-7 7 7 7"/>'),
  derecha: svg('<path d="M9 5l7 7-7 7"/>'),
  mas: svg('<path d="M12 5v14M5 12h14"/>'),
  menos: svg('<path d="M5 12h14"/>'),
  girar: svg('<rect x="3.5" y="9.5" width="11" height="11" rx="1.5"/><path d="M9.5 5h4.5a5 5 0 0 1 5 5v4"/><path d="M16.5 11.5 19 14l2.5-2.5"/>'),
  lapiz: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
  github: svg('<path d="M9 19c-4 1.3-4-2-6-2.5M15 21v-3.4a3 3 0 0 0-.8-2.3c2.7-.3 5.6-1.4 5.6-6a4.7 4.7 0 0 0-1.3-3.2 4.4 4.4 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.6 11.6 0 0 0-6 0C6.6 2.6 5.6 2.9 5.6 2.9a4.4 4.4 0 0 0-.1 3.2A4.7 4.7 0 0 0 4.2 9.3c0 4.6 2.9 5.7 5.6 6a3 3 0 0 0-.8 2.3V21"/>'),
  hoja: svg('<path d="M6 3.5h8l4 4V20.5H6z"/><path d="M14 3.5v4h4M9 12h6M9 16h6"/>'),
  ubicacion: svg('<path d="M12 21s-6.5-6.2-6.5-11A6.5 6.5 0 0 1 18.5 10c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>'),
};

// ---------- Avisos breves ----------

// Si hay un diálogo abierto, el aviso va dentro de él para que no quede tapado.
function zonaAvisos() {
  const abiertos = [...document.querySelectorAll('dialog[open]')];
  const dialogo = abiertos[abiertos.length - 1];
  if (!dialogo) return $('#avisos');
  let zona = dialogo.querySelector(':scope > .avisos');
  if (!zona) {
    zona = document.createElement('div');
    zona.className = 'avisos';
    zona.setAttribute('aria-live', 'polite');
    dialogo.append(zona);
  }
  return zona;
}

export function aviso(texto, tipo = 'info') {
  const zona = zonaAvisos();
  if (!zona) return;
  const el = document.createElement('div');
  el.className = `aviso aviso-${tipo}`;
  el.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
  el.textContent = texto;
  zona.append(el);
  while (zona.children.length > 2) zona.firstElementChild.remove();
  setTimeout(() => {
    el.classList.add('saliendo');
    setTimeout(() => el.remove(), 300);
  }, tipo === 'error' ? 9000 : 5000);
}

// ---------- Hoja inferior (en escritorio, ventana centrada) ----------

let alCerrarHoja = null;
let ignorarCierre = false;

export function prepararDialogos() {
  const hoja = $('#hoja');
  hoja.addEventListener('click', (e) => {
    if (e.target === hoja || e.target.closest('[data-cerrar]')) hoja.close();
  });
  hoja.addEventListener('close', () => {
    if (ignorarCierre) {
      ignorarCierre = false;
      return;
    }
    const fn = alCerrarHoja;
    alCerrarHoja = null;
    fn?.();
  });
  const conf = $('#confirmar');
  conf.addEventListener('click', (e) => {
    if (e.target === conf) conf.close('');
  });
}

export function abrirHoja({ titulo, contenido, alMontar, alCerrar, ancha = false }) {
  const hoja = $('#hoja');
  if (hoja.open) {
    // Cambiar de contenido: se avisa a la hoja anterior aquí, no en el evento close.
    const anterior = alCerrarHoja;
    alCerrarHoja = null;
    ignorarCierre = true;
    hoja.close();
    anterior?.();
  }
  hoja.classList.toggle('ancha', ancha);
  hoja.innerHTML = `<div class="hoja-marco">
    <header class="hoja-cab"><h2 class="hoja-titulo" id="hoja-titulo">${titulo}</h2>
    <button class="boton-icono" type="button" data-cerrar aria-label="Cerrar">${ICONOS.cerrar}</button></header>
    <div class="hoja-cuerpo">${contenido}</div></div>`;
  hoja.setAttribute('aria-labelledby', 'hoja-titulo');
  alCerrarHoja = alCerrar || null;
  hoja.showModal();
  hoja.querySelector('.hoja-cuerpo').scrollTop = 0;
  alMontar?.(hoja);
  return hoja;
}

export function cerrarHoja() {
  const hoja = $('#hoja');
  if (hoja.open) hoja.close();
}

// ---------- Confirmación propia (sin window.confirm) ----------

export function confirmar({ titulo, texto = '', aceptar = 'Aceptar', cancelar = 'Cancelar', peligro = false }) {
  return new Promise((resolver) => {
    const d = $('#confirmar');
    d.innerHTML = `<form method="dialog" class="confirmar-marco">
      <h2>${esc(titulo)}</h2>${texto ? `<p>${esc(texto)}</p>` : ''}
      <div class="acciones">
        <button class="boton secundario" value="no" ${peligro ? 'autofocus' : ''}>${esc(cancelar)}</button>
        <button class="boton${peligro ? ' peligro' : ''}" value="si" ${peligro ? '' : 'autofocus'}>${esc(aceptar)}</button>
      </div></form>`;
    if (d.open) d.close('');
    d.returnValue = '';
    d.addEventListener('close', () => resolver(d.returnValue === 'si'), { once: true });
    d.showModal();
  });
}

// ---------- Utilidades ----------

export async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

export function descargar(nombre, texto, tipo = 'text/plain') {
  const url = URL.createObjectURL(new Blob([texto], { type: `${tipo};charset=utf-8` }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function guardarLocal(clave, valor) {
  try {
    if (valor === null) localStorage.removeItem(clave);
    else localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    /* almacenamiento no disponible */
  }
}

export function leerLocal(clave, defecto = null) {
  try {
    const v = localStorage.getItem(clave);
    return v === null ? defecto : JSON.parse(v);
  } catch {
    return defecto;
  }
}

export function fechaCorta(ms) {
  return new Date(ms).toLocaleString('es-ES', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}
