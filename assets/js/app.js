// app.js — arranque, navegación entre vistas y aviso de cambios sin guardar.

import { esc } from './md.js';
import { estado, cargarTodo } from './estado.js';
import { $, ICONOS, aviso, confirmar, prepararDialogos, cerrarHoja } from './ui.js';
import { ponerGuardia, hayCambios, ejecutarSalida } from './rutas.js';
import { vistaTemporada } from './vista-temporada.js';
import { vistaPlano } from './vista-plano.js';
import { vistaFichas, vistaFicha, vistaEditor, vistaNueva } from './vista-fichas.js';
import { vistaAjustes, vistaDatos } from './vista-ajustes.js';

const SECCIONES = [
  { ruta: '#/temporada', nombre: 'Temporada', icono: ICONOS.temporada, activa: (r) => r.startsWith('#/temporada') },
  { ruta: '#/plano', nombre: 'Plano', icono: ICONOS.plano, activa: (r) => r.startsWith('#/plano') },
  { ruta: '#/fichas', nombre: 'Fichas', icono: ICONOS.fichas, activa: (r) => /^#\/(fichas|ficha\/|editar\/|nueva)/.test(r) },
];

const RUTAS = [
  [/^#\/temporada(?:\/(\d{1,2}))?$/, (app, m) => vistaTemporada(app, m[1] ? Number(m[1]) : null)],
  [/^#\/plano(?:\/([\w-]+))?$/, (app, m) => vistaPlano(app, m[1] || null)],
  [/^#\/fichas$/, (app) => vistaFichas(app)],
  [/^#\/ficha\/([\w-]+)$/, (app, m) => vistaFicha(app, m[1])],
  [/^#\/editar\/([\w-]+)$/, (app, m) => vistaEditor(app, m[1])],
  [/^#\/nueva$/, (app) => vistaNueva(app)],
  [/^#\/ajustes$/, (app) => vistaAjustes(app)],
  [/^#\/datos$/, (app) => vistaDatos(app)],
];

let rutaActual = '';
let rutaConfirmada = '';

function pintarNavegacion() {
  const enlaces = SECCIONES.map((s) => `<a href="${s.ruta}" data-seccion="${s.ruta}">${s.icono}<span>${s.nombre}</span></a>`).join('');
  $('#nav-arriba').innerHTML = enlaces;
  $('#pestanas').innerHTML = enlaces;
  $('#enlace-ajustes').innerHTML = ICONOS.ajustes;
}

function marcarNavegacion(ruta) {
  for (const a of document.querySelectorAll('[data-seccion]')) {
    const s = SECCIONES.find((x) => x.ruta === a.dataset.seccion);
    if (s.activa(ruta)) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  const ajustes = $('#enlace-ajustes');
  if (/^#\/(ajustes|datos)/.test(ruta)) ajustes.setAttribute('aria-current', 'page');
  else ajustes.removeAttribute('aria-current');
}

const vistaDe = (ruta) => ruta.split('/')[1] || '';

function enrutar() {
  let ruta = location.hash;
  if (!ruta || ruta === '#' || ruta === '#/') {
    history.replaceState(null, '', '#/temporada');
    ruta = '#/temporada';
  }
  if (!ruta.startsWith('#/')) return; // ancla dentro de la página
  const app = $('#app');
  const cambiaDeVista = vistaDe(ruta) !== vistaDe(rutaActual);
  if (cambiaDeVista) ejecutarSalida();
  ponerGuardia(null);
  cerrarHoja();
  rutaActual = ruta;
  rutaConfirmada = ruta;
  marcarNavegacion(ruta);
  const encontrada = RUTAS.find(([re]) => re.test(ruta));
  if (encontrada) {
    encontrada[1](app, ruta.match(encontrada[0]));
  } else {
    app.innerHTML = `<section class="vacio-grande"><h1>Esta página no existe</h1>
      <p>No hay nada en «${esc(ruta)}».</p><a class="boton" href="#/temporada">Ir a la temporada</a></section>`;
  }
  if (cambiaDeVista) {
    window.scrollTo(0, 0);
    $('#principal').focus({ preventScroll: true });
  }
}

async function alCambiarRuta() {
  if (!location.hash.startsWith('#/') && location.hash) return;
  if (hayCambios()) {
    const destino = location.hash;
    history.replaceState(null, '', rutaConfirmada);
    const salir = await confirmar({
      titulo: 'Hay cambios sin guardar',
      texto: 'Si sales ahora, se perderán.',
      aceptar: 'Salir sin guardar',
      cancelar: 'Seguir editando',
      peligro: true,
    });
    if (!salir) return;
    ponerGuardia(null);
    location.hash = destino;
    return;
  }
  enrutar();
}

function pintarError(e) {
  const local = location.protocol === 'file:';
  $('#app').innerHTML = `<section class="vacio-grande">
    <h1>No se han podido cargar los datos del jardín</h1>
    <p>${esc(e.message)}</p>
    ${
      local
        ? '<p>Estás abriendo el archivo directamente desde el disco, y el navegador no deja leer las fichas así. Sírvelo con un servidor local (por ejemplo, <code>python3 -m http.server</code> dentro de la carpeta) o publícalo en GitHub Pages.</p>'
        : ''
    }
    <button type="button" class="boton" id="reintentar">Reintentar</button>
  </section>`;
  $('#reintentar').addEventListener('click', () => location.reload());
}

function pintarNombre() {
  $('#nombre-jardin').textContent = estado.jardin.nombre;
}

// En una copia de vista previa (fuera de GitHub Pages) no se puede guardar: se avisa arriba.
function avisoVistaPrevia() {
  if (!('vistaPrevia' in document.documentElement.dataset)) return;
  const banda = document.createElement('div');
  banda.className = 'banda-previa';
  banda.innerHTML = '<p>Vista previa: puedes recorrer la web, pero desde aquí no se guarda nada. Para editar, publícala en GitHub Pages.</p>';
  $('#principal').prepend(banda);
}

async function iniciar() {
  pintarNavegacion();
  prepararDialogos();
  avisoVistaPrevia();
  try {
    await cargarTodo();
  } catch (e) {
    pintarError(e);
    return;
  }
  pintarNombre();
  if (estado.avisoCarga) aviso(estado.avisoCarga, 'error');
  window.addEventListener('hashchange', alCambiarRuta);
  window.addEventListener('jardin:recargado', () => {
    pintarNombre();
    rutaActual = '';
    enrutar();
  });
  window.addEventListener('beforeunload', (e) => {
    if (hayCambios()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  enrutar();
}

iniciar();
