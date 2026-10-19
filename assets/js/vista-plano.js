// vista-plano.js — el plano con las plantas, su leyenda y el modo edición.

import { MESES, esc, enLinea, markdown, slug } from './md.js';
import {
  estado,
  listaFichas,
  periodosDelMes,
  tareasDelMes,
  colorDe,
  mesActual,
  guardarJardin,
  jardinATexto,
  RUTA_JARDIN,
} from './estado.js';
import { montarPlano } from './plano.js';
import { ICONOS, abrirHoja, cerrarHoja, confirmar, aviso } from './ui.js';
import { ponerGuardia, ponerSalida } from './rutas.js';
import { tareaHTML, chipsPeriodo } from './vista-temporada.js';
import { hojaSinConexion, guardarConConflicto } from './conexion.js';
import * as gh from './github.js';

let edicion = null; // { copia, cambios } mientras se edita
let zoomGuardado = 1;
let resaltado = null;
let plano = null;
let app = null;

const datos = () => (edicion ? edicion.copia : estado.jardin);
const nombreDe = (fichaId) => estado.fichas.get(fichaId)?.nombre || 'Sin ficha';
const comparar = new Intl.Collator('es', { numeric: true, sensitivity: 'base' }).compare;

function plantasOrdenadas(jardin) {
  const orden = new Map(jardin.fichas.map((id, i) => [id, i]));
  return [...jardin.plantas].sort(
    (a, b) => (orden.get(a.ficha) ?? 99) - (orden.get(b.ficha) ?? 99) || comparar(a.etiqueta, b.etiqueta),
  );
}

export function vistaPlano(contenedor, idSeleccion) {
  app = contenedor;
  plano?.destruir();
  const jardin = datos();
  const fichas = listaFichas();
  const plantas = plantasOrdenadas(jardin);

  app.innerHTML = `
  <section class="vista-plano${edicion ? ' en-edicion' : ''}">
    <header class="cab-vista">
      <h1>Plano</h1>
      <div class="herramientas" role="toolbar" aria-label="Controles del plano">
        <button type="button" class="boton-icono" data-accion="girar" title="Girar el plano" aria-label="Girar el plano">${ICONOS.girar}</button>
        <button type="button" class="boton-icono" data-accion="alejar" title="Alejar" aria-label="Alejar">${ICONOS.menos}</button>
        <button type="button" class="boton-icono" data-accion="acercar" title="Acercar" aria-label="Acercar">${ICONOS.mas}</button>
        ${edicion ? '' : `<button type="button" class="boton secundario" data-accion="editar">${ICONOS.lapiz}Editar plano</button>`}
      </div>
    </header>
    ${
      edicion
        ? `<div class="barra-edicion" role="region" aria-label="Edición del plano">
        <p>Arrastra las plantas para moverlas. Tócalas para cambiar sus datos.</p>
        <div class="acciones">
          <button type="button" class="boton secundario" data-accion="anadir">${ICONOS.mas}Añadir planta</button>
          <button type="button" class="boton" data-accion="guardar"${edicion.cambios ? '' : ' disabled'}>Guardar cambios</button>
          <button type="button" class="boton-texto" data-accion="salir">${edicion.cambios ? 'Descartar cambios' : 'Salir sin cambios'}</button>
        </div>
      </div>`
        : ''
    }
    <div class="plano-raiz"></div>
    ${
      fichas.length
        ? `<ul class="leyenda" aria-label="Resaltar un tipo de planta en el plano">${fichas
            .map((f) => {
              const n = jardin.plantas.filter((p) => p.ficha === f.id).length;
              return `<li><button type="button" class="chip-planta" data-resaltar="${esc(f.id)}" aria-pressed="${resaltado === f.id}">
                <span class="muestra" style="--f:${f.color}" aria-hidden="true"></span>${esc(f.nombre)}<span class="cuenta">${n}</span></button></li>`;
            })
            .join('')}</ul>`
        : ''
    }
    <h2 class="titulo-seccion">Plantas en el plano</h2>
    ${
      plantas.length
        ? `<ul class="lista-plantas">${plantas
            .map(
              (p) => `<li><button type="button" class="fila-planta" data-id="${esc(p.id)}">
          <span class="mini-marca" style="--f:${colorDe(p.ficha)}">${esc(p.etiqueta)}</span>
          <span class="fila-texto"><span class="fila-nombre">${esc(nombreDe(p.ficha))}</span>${p.notas ? `<span class="fila-notas">${esc(p.notas)}</span>` : ''}</span>
        </button></li>`,
            )
            .join('')}</ul>`
        : '<p class="vacio">No hay plantas en el plano. Pulsa «Editar plano» y luego «Añadir planta».</p>'
    }
  </section>`;

  plano = montarPlano(app.querySelector('.plano-raiz'), {
    jardin,
    colorDe,
    nombreDe,
    editable: Boolean(edicion),
    zoom: zoomGuardado,
    seleccion: idSeleccion,
    alElegir: elegir,
    alMover: marcarCambio,
    alCambiarZoom: (z) => {
      zoomGuardado = z;
      actualizarZoom();
    },
  });
  if (resaltado) plano.resaltar(resaltado);
  actualizarZoom();
  if (idSeleccion) requestAnimationFrame(() => plano.enfocar(idSeleccion));

  app.querySelector('.vista-plano').addEventListener('click', alPulsar);
  ponerGuardia(() => Boolean(edicion?.cambios));
  ponerSalida(() => {
    edicion = null;
    plano?.destruir();
    plano = null;
  });
  document.title = `Plano · ${estado.jardin.nombre}`;
}

function actualizarZoom() {
  const { min, max } = plano.limitesZoom();
  app.querySelector('[data-accion="alejar"]').disabled = min;
  app.querySelector('[data-accion="acercar"]').disabled = max;
}

function alPulsar(e) {
  const b = e.target.closest('[data-accion], [data-resaltar], .fila-planta');
  if (!b || !app.contains(b)) return;
  if (b.dataset.resaltar !== undefined) {
    resaltado = resaltado === b.dataset.resaltar ? null : b.dataset.resaltar;
    plano.resaltar(resaltado);
    for (const chip of app.querySelectorAll('[data-resaltar]')) chip.setAttribute('aria-pressed', String(chip.dataset.resaltar === resaltado));
    return;
  }
  if (b.classList.contains('fila-planta')) {
    elegir(b.dataset.id);
    return;
  }
  const acciones = {
    girar: () => plano.girar(),
    alejar: () => plano.cambiarZoom(-1),
    acercar: () => plano.cambiarZoom(1),
    editar: empezarEdicion,
    anadir: anadirPlanta,
    guardar: () => guardarEdicion(b),
    salir: salirEdicion,
  };
  acciones[b.dataset.accion]?.();
}

function elegir(id) {
  const p = datos().plantas.find((x) => x.id === id);
  if (!p) return;
  plano.seleccionar(id);
  if (edicion) hojaEditar(p, false);
  else hojaPlanta(p);
}

function hojaPlanta(p) {
  const instancia = plano;
  const f = estado.fichas.get(p.ficha);
  const mes = mesActual();
  const periodos = f ? periodosDelMes(f, mes) : [];
  const tareas = f ? tareasDelMes(f, mes) : [];
  abrirHoja({
    titulo: `<span class="mini-marca" style="--f:${colorDe(p.ficha)}">${esc(p.etiqueta)}</span> ${esc(nombreDe(p.ficha))}`,
    contenido: `
      ${p.notas ? `<p class="notas-planta">${enLinea(p.notas)}</p>` : ''}
      ${
        f
          ? `<div class="hoja-ahora"><span class="hoja-sub">En ${MESES[mes - 1]}</span>${chipsPeriodo(periodos)}</div>
        ${tareas.length ? `<ul class="tareas">${tareas.map((t) => tareaHTML(t, mes)).join('')}</ul>` : ''}
        ${periodos.map((x) => `<div class="prosa">${markdown(x.cuerpo)}</div>`).join('')}
        <div class="acciones"><a class="boton" href="#/ficha/${esc(f.id)}" data-cerrar>Ver la ficha completa</a></div>`
          : '<p>Esta planta no tiene ficha. Usa «Editar plano» para elegir de qué tipo es.</p>'
      }`,
    alCerrar: () => instancia?.seleccionar(null),
  });
}

// ---------- Edición ----------

function empezarEdicion() {
  edicion = { copia: JSON.parse(JSON.stringify(estado.jardin)), cambios: false };
  vistaPlano(app, null);
  if (!gh.puedeEscribir()) aviso('Puedes mover y añadir plantas. Para guardar en GitHub necesitas el token de Ajustes.');
}

function marcarCambio() {
  if (!edicion || edicion.cambios) return;
  edicion.cambios = true;
  const guardar = app.querySelector('[data-accion="guardar"]');
  const salir = app.querySelector('[data-accion="salir"]');
  if (guardar) guardar.disabled = false;
  if (salir) salir.textContent = 'Descartar cambios';
}

async function salirEdicion() {
  if (edicion?.cambios) {
    const si = await confirmar({
      titulo: 'Descartar los cambios del plano',
      texto: 'Se perderán las posiciones y los datos que has cambiado.',
      aceptar: 'Descartar',
      cancelar: 'Seguir editando',
      peligro: true,
    });
    if (!si) return;
  }
  edicion = null;
  vistaPlano(app, null);
}

async function guardarEdicion(boton) {
  if (!edicion) return;
  if (!gh.puedeEscribir()) {
    hojaSinConexion({ ruta: RUTA_JARDIN, texto: jardinATexto(edicion.copia), tipo: 'application/json' });
    return;
  }
  boton.disabled = true;
  boton.textContent = 'Guardando…';
  try {
    const hecho = await guardarConConflicto((op) => guardarJardin(edicion.copia, 'Actualiza el plano del jardín', op), { que: 'El plano' });
    if (!hecho) {
      boton.disabled = false;
      boton.textContent = 'Guardar cambios';
      return;
    }
    edicion = null;
    aviso('Plano guardado en GitHub.');
    vistaPlano(app, null);
  } catch (e) {
    aviso(e.message, 'error');
    boton.disabled = false;
    boton.textContent = 'Guardar cambios';
  }
}

function siguienteEtiqueta(fichaId, plantas) {
  const propias = plantas
    .filter((p) => p.ficha === fichaId)
    .map((p) => p.etiqueta.match(/^(.*?)(\d+)$/))
    .filter(Boolean);
  const prefijo = propias.length
    ? propias[0][1]
    : (nombreDe(fichaId).replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, '').charAt(0) || 'P').toUpperCase();
  const usadas = new Set(plantas.map((p) => p.etiqueta.toLowerCase()));
  const numeros = propias.filter((m) => m[1] === prefijo).map((m) => Number(m[2]));
  let n = numeros.length ? Math.max(...numeros) + 1 : 1;
  while (usadas.has(`${prefijo}${n}`.toLowerCase())) n++;
  return `${prefijo}${n}`;
}

function idUnico(etiqueta, plantas) {
  const base = slug(etiqueta);
  const usados = new Set(plantas.map((p) => p.id));
  let id = base;
  for (let k = 2; usados.has(id); k++) id = `${base}-${k}`;
  return id;
}

function anadirPlanta() {
  const fichas = listaFichas();
  if (!fichas.length) {
    aviso('Primero crea la ficha de ese tipo de planta, en Fichas.', 'error');
    return;
  }
  const [x, y] = plano.centroVisible();
  const ficha = (resaltado && fichas.some((f) => f.id === resaltado) ? resaltado : null) || fichas[0].id;
  hojaEditar({ id: '', etiqueta: siguienteEtiqueta(ficha, datos().plantas), ficha, x, y, notas: '' }, true);
}

function hojaEditar(p, nueva) {
  const instancia = plano;
  const fichas = listaFichas();
  const sinFicha = p.ficha && !estado.fichas.has(p.ficha);
  abrirHoja({
    titulo: nueva ? 'Añadir planta' : `Editar ${esc(p.etiqueta)}`,
    contenido: `<form class="formulario" id="form-planta" novalidate>
      <div class="campo">
        <label for="pl-ficha">Tipo de planta</label>
        <select id="pl-ficha">${fichas
          .map((f) => `<option value="${esc(f.id)}"${f.id === p.ficha ? ' selected' : ''}>${esc(f.nombre)}</option>`)
          .join('')}${sinFicha ? `<option value="${esc(p.ficha)}" selected>${esc(p.ficha)} (sin ficha)</option>` : ''}</select>
      </div>
      <div class="campo">
        <label for="pl-etiqueta">Etiqueta en el plano</label>
        <input id="pl-etiqueta" value="${esc(p.etiqueta)}" maxlength="6" required autocomplete="off" autocapitalize="characters" spellcheck="false" aria-describedby="pl-etiqueta-ayuda">
        <p class="ayuda-campo" id="pl-etiqueta-ayuda">Hasta 6 caracteres, por ejemplo G4.</p>
      </div>
      <div class="campo">
        <label for="pl-notas">Notas</label>
        <textarea id="pl-notas" rows="3" placeholder="Maceta, variedad, fecha de plantación…">${esc(p.notas)}</textarea>
      </div>
      <p class="error-campo" id="pl-error" role="alert" hidden></p>
      <div class="acciones">
        <button class="boton" type="submit">${nueva ? 'Añadir al plano' : 'Aplicar'}</button>
        ${nueva ? '' : '<button class="boton-texto peligro-texto" type="button" data-accion="quitar">Quitar del plano</button>'}
      </div>
    </form>`,
    alMontar: (d) => {
      const form = d.querySelector('#form-planta');
      const campoEtiqueta = form.querySelector('#pl-etiqueta');
      let etiquetaEscrita = !nueva;
      campoEtiqueta.addEventListener('input', () => {
        etiquetaEscrita = true;
      });
      form.querySelector('#pl-ficha').addEventListener('change', (e) => {
        if (!etiquetaEscrita) campoEtiqueta.value = siguienteEtiqueta(e.target.value, datos().plantas);
      });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const etiqueta = campoEtiqueta.value.trim();
        const error = form.querySelector('#pl-error');
        const repetida = datos().plantas.some((x) => x !== p && x.etiqueta.toLowerCase() === etiqueta.toLowerCase());
        if (!etiqueta || repetida) {
          error.textContent = etiqueta ? `Ya hay otra planta con la etiqueta ${etiqueta}.` : 'Escribe una etiqueta.';
          error.hidden = false;
          campoEtiqueta.focus();
          return;
        }
        p.etiqueta = etiqueta;
        p.ficha = form.querySelector('#pl-ficha').value;
        p.notas = form.querySelector('#pl-notas').value.trim();
        if (nueva) {
          p.id = idUnico(etiqueta, datos().plantas);
          datos().plantas.push(p);
        }
        marcarCambio();
        cerrarHoja();
        vistaPlano(app, p.id);
        if (nueva) aviso(`${etiqueta} está en el centro del plano. Arrástrala a su sitio.`);
      });
      form.querySelector('[data-accion="quitar"]')?.addEventListener('click', async () => {
        const si = await confirmar({
          titulo: `Quitar ${p.etiqueta} del plano`,
          texto: 'La ficha de la planta no se borra.',
          aceptar: 'Quitar',
          cancelar: 'Cancelar',
          peligro: true,
        });
        if (!si) return;
        const lista = datos().plantas;
        lista.splice(lista.indexOf(p), 1);
        marcarCambio();
        cerrarHoja();
        vistaPlano(app, null);
      });
    },
    alCerrar: () => instancia?.seleccionar(null),
  });
}
