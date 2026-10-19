// vista-fichas.js — lista de fichas, ficha completa, editor y ficha nueva.

import { esc, markdown, slug } from './md.js';
import {
  estado,
  listaFichas,
  plantasDe,
  periodosDelMes,
  mesActual,
  rutaFicha,
  guardarFicha,
  prepararFicha,
} from './estado.js';
import { lineaTemporal, leyendaCategorias } from './linea.js';
import { ICONOS, $, aviso, confirmar, leerLocal, guardarLocal, fechaCorta } from './ui.js';
import { ponerGuardia } from './rutas.js';
import { hojaSinConexion, guardarConConflicto } from './conexion.js';
import * as gh from './github.js';

const COLORES_NUEVOS = ['#9a6a12', '#2c5f8a', '#8a4f2c', '#5f7420', '#a33f73', '#6b4fa0', '#1f6f78'];

// ---------- Lista ----------

export function vistaFichas(app) {
  const mes = mesActual();
  const fichas = listaFichas();
  app.innerHTML = `
  <section class="vista-fichas">
    <header class="cab-vista">
      <h1>Fichas</h1>
      <div class="herramientas"><a class="boton secundario" href="#/nueva">${ICONOS.mas}Nueva ficha</a></div>
    </header>
    <p class="entradilla">Una ficha por tipo de planta, con lo que pasa y lo que hay que hacer en cada época del año.</p>
    ${
      fichas.length
        ? `<ul class="lista-fichas">${fichas
            .map((f) => {
              const plantas = plantasDe(f.id);
              const ahora = periodosDelMes(f, mes)[0];
              return `<li><a class="tarjeta-ficha" href="#/ficha/${esc(f.id)}">
            <span class="ficha-muestra" style="--f:${f.color}" aria-hidden="true"></span>
            <span class="tf-texto">
              <span class="tf-nombre">${esc(f.nombre)}</span>
              ${f.cientifico ? `<span class="cientifico">${esc(f.cientifico)}</span>` : ''}
              <span class="tf-meta">${
                plantas.length ? `En el jardín: ${plantas.map((p) => esc(p.etiqueta)).join(', ')}` : 'Ninguna en el plano'
              }</span>
            </span>
            ${ahora ? `<span class="chip-est est-${ahora.estacion || 'otra'}">${esc(ahora.nombre)}</span>` : ''}
          </a></li>`;
            })
            .join('')}</ul>`
        : '<div class="vacio-grande"><p>Todavía no hay fichas.</p><a class="boton" href="#/nueva">Crear la primera ficha</a></div>'
    }
  </section>`;
  document.title = `Fichas · ${estado.jardin.nombre}`;
}

// ---------- Ficha completa ----------

export function htmlFicha(f, { vistaPrevia = false } = {}) {
  const mes = mesActual();
  const plantas = plantasDe(f.id);
  const secciones = f.secciones.filter((s) => s.tipo !== 'calendario');
  const esAhora = (s) => s.tipo === 'periodo' && s.meses.includes(mes);
  const urlGitHub = vistaPrevia ? null : gh.urlVer(rutaFicha(f.id));
  const hayFases = f.secciones.some((s) => s.tipo === 'periodo');

  return `<article class="ficha">
    ${vistaPrevia ? '' : `<nav class="migas" aria-label="Volver"><a href="#/fichas">${ICONOS.izquierda}Fichas</a></nav>`}
    <header class="ficha-cab">
      <span class="ficha-muestra grande" style="--f:${f.color}" aria-hidden="true"></span>
      <div class="ficha-nombres">
        <h1>${esc(f.nombre)}</h1>
        ${f.cientifico ? `<p class="cientifico">${esc(f.cientifico)}</p>` : ''}
      </div>
    </header>
    ${f.error ? `<p class="error-caja">${esc(f.error)}</p>` : ''}
    ${
      vistaPrevia
        ? ''
        : `<div class="acciones ficha-acciones">
        <a class="boton" href="#/editar/${esc(f.id)}">${ICONOS.lapiz}Editar ficha</a>
        ${urlGitHub ? `<a class="boton secundario" href="${esc(urlGitHub)}" target="_blank" rel="noopener">${ICONOS.github}Ver en GitHub</a>` : ''}
      </div>`
    }
    <p class="ejemplares">${
      plantas.length
        ? `<span class="ejemplares-etq">En el jardín</span> ${plantas
            .map((p) => `<a class="mini-marca" style="--f:${f.color}" href="#/plano/${esc(p.id)}" aria-label="Ver ${esc(p.etiqueta)} en el plano">${esc(p.etiqueta)}</a>`)
            .join('')}`
        : '<span class="ejemplares-etq">Todavía no hay ninguna en el plano.</span>'
    }</p>
    ${f.intro ? `<div class="prosa intro">${markdown(f.intro)}</div>` : ''}
    <section class="panel ciclo" aria-labelledby="t-ciclo-${esc(f.id)}">
      <h2 id="t-ciclo-${esc(f.id)}">Ciclo anual</h2>
      ${f.calendario.length ? leyendaCategorias([f]) : ''}
      ${lineaTemporal({ fichas: [f], mes, tareas: true, enlazar: false, etiquetaFases: 'Épocas del año' })}
      ${
        hayFases
          ? ''
          : '<p class="vacio">Para ver aquí las épocas del año, pon los meses entre paréntesis en los títulos, por ejemplo «## Otoño (sep–nov)».</p>'
      }
    </section>
    ${
      secciones.length > 1
        ? `<nav class="indice" aria-label="Secciones de la ficha">${secciones
            .map((s) => `<button type="button" class="chip-indice${esAhora(s) ? ' ahora' : ''}" data-ir="${esc(s.ancla)}">${esc(s.nombre)}</button>`)
            .join('')}</nav>`
        : ''
    }
    ${secciones
      .map(
        (s) => `<section class="ficha-seccion${esAhora(s) ? ' ahora' : ''}" id="${esc(s.ancla)}">
        <h2>${esc(s.titulo)}${esAhora(s) ? ' <span class="insignia">Ahora</span>' : ''}</h2>
        <div class="prosa">${markdown(s.cuerpo)}</div>
      </section>`,
      )
      .join('')}
  </article>`;
}

function conectarIndice(raiz) {
  raiz.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ir]');
    if (!b) return;
    const destino = raiz.querySelector(`#${CSS.escape(b.dataset.ir)}`);
    if (!destino) return;
    destino.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    destino.setAttribute('tabindex', '-1');
    destino.focus({ preventScroll: true });
  });
}

export function vistaFicha(app, id) {
  const f = estado.fichas.get(id);
  if (!f || !estado.jardin.fichas.includes(id)) {
    app.innerHTML = `<section class="vacio-grande"><h1>No existe esa ficha</h1>
      <p>No hay ninguna ficha llamada «${esc(id)}».</p><a class="boton" href="#/fichas">Ver todas las fichas</a></section>`;
    return;
  }
  app.innerHTML = htmlFicha(f);
  conectarIndice(app.querySelector('.ficha'));
  document.title = `${f.nombre} · ${estado.jardin.nombre}`;
}

// ---------- Editor ----------

const AYUDA = `
  <ul>
    <li>La cabecera entre las dos líneas <code>---</code> guarda el nombre, el nombre científico y el <strong>color</strong> de la planta en el plano.</li>
    <li>Cada época es un título con los meses entre paréntesis: <code>## Otoño (sep–nov)</code>. Esos meses deciden cuándo sale el texto en Temporada.</li>
    <li>La sección <code>## Calendario</code> es una lista de tareas, una por línea: <code>- oct–nov: Cosecha de granadas</code>. Cada una es una barra del ciclo anual.</li>
    <li>El color de la tarea sale de su primera palabra (Cosecha, Poda, Riego, Abonado, Heladas, Pulgón, Floración, Brotación, Plantar…). Para elegirlo tú, termina la línea con <code>#poda</code>, <code>#riego</code>, <code>#cosecha</code>, <code>#abono</code>, <code>#proteccion</code>, <code>#plagas</code>, <code>#flor</code>, <code>#hoja</code> o <code>#plantar</code>.</li>
    <li>Los títulos sin meses, como <code>## Problemas típicos</code>, salen solo en la ficha.</li>
    <li>Formato: <code>**negrita**</code>, <code>*cursiva*</code>, listas empezando por <code>- </code> y enlaces <code>[texto](https://…)</code>.</li>
  </ul>`;

export function vistaEditor(app, id) {
  const ruta = rutaFicha(id);
  const nueva = !estado.jardin.fichas.includes(id);
  if (nueva && !estado.borradoresNuevos.has(id)) {
    location.replace('#/nueva');
    return;
  }
  const existente = estado.fichas.get(id);
  if (!nueva && existente?.error) {
    // Sin el texto original no se edita, para no sobrescribir la ficha con un documento vacío.
    app.innerHTML = `<section class="vacio-grande"><h1>No se ha podido abrir la ficha</h1>
      <p>${esc(existente.error)} Vuelve a cargar los datos desde Ajustes y prueba otra vez.</p>
      <a class="boton" href="#/ajustes">Ir a Ajustes</a></section>`;
    return;
  }
  const original = nueva ? estado.borradoresNuevos.get(id) : estado.textos.get(ruta) ?? existente?.texto ?? '';
  const claveBorrador = `jardin:borrador:${ruta}`;
  const borrador = leerLocal(claveBorrador);
  const volver = nueva ? '#/fichas' : `#/ficha/${id}`;
  const conGitHub = gh.puedeEscribir();

  app.innerHTML = `
  <section class="editor">
    <nav class="migas" aria-label="Volver"><a href="${volver}">${ICONOS.izquierda}${nueva ? 'Fichas' : esc(existente?.nombre || id)}</a></nav>
    <header class="cab-vista">
      <div><h1>${nueva ? 'Nueva ficha' : 'Editar ficha'}</h1><p class="ruta-archivo">${esc(ruta)}</p></div>
    </header>
    ${
      borrador && borrador.texto !== original
        ? `<div class="aviso-borrador" role="status">
        <p>Tienes un borrador sin guardar del ${esc(fechaCorta(borrador.fecha))}.</p>
        <div class="acciones"><button type="button" class="boton secundario" data-accion="recuperar">Recuperar el borrador</button>
        <button type="button" class="boton-texto" data-accion="tirar">Descartarlo</button></div>
      </div>`
        : ''
    }
    <div class="pestanas-editor" role="tablist" aria-label="Modo del editor">
      <button type="button" role="tab" id="tab-escribir" aria-controls="panel-escribir" aria-selected="true">Escribir</button>
      <button type="button" role="tab" id="tab-vista" aria-controls="panel-vista" aria-selected="false" tabindex="-1">Vista previa</button>
    </div>
    <div id="panel-escribir" role="tabpanel" aria-labelledby="tab-escribir">
      <textarea id="texto-ficha" class="area-texto" spellcheck="true" lang="es" autocapitalize="sentences" aria-label="Texto de la ficha en Markdown">${esc(original)}</textarea>
    </div>
    <div id="panel-vista" class="vista-previa" role="tabpanel" aria-labelledby="tab-vista" hidden></div>
    <details class="ayuda"><summary>Cómo se escribe una ficha</summary>${AYUDA}</details>
    <div class="barra-guardar">
      <button type="button" class="boton" data-accion="guardar">${conGitHub ? 'Guardar en GitHub' : 'Guardar…'}</button>
      <button type="button" class="boton secundario" data-accion="cancelar">Cancelar</button>
      ${conGitHub ? '' : '<p class="nota">Sin token de GitHub: al guardar podrás copiar el texto o descargar el archivo.</p>'}
    </div>
  </section>`;

  const area = $('#texto-ficha', app);
  const panelEscribir = $('#panel-escribir', app);
  const panelVista = $('#panel-vista', app);
  const pestanas = [$('#tab-escribir', app), $('#tab-vista', app)];
  let temporizador = null;

  ponerGuardia(() => area.value !== original);

  area.addEventListener('input', () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => {
      guardarLocal(claveBorrador, area.value === original ? null : { texto: area.value, fecha: Date.now() });
    }, 600);
  });

  function mostrar(vista) {
    const previa = vista === 'vista';
    pestanas.forEach((t) => {
      const activa = (t.id === 'tab-vista') === previa;
      t.setAttribute('aria-selected', String(activa));
      t.tabIndex = activa ? 0 : -1;
    });
    panelEscribir.hidden = previa;
    panelVista.hidden = !previa;
    if (previa) {
      const f = prepararFicha(id, area.value, Math.max(0, estado.jardin.fichas.indexOf(id)));
      panelVista.innerHTML = htmlFicha(f, { vistaPrevia: true });
      conectarIndice(panelVista);
    }
  }

  pestanas.forEach((t) => {
    t.addEventListener('click', () => mostrar(t.id === 'tab-vista' ? 'vista' : 'escribir'));
    t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const otra = pestanas.find((x) => x !== t);
      otra.focus();
      mostrar(otra.id === 'tab-vista' ? 'vista' : 'escribir');
    });
  });

  app.querySelector('.editor').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-accion]');
    if (!b) return;
    const accion = b.dataset.accion;
    if (accion === 'recuperar') {
      area.value = borrador.texto;
      b.closest('.aviso-borrador').remove();
      aviso('Borrador recuperado. Revísalo y guárdalo.');
    } else if (accion === 'tirar') {
      guardarLocal(claveBorrador, null);
      b.closest('.aviso-borrador').remove();
    } else if (accion === 'cancelar') {
      if (area.value !== original) {
        const si = await confirmar({
          titulo: 'Descartar los cambios',
          texto: 'Se perderá lo que has escrito desde que abriste el editor.',
          aceptar: 'Descartar',
          cancelar: 'Seguir editando',
          peligro: true,
        });
        if (!si) return;
      }
      guardarLocal(claveBorrador, null);
      ponerGuardia(null);
      if (nueva) estado.borradoresNuevos.delete(id);
      location.hash = volver;
    } else if (accion === 'guardar') {
      await guardar(b);
    }
  });

  async function guardar(boton) {
    const texto = area.value.endsWith('\n') ? area.value : `${area.value}\n`;
    if (!texto.trim()) {
      aviso('La ficha está vacía.', 'error');
      return;
    }
    if (!gh.puedeEscribir()) {
      hojaSinConexion({ ruta, texto });
      return;
    }
    const etiqueta = boton.textContent;
    boton.disabled = true;
    boton.textContent = 'Guardando…';
    try {
      const hecho = await guardarConConflicto((op) => guardarFicha(id, texto, op), { que: 'La ficha' });
      if (!hecho) return;
      guardarLocal(claveBorrador, null);
      ponerGuardia(null);
      aviso('Ficha guardada en GitHub.');
      location.hash = `#/ficha/${id}`;
    } catch (e) {
      aviso(e.message, 'error');
    } finally {
      boton.disabled = false;
      boton.textContent = etiqueta;
    }
  }

  document.title = `${nueva ? 'Nueva ficha' : `Editar ${existente?.nombre || id}`} · ${estado.jardin.nombre}`;
}

// ---------- Ficha nueva ----------

function plantilla({ nombre, cientifico, color }) {
  return `---
nombre: ${nombre}
${cientifico ? `cientifico: ${cientifico}\n` : ''}color: "${color}"
---

# ${nombre}

Una descripción breve: cómo es, dónde está en el jardín y qué la hace especial.

## Calendario

- mar–abr: Abonado
- jun–ago: Riego regular

## Primavera (mar–may)

## Verano (jun–ago)

## Otoño (sep–nov)

## Invierno (dic–feb)
`;
}

export function vistaNueva(app) {
  const color = COLORES_NUEVOS[estado.jardin.fichas.length % COLORES_NUEVOS.length];
  app.innerHTML = `
  <section class="nueva">
    <nav class="migas" aria-label="Volver"><a href="#/fichas">${ICONOS.izquierda}Fichas</a></nav>
    <header class="cab-vista"><h1>Nueva ficha</h1></header>
    <form class="formulario estrecho" id="form-nueva" novalidate>
      <div class="campo">
        <label for="nf-nombre">Nombre de la planta</label>
        <input id="nf-nombre" required autocomplete="off" placeholder="Por ejemplo, Lavanda" aria-describedby="nf-archivo">
        <p class="ayuda-campo" id="nf-archivo">Se guardará como <code>fichas/…md</code>.</p>
      </div>
      <div class="campo">
        <label for="nf-cientifico">Nombre científico <span class="opcional">(opcional)</span></label>
        <input id="nf-cientifico" autocomplete="off" placeholder="Lavandula angustifolia">
      </div>
      <div class="campo campo-color">
        <label for="nf-color">Color en el plano</label>
        <input id="nf-color" type="color" value="${color}">
      </div>
      <p class="error-campo" id="nf-error" role="alert" hidden></p>
      <div class="acciones"><button class="boton" type="submit">Crear y empezar a escribir</button></div>
    </form>
  </section>`;

  const form = $('#form-nueva', app);
  const nombre = $('#nf-nombre', app);
  const archivo = $('#nf-archivo', app);
  const idDe = (texto) => slug(texto).slice(0, 40);
  nombre.addEventListener('input', () => {
    archivo.innerHTML = `Se guardará como <code>fichas/${esc(nombre.value.trim() ? idDe(nombre.value) : '…')}.md</code>.`;
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const n = nombre.value.trim();
    const error = $('#nf-error', app);
    const id = idDe(n);
    if (!n) {
      error.textContent = 'Escribe el nombre de la planta.';
    } else if (estado.jardin.fichas.includes(id)) {
      error.innerHTML = `Ya hay una ficha con ese nombre: <a href="#/ficha/${esc(id)}">${esc(estado.fichas.get(id)?.nombre || id)}</a>.`;
    } else {
      estado.borradoresNuevos.set(id, plantilla({ nombre: n, cientifico: $('#nf-cientifico', app).value.trim(), color: $('#nf-color', app).value }));
      location.hash = `#/editar/${id}`;
      return;
    }
    error.hidden = false;
    nombre.focus();
  });
  document.title = `Nueva ficha · ${estado.jardin.nombre}`;
}
