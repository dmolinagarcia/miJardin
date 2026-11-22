// app.js — arranque, sesión, navegación entre vistas y aviso de cambios sin guardar.

import { esc } from './md.js';
import { estado, esAdmin, cargarYo, cargarTodo } from './estado.js';
import { $, ICONOS, aviso, confirmar, prepararDialogos, cerrarHoja } from './ui.js';
import { ponerGuardia, hayCambios, ejecutarSalida } from './rutas.js';
import { registrarServiceWorker, borrarCopiaDatos } from './instalar.js';
import * as api from './api.js';
import { vistaEntrar } from './vista-entrar.js';
import { vistaTemporada } from './vista-temporada.js';
import { vistaPlano } from './vista-plano.js';
import { vistaFichas, vistaFicha, vistaEditor, vistaNueva } from './vista-fichas.js';
import { vistaAjustes, vistaDatos } from './vista-ajustes.js';
import { vistaAdmin } from './vista-admin.js';

registrarServiceWorker();

const SECCIONES = [
  { ruta: '#/temporada', nombre: 'Temporada', icono: ICONOS.temporada, activa: (r) => r.startsWith('#/temporada') },
  { ruta: '#/plano', nombre: 'Plano', icono: ICONOS.plano, activa: (r) => r.startsWith('#/plano') },
  { ruta: '#/fichas', nombre: 'Fichas', icono: ICONOS.fichas, activa: (r) => /^#\/(fichas|ficha\/|notas\/)/.test(r) },
  { ruta: '#/admin', nombre: 'Admin', icono: ICONOS.admin, activa: (r) => r.startsWith('#/admin'), soloAdmin: true },
];

const RUTAS = [
  [/^#\/temporada(?:\/(\d{1,2}))?$/, (app, m) => vistaTemporada(app, m[1] ? Number(m[1]) : null)],
  [/^#\/plano(?:\/([\w-]+))?$/, (app, m) => vistaPlano(app, m[1] || null)],
  [/^#\/fichas$/, (app) => vistaFichas(app)],
  [/^#\/ficha\/([\w-]+)$/, (app, m) => vistaFicha(app, m[1])],
  [/^#\/notas\/([\w-]+)$/, (app, m) => vistaEditor(app, m[1], 'notas')],
  [/^#\/admin$/, (app) => vistaAdmin(app)],
  [/^#\/admin\/ficha\/([\w-]+)$/, (app, m) => vistaEditor(app, m[1], 'base')],
  [/^#\/admin\/nueva$/, (app) => vistaNueva(app)],
  [/^#\/ajustes(?:\/(pago-ok|pago-cancelado))?$/, (app, m) => vistaAjustes(app, m[1] || null)],
  [/^#\/datos$/, (app) => vistaDatos(app)],
];

let rutaActual = '';
let rutaConfirmada = '';
let iniciada = false;

function pintarNavegacion() {
  const enlaces = SECCIONES.filter((s) => !s.soloAdmin || esAdmin())
    .map((s) => `<a href="${s.ruta}" data-seccion="${s.ruta}">${s.icono}<span>${s.nombre}</span></a>`)
    .join('');
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
  // Direcciones antiguas
  if (/^#\/editar\/[\w-]+$/.test(ruta)) {
    history.replaceState(null, '', ruta.replace('#/editar/', '#/notas/'));
    ruta = location.hash;
  } else if (ruta === '#/nueva') {
    history.replaceState(null, '', '#/admin/nueva');
    ruta = '#/admin/nueva';
  }
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
  $('#app').innerHTML = `<section class="vacio-grande">
    <h1>No se han podido cargar los datos del jardín</h1>
    <p>${esc(e.message)}</p>
    <button type="button" class="boton" id="reintentar">Reintentar</button>
  </section>`;
  $('#reintentar').addEventListener('click', () => location.reload());
}

function pintarNombre() {
  $('#nombre-jardin').textContent = estado.jardin?.nombre || 'Jardín';
}

async function pantallaEntrar() {
  document.body.classList.add('sin-sesion');
  let cfg = { registroAbierto: false, sinUsuarios: false };
  try {
    cfg = await api.get('config');
  } catch {
    /* se muestra el formulario igualmente */
  }
  vistaEntrar($('#app'), {
    ...cfg,
    alEntrar: async (usuario) => {
      estado.yo = usuario;
      try {
        await cargarYo();
      } catch {
        /* se sigue con lo que devolvió la entrada */
      }
      await arrancarConSesion();
    },
  });
}

async function arrancarConSesion() {
  document.body.classList.remove('sin-sesion');
  pintarNavegacion();
  $('#app').innerHTML = '<p class="cargando" role="status">Cargando el jardín…</p>';
  try {
    await cargarTodo();
  } catch (e) {
    if (e.status === 401) return;
    pintarError(e);
    return;
  }
  pintarNombre();
  if (estado.avisoCarga) aviso(estado.avisoCarga, 'error');
  if (!iniciada) {
    iniciada = true;
    window.addEventListener('hashchange', alCambiarRuta);
  }
  rutaActual = '';
  enrutar();
}

async function iniciar() {
  prepararDialogos();
  window.addEventListener('jardin:recargado', () => {
    pintarNombre();
    rutaActual = '';
    enrutar();
  });
  window.addEventListener('jardin:nombre', pintarNombre);
  // La sesión ha caducado o se ha cerrado desde otro sitio.
  window.addEventListener('jardin:sin-sesion', async () => {
    if (!estado.yo) return;
    estado.yo = null;
    ponerGuardia(null);
    cerrarHoja();
    await borrarCopiaDatos();
    await pantallaEntrar();
    aviso('Tu sesión ha terminado. Vuelve a entrar.', 'error');
  });
  window.addEventListener('beforeunload', (e) => {
    if (hayCambios()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  try {
    await cargarYo();
  } catch (e) {
    if (e.status === 401) {
      await pantallaEntrar();
      return;
    }
    pintarError(e);
    return;
  }
  await arrancarConSesion();
}

iniciar();
