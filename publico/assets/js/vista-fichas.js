// vista-fichas.js — catálogo de fichas, ficha completa (base + notas propias),
// editor de notas, editor de la ficha base (admin) y ficha nueva (admin).

import { esc, markdown } from './md.js';
import {
  estado,
  esAdmin,
  listaFichas,
  listaCatalogo,
  enMiJardin,
  plantasDe,
  periodosDelMes,
  mesActual,
  prepararFicha,
  guardarNotas,
  guardarFichaBase,
  ponerEnMiJardin,
  marcarVista,
  tieneNovedad,
  idDeNombre,
} from './estado.js';
import { lineaTemporal, leyendaCategorias } from './linea.js';
import { ICONOS, $, aviso, confirmar, leerLocal, guardarLocal, fechaCorta, fechaLarga, guardarConConflicto } from './ui.js';
import { ponerGuardia } from './rutas.js';

const COLORES_NUEVOS = ['#9a6a12', '#2c5f8a', '#8a4f2c', '#5f7420', '#a33f73', '#6b4fa0', '#1f6f78'];

// ---------- Lista ----------

function tarjeta(f, mes) {
  const plantas = plantasDe(f.id);
  const ahora = periodosDelMes(f, mes)[0];
  const propio = enMiJardin(f.id);
  const marcas = [
    tieneNovedad(f) ? '<span class="insignia novedad">Actualizada</span>' : '',
    f.notas.texto.trim() ? `<span class="insignia tuya">${ICONOS.nota}Con tus notas</span>` : '',
  ].join('');
  return `<li class="tarjeta-ficha-envoltorio"><a class="tarjeta-ficha" href="#/ficha/${esc(f.id)}">
    <span class="ficha-muestra" style="--f:${f.color}" aria-hidden="true"></span>
    <span class="tf-texto">
      <span class="tf-nombre">${esc(f.nombre)}</span>
      ${f.cientifico ? `<span class="cientifico">${esc(f.cientifico)}</span>` : ''}
      ${
        propio
          ? `<span class="tf-meta">${plantas.length ? `En el plano: ${plantas.map((p) => esc(p.etiqueta)).join(', ')}` : 'En tu jardín, sin plantas en el plano'}</span>`
          : ''
      }
      ${marcas ? `<span class="tf-marcas">${marcas}</span>` : ''}
    </span>
    ${propio && ahora ? `<span class="chip-est est-${ahora.estacion || 'otra'}">${esc(ahora.nombre)}</span>` : ''}
  </a>
  ${propio ? '' : `<button type="button" class="boton secundario tf-anadir" data-anadir="${esc(f.id)}">${ICONOS.mas}Añadir a mi jardín</button>`}
  </li>`;
}

export function vistaFichas(app) {
  const mes = mesActual();
  const mias = listaFichas();
  const resto = listaCatalogo().filter((f) => !enMiJardin(f.id));
  app.innerHTML = `
  <section class="vista-fichas">
    <header class="cab-vista">
      <h1>Fichas</h1>
      ${esAdmin() ? `<div class="herramientas"><a class="boton secundario" href="#/admin/nueva">${ICONOS.mas}Nueva ficha del catálogo</a></div>` : ''}
    </header>
    <p class="entradilla">Una ficha por tipo de planta, con lo que pasa y lo que hay que hacer en cada época del año. Las fichas vienen del catálogo común y se actualizan solas; en cada una puedes añadir tus propias notas.</p>
    <h2 class="titulo-seccion primero">En tu jardín</h2>
    ${
      mias.length
        ? `<ul class="lista-fichas">${mias.map((f) => tarjeta(f, mes)).join('')}</ul>`
        : '<p class="vacio">Todavía no tienes ninguna. Añade abajo las plantas que tienes en tu jardín.</p>'
    }
    ${
      resto.length
        ? `<h2 class="titulo-seccion">Más fichas del catálogo</h2><ul class="lista-fichas">${resto.map((f) => tarjeta(f, mes)).join('')}</ul>`
        : estado.fichas.size
          ? ''
          : `<div class="vacio-grande"><p>El catálogo está vacío.</p>${esAdmin() ? '<a class="boton" href="#/admin/nueva">Crear la primera ficha</a>' : '<p>Cuando la administración añada fichas, aparecerán aquí.</p>'}</div>`
    }
  </section>`;

  app.querySelector('.vista-fichas').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-anadir]');
    if (!b) return;
    b.disabled = true;
    try {
      await ponerEnMiJardin(b.dataset.anadir, true);
      aviso(`${estado.fichas.get(b.dataset.anadir).nombre} está ahora en tu jardín.`);
      vistaFichas(app);
    } catch (err) {
      aviso(err.message, 'error');
      b.disabled = false;
    }
  });
  document.title = `Fichas · ${estado.jardin.nombre}`;
}

// ---------- Ficha completa ----------

const insigniaTuya = `<span class="insignia tuya">${ICONOS.nota}Tu nota</span>`;

// vistaPrevia: sin acciones ni enlaces (para el editor). soloBase: sin las notas del usuario.
export function htmlFicha(f, { vistaPrevia = false, soloBase = false } = {}) {
  const mes = mesActual();
  const fuente = soloBase ? { ...f.base, notas: { intro: '', secciones: [], calendario: [], texto: '' } } : f;
  const plantas = plantasDe(f.id);
  const secciones = fuente.secciones.filter((s) => s.tipo !== 'calendario');
  const esAhora = (s) => s.tipo === 'periodo' && s.meses.includes(mes);
  const hayFases = fuente.secciones.some((s) => s.tipo === 'periodo');
  const propio = enMiJardin(f.id);
  const notasIntro = fuente.notas.intro;
  const tieneNotas = Boolean(fuente.notas.texto.trim());

  return `<article class="ficha">
    ${vistaPrevia ? '' : `<nav class="migas" aria-label="Volver"><a href="#/fichas">${ICONOS.izquierda}Fichas</a></nav>`}
    <header class="ficha-cab">
      <span class="ficha-muestra grande" style="--f:${f.color}" aria-hidden="true"></span>
      <div class="ficha-nombres">
        <h1>${esc(f.nombre)}</h1>
        ${f.cientifico ? `<p class="cientifico">${esc(f.cientifico)}</p>` : ''}
      </div>
    </header>
    ${
      !vistaPrevia && tieneNovedad(f)
        ? `<div class="aviso-novedad" role="status"><p><strong>Ficha actualizada el ${esc(fechaLarga(f.actualizada))}.</strong> El catálogo común ha cambiado desde la última vez que la abriste. Tus notas siguen igual.</p></div>`
        : ''
    }
    ${
      vistaPrevia
        ? ''
        : `<div class="acciones ficha-acciones">
        <a class="boton" href="#/notas/${esc(f.id)}">${ICONOS.nota}${tieneNotas ? 'Editar mis notas' : 'Añadir mis notas'}</a>
        ${
          propio
            ? plantas.length
              ? ''
              : `<button type="button" class="boton secundario" data-accion="quitar">Quitar de mi jardín</button>`
            : `<button type="button" class="boton secundario" data-accion="anadir">${ICONOS.mas}Añadir a mi jardín</button>`
        }
        ${esAdmin() ? `<a class="boton secundario" href="#/admin/ficha/${esc(f.id)}">${ICONOS.lapiz}Editar ficha base</a>` : ''}
      </div>`
    }
    ${
      vistaPrevia
        ? ''
        : `<p class="ejemplares">${
            plantas.length
              ? `<span class="ejemplares-etq">En tu plano</span> ${plantas
                  .map((p) => `<a class="mini-marca" style="--f:${f.color}" href="#/plano/${esc(p.id)}" aria-label="Ver ${esc(p.etiqueta)} en el plano">${esc(p.etiqueta)}</a>`)
                  .join('')}`
              : `<span class="ejemplares-etq">${propio ? 'Todavía no hay ninguna en tu plano.' : 'No está en tu jardín.'}</span>`
          }</p>`
    }
    ${fuente.intro ? `<div class="prosa intro">${markdown(fuente.intro)}</div>` : ''}
    ${
      notasIntro
        ? `<section class="notas-propias" aria-labelledby="t-notas-${esc(f.id)}">
        <h2 id="t-notas-${esc(f.id)}">${ICONOS.nota}Tus notas</h2>
        <div class="prosa">${markdown(notasIntro)}</div>
      </section>`
        : ''
    }
    <section class="panel ciclo" aria-labelledby="t-ciclo-${esc(f.id)}">
      <h2 id="t-ciclo-${esc(f.id)}">Ciclo anual</h2>
      ${fuente.calendario.length ? leyendaCategorias([fuente]) : ''}
      ${lineaTemporal({ fichas: [{ ...f, secciones: fuente.secciones, calendario: fuente.calendario }], mes, tareas: true, enlazar: false, etiquetaFases: 'Épocas del año' })}
      ${
        hayFases
          ? ''
          : '<p class="vacio">Para ver aquí las épocas del año, pon los meses entre paréntesis en los títulos, por ejemplo «## Otoño (sep–nov)».</p>'
      }
    </section>
    ${
      secciones.length > 1
        ? `<nav class="indice" aria-label="Secciones de la ficha">${secciones
            .map((s) => `<button type="button" class="chip-indice${esAhora(s) ? ' ahora' : ''}${s.propia ? ' propia' : ''}" data-ir="${esc(s.ancla)}">${esc(s.nombre)}</button>`)
            .join('')}</nav>`
        : ''
    }
    ${secciones
      .map(
        (s) => `<section class="ficha-seccion${esAhora(s) ? ' ahora' : ''}${s.propia ? ' propia' : ''}" id="${esc(s.ancla)}">
        <h2>${esc(s.titulo)}${esAhora(s) ? ' <span class="insignia">Ahora</span>' : ''}${s.propia ? ` ${insigniaTuya}` : ''}</h2>
        <div class="prosa">${markdown(s.cuerpo)}</div>
      </section>`,
      )
      .join('')}
    ${
      !vistaPrevia && f.version
        ? `<p class="pie-ficha">Ficha del catálogo, versión ${f.version}, actualizada el ${esc(fechaLarga(f.actualizada))}.${
            f.notas.actualizada ? ` Tus notas, el ${esc(fechaLarga(f.notas.actualizada))}.` : ''
          }</p>`
        : ''
    }
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

function noExiste(app, id) {
  app.innerHTML = `<section class="vacio-grande"><h1>No existe esa ficha</h1>
    <p>No hay ninguna ficha llamada «${esc(id)}» en el catálogo.</p><a class="boton" href="#/fichas">Ver todas las fichas</a></section>`;
}

export function vistaFicha(app, id) {
  const f = estado.fichas.get(id);
  if (!f) {
    noExiste(app, id);
    return;
  }
  app.innerHTML = htmlFicha(f);
  const raiz = app.querySelector('.ficha');
  conectarIndice(raiz);
  raiz.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-accion]');
    if (!b) return;
    const si = b.dataset.accion === 'anadir';
    b.disabled = true;
    try {
      await ponerEnMiJardin(id, si);
      aviso(si ? `${f.nombre} está ahora en tu jardín.` : `${f.nombre} ya no está en tu jardín. La ficha y tus notas se conservan.`);
      vistaFicha(app, id);
    } catch (err) {
      aviso(err.message, 'error');
      b.disabled = false;
    }
  });
  marcarVista(id);
  document.title = `${f.nombre} · ${estado.jardin.nombre}`;
}

// ---------- Editores ----------

const AYUDA_FORMATO = `
    <li>Cada época es un título con los meses entre paréntesis: <code>## Otoño (sep–nov)</code>. Esos meses deciden cuándo sale el texto en Temporada.</li>
    <li>La sección <code>## Calendario</code> es una lista de tareas, una por línea: <code>- oct–nov: Cosecha de granadas</code>. Cada una es una barra del ciclo anual.</li>
    <li>El color de la tarea sale de su primera palabra (Cosecha, Poda, Riego, Abonado, Heladas, Pulgón, Floración, Brotación, Plantar…). Para elegirlo tú, termina la línea con <code>#poda</code>, <code>#riego</code>, <code>#cosecha</code>, <code>#abono</code>, <code>#proteccion</code>, <code>#plagas</code>, <code>#flor</code>, <code>#hoja</code> o <code>#plantar</code>.</li>
    <li>Los títulos sin meses, como <code>## Problemas típicos</code>, salen solo en la ficha.</li>
    <li>Formato: <code>**negrita**</code>, <code>*cursiva*</code>, listas empezando por <code>- </code> y enlaces <code>[texto](https://…)</code>.</li>`;

const AYUDA_BASE = `<ul>
    <li>La cabecera entre las dos líneas <code>---</code> guarda el nombre, el nombre científico y el <strong>color</strong> de la planta en el plano.</li>
    ${AYUDA_FORMATO}
    <li>Al guardar, todos los usuarios ven la ficha nueva. Sus notas no se tocan.</li>
  </ul>`;

const AYUDA_NOTAS = `<ul>
    <li>Tus notas solo las ves tú y se muestran junto a la ficha del catálogo. Si la ficha del catálogo se actualiza, tus notas se quedan como están.</li>
    <li>Lo que escribas al principio, sin título, sale en el recuadro «Tus notas».</li>
    ${AYUDA_FORMATO}
    <li>Tus tareas y épocas se suman a las de la ficha y salen también en Temporada, marcadas como tuyas.</li>
    <li>Para borrar tus notas, deja el texto vacío y guarda.</li>
  </ul>`;

const EJEMPLO_NOTAS = `Lo que quieras apuntar de esta planta en tu jardín.

## Calendario

- mar: Abonar con humus de lombriz

## Verano (jun–ago)

En mi terraza le da el sol de la tarde: regar a diario.`;

// modo: 'notas' (cualquier usuario) o 'base' (admin, ficha del catálogo)
export function vistaEditor(app, id, modo) {
  const base = modo === 'base';
  if (base && !esAdmin()) {
    location.replace(`#/ficha/${id}`);
    return;
  }
  const existente = estado.fichas.get(id);
  const nueva = base && !existente;
  if (nueva && !estado.borradoresNuevos.has(id)) {
    location.replace('#/admin/nueva');
    return;
  }
  if (!base && !existente) {
    noExiste(app, id);
    return;
  }
  const original = nueva ? estado.borradoresNuevos.get(id) : base ? estado.catalogo.get(id).texto : existente.notas.texto;
  const claveBorrador = `jardin:borrador:${estado.yo.id}:${modo}:${id}`;
  const borrador = leerLocal(claveBorrador);
  const volver = nueva ? '#/admin' : `#/ficha/${id}`;
  const nombre = existente?.nombre || id;
  const titulo = nueva ? 'Nueva ficha del catálogo' : base ? `Ficha base: ${nombre}` : `Mis notas: ${nombre}`;

  app.innerHTML = `
  <section class="editor">
    <nav class="migas" aria-label="Volver"><a href="${volver}">${ICONOS.izquierda}${nueva ? 'Administración' : esc(nombre)}</a></nav>
    <header class="cab-vista">
      <div><h1>${esc(titulo)}</h1>
      <p class="ruta-archivo">${
        base
          ? `Catálogo común · ${esc(id)}${existente ? ` · versión ${existente.version}` : ''}`
          : 'Solo las ves tú. Se suman a la ficha del catálogo.'
      }</p></div>
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
      <textarea id="texto-ficha" class="area-texto${base ? '' : ' corta'}" spellcheck="true" lang="es" autocapitalize="sentences"
        aria-label="${base ? 'Texto de la ficha en Markdown' : 'Tus notas en Markdown'}"${base ? '' : ` placeholder="${esc(EJEMPLO_NOTAS)}"`}>${esc(original)}</textarea>
    </div>
    <div id="panel-vista" class="vista-previa" role="tabpanel" aria-labelledby="tab-vista" hidden></div>
    <details class="ayuda"${base ? '' : ' open'}><summary>${base ? 'Cómo se escribe una ficha' : 'Cómo funcionan tus notas'}</summary>${base ? AYUDA_BASE : AYUDA_NOTAS}</details>
    <div class="barra-guardar">
      <button type="button" class="boton" data-accion="guardar">${base ? 'Publicar en el catálogo' : 'Guardar mis notas'}</button>
      <button type="button" class="boton secundario" data-accion="cancelar">Cancelar</button>
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

  function fichaPrevia() {
    const posicion = Math.max(0, [...estado.catalogo.keys()].indexOf(id));
    if (base) return prepararFicha(id, area.value, posicion, { notas: existente?.notas.texto || '' });
    return prepararFicha(id, estado.catalogo.get(id).texto, posicion, { notas: area.value });
  }

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
      panelVista.innerHTML = htmlFicha(fichaPrevia(), { vistaPrevia: true, soloBase: base });
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
    let texto = area.value.replace(/\s+$/, '');
    if (texto) texto += '\n';
    if (base && !texto) {
      aviso('La ficha está vacía.', 'error');
      return;
    }
    const etiqueta = boton.textContent;
    boton.disabled = true;
    boton.textContent = 'Guardando…';
    try {
      const hecho = base
        ? await guardarConConflicto((op) => guardarFichaBase(id, texto, op), {
            que: 'La ficha',
            detalle: 'Otra persona de administración la ha cambiado desde que la abriste.',
          })
        : await guardarConConflicto((op) => guardarNotas(id, texto, op), {
            que: 'Tus notas',
            detalle: 'Las has cambiado desde otro dispositivo.',
          });
      if (!hecho) return;
      guardarLocal(claveBorrador, null);
      ponerGuardia(null);
      aviso(base ? 'Ficha publicada en el catálogo.' : texto ? 'Notas guardadas.' : 'Notas borradas.');
      location.hash = `#/ficha/${id}`;
    } catch (e) {
      aviso(e.message, 'error');
    } finally {
      boton.disabled = false;
      boton.textContent = etiqueta;
    }
  }

  document.title = `${titulo} · ${estado.jardin.nombre}`;
}

// ---------- Ficha nueva (admin) ----------

function plantilla({ nombre, cientifico, color }) {
  return `---
nombre: ${nombre}
${cientifico ? `cientifico: ${cientifico}\n` : ''}color: "${color}"
---

# ${nombre}

Una descripción breve: cómo es, qué necesita y qué la hace especial.

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
  if (!esAdmin()) {
    location.replace('#/fichas');
    return;
  }
  const color = COLORES_NUEVOS[estado.fichas.size % COLORES_NUEVOS.length];
  app.innerHTML = `
  <section class="nueva">
    <nav class="migas" aria-label="Volver"><a href="#/admin">${ICONOS.izquierda}Administración</a></nav>
    <header class="cab-vista"><h1>Nueva ficha del catálogo</h1></header>
    <form class="formulario estrecho" id="form-nueva" novalidate>
      <div class="campo">
        <label for="nf-nombre">Nombre de la planta</label>
        <input id="nf-nombre" required autocomplete="off" placeholder="Por ejemplo, Lavanda" aria-describedby="nf-archivo">
        <p class="ayuda-campo" id="nf-archivo">Identificador: …</p>
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
  nombre.addEventListener('input', () => {
    archivo.innerHTML = `Identificador: <code>${esc(nombre.value.trim() ? idDeNombre(nombre.value) : '…')}</code>`;
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const n = nombre.value.trim();
    const error = $('#nf-error', app);
    const id = idDeNombre(n);
    if (!n || id === 'x') {
      error.textContent = 'Escribe el nombre de la planta.';
    } else if (estado.catalogo.has(id)) {
      error.innerHTML = `Ya hay una ficha con ese nombre: <a href="#/ficha/${esc(id)}">${esc(estado.fichas.get(id)?.nombre || id)}</a>.`;
    } else {
      estado.borradoresNuevos.set(id, plantilla({ nombre: n, cientifico: $('#nf-cientifico', app).value.trim(), color: $('#nf-color', app).value }));
      location.hash = `#/admin/ficha/${id}`;
      return;
    }
    error.hidden = false;
    nombre.focus();
  });
  document.title = `Nueva ficha · ${estado.jardin.nombre}`;
}
