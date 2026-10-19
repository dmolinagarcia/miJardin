// vista-temporada.js — el jardín mes a mes: línea temporal y qué toca en cada planta.

import { MESES, ESTACIONES, CATEGORIAS, estacionDelMes, esc, enLinea, markdown } from './md.js';
import { estado, listaFichas, plantasDe, periodosDelMes, tareasDelMes } from './estado.js';
import { lineaTemporal, leyendaCategorias } from './linea.js';
import { ICONOS } from './ui.js';

const mayuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function tareaHTML(t, mes) {
  const varios = t.meses.length > 1 && t.meses.length < 12;
  const empieza = varios && t.meses[0] === mes;
  const acaba = varios && t.meses[t.meses.length - 1] === mes;
  const marca = empieza ? 'Empieza' : acaba ? 'Último mes' : '';
  return `<li class="tarea cat-${t.categoria}">
    <span class="punto" title="${esc(CATEGORIAS[t.categoria])}" aria-hidden="true"></span>
    <span class="tarea-texto">${enLinea(t.texto)}</span>
    <span class="tarea-rango">${esc(t.cuando)}${marca ? ` <span class="tarea-marca">${marca}</span>` : ''}</span>
  </li>`;
}

export function chipsPeriodo(periodos) {
  return periodos.map((p) => `<span class="chip-est est-${p.estacion || 'otra'}">${esc(p.titulo)}</span>`).join('');
}

function tarjetaMes(f, mes) {
  const periodos = periodosDelMes(f, mes);
  const tareas = tareasDelMes(f, mes);
  const plantas = plantasDe(f.id);
  return `<article class="tarjeta-mes">
    <header class="tarjeta-cab">
      <h3><a href="#/ficha/${esc(f.id)}"><span class="muestra" style="--f:${f.color}" aria-hidden="true"></span>${esc(f.nombre)}</a></h3>
      <div class="tarjeta-chips">${chipsPeriodo(periodos)}
      ${plantas.map((p) => `<a class="mini-marca" style="--f:${f.color}" href="#/plano/${esc(p.id)}" aria-label="Ver ${esc(p.etiqueta)} en el plano">${esc(p.etiqueta)}</a>`).join('')}</div>
    </header>
    ${f.error ? `<p class="error-caja">${esc(f.error)}</p>` : ''}
    ${tareas.length ? `<ul class="tareas" aria-label="Tareas de ${MESES[mes - 1]}">${tareas.map((t) => tareaHTML(t, mes)).join('')}</ul>` : ''}
    ${
      periodos.length
        ? periodos.map((p) => `<div class="prosa">${markdown(p.cuerpo)}</div>`).join('')
        : `<p class="vacio">La ficha no tiene ninguna temporada que incluya ${MESES[mes - 1]}.</p>`
    }
  </article>`;
}

export function vistaTemporada(app, mesRuta) {
  const hoy = new Date();
  const mesHoy = hoy.getMonth() + 1;
  const mes = mesRuta >= 1 && mesRuta <= 12 ? mesRuta : mesHoy;
  const anterior = mes === 1 ? 12 : mes - 1;
  const siguiente = mes === 12 ? 1 : mes + 1;
  const estacion = estacionDelMes(mes);
  const fichas = listaFichas();
  const nombreMes = MESES[mes - 1];

  app.innerHTML = `
  <section class="temporada">
    <header class="temporada-cab">
      <div class="temporada-titulo">
        <p class="contexto">${
          mes === mesHoy ? `Hoy es ${hoy.getDate()} de ${nombreMes}` : `<a href="#/temporada">Volver a hoy, ${hoy.getDate()} de ${MESES[mesHoy - 1]}</a>`
        }</p>
        <h1 class="mes">${mayuscula(nombreMes)} <span class="chip-est est-${estacion}">${ESTACIONES[estacion]}</span></h1>
      </div>
      <nav class="pasos-mes" aria-label="Cambiar de mes">
        <a class="boton-icono" href="#/temporada/${anterior}" aria-label="Mes anterior, ${MESES[anterior - 1]}">${ICONOS.izquierda}</a>
        <a class="boton-icono" href="#/temporada/${siguiente}" aria-label="Mes siguiente, ${MESES[siguiente - 1]}">${ICONOS.derecha}</a>
      </nav>
    </header>

    ${
      fichas.length
        ? `<div class="panel panel-linea">
      ${lineaTemporal({ fichas, mes, enlaceMes: (m) => `#/temporada/${m}` })}
      <p class="nota">Toca un mes para ver qué toca. La línea vertical marca el día de hoy.</p>
    </div>

    <div class="rejilla-tarjetas">${fichas.map((f) => tarjetaMes(f, mes)).join('')}</div>

    <details class="panel anual" id="anual">
      <summary><h2>Calendario de todo el año</h2></summary>
      ${leyendaCategorias(fichas)}
      ${lineaTemporal({ fichas, mes, tareas: true })}
    </details>`
        : `<div class="vacio-grande"><p>Todavía no hay fichas de plantas.</p><a class="boton" href="#/nueva">Crear la primera ficha</a></div>`
    }
  </section>`;

  const anual = app.querySelector('#anual');
  if (anual && window.matchMedia('(min-width: 760px)').matches) anual.open = true;
  document.title = `${mayuscula(nombreMes)} · ${estado.jardin.nombre}`;
}
