// vista-ajustes.js — conexión con GitHub y edición directa de datos/jardin.json.

import { esc } from './md.js';
import { estado, RUTA_JARDIN, jardinATexto, guardarTexto, cargarTodo } from './estado.js';
import { ICONOS, $, aviso, confirmar } from './ui.js';
import { ponerGuardia } from './rutas.js';
import { hojaSinConexion, guardarConConflicto } from './conexion.js';
import * as gh from './github.js';

function estadoConexion() {
  const c = gh.config();
  if (gh.puedeEscribir()) return `Lista para guardar en <strong>${esc(c.usuario)}/${esc(c.repositorio)}</strong>, rama ${esc(c.rama)}${c.carpeta ? `, carpeta ${esc(c.carpeta)}` : ''}.`;
  if (gh.repoConocido()) return `Repositorio: <strong>${esc(c.usuario)}/${esc(c.repositorio)}</strong>. Falta el token para poder guardar.`;
  return 'Indica tu usuario y el repositorio de la web, y pega el token.';
}

export function vistaAjustes(app) {
  const g = gh.configGuardada();
  const det = gh.detectarRepositorio();
  const tieneToken = Boolean(gh.config().token);

  app.innerHTML = `
  <section class="ajustes">
    <header class="cab-vista"><h1>Ajustes</h1></header>

    <section class="panel">
      <h2>Guardar cambios en GitHub</h2>
      <div class="prosa-ui">
        <p>Las fichas y el plano viven en tu repositorio de GitHub. Para guardar desde esta web, también desde el móvil, hace falta un token con permiso de escritura en ese repositorio. Se guarda solo en este navegador.</p>
      </div>
      <details class="pasos-token">
        <summary>Cómo crear el token</summary>
        <ol>
          <li>Entra en <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com/settings/personal-access-tokens/new</a>.</li>
          <li>Ponle un nombre, como «Web del jardín», y una caducidad.</li>
          <li>En <em>Repository access</em> elige <em>Only select repositories</em> y marca el repositorio del jardín.</li>
          <li>En <em>Permissions</em>, busca <em>Contents</em> y cámbialo a <em>Read and write</em>.</li>
          <li>Pulsa <em>Generate token</em>, cópialo y pégalo aquí abajo.</li>
        </ol>
      </details>
      <form id="form-github" class="formulario" autocomplete="off" novalidate>
        <div class="campos-2">
          <div class="campo">
            <label for="gh-usuario">Usuario u organización</label>
            <input id="gh-usuario" value="${esc(g.usuario || '')}" placeholder="${esc(det.usuario || 'tu-usuario')}" autocapitalize="none" spellcheck="false">
          </div>
          <div class="campo">
            <label for="gh-repositorio">Repositorio</label>
            <input id="gh-repositorio" value="${esc(g.repositorio || '')}" placeholder="${esc(det.repositorio || 'jardin')}" autocapitalize="none" spellcheck="false">
          </div>
          <div class="campo">
            <label for="gh-rama">Rama</label>
            <input id="gh-rama" value="${esc(g.rama || '')}" placeholder="main" autocapitalize="none" spellcheck="false">
          </div>
          <div class="campo">
            <label for="gh-carpeta">Carpeta <span class="opcional">(solo si la web no está en la raíz)</span></label>
            <input id="gh-carpeta" value="${esc(g.carpeta || '')}" autocapitalize="none" spellcheck="false">
          </div>
        </div>
        ${det.usuario ? `<p class="ayuda-campo">Si dejas usuario y repositorio vacíos, se usan los de esta dirección: ${esc(det.usuario)}/${esc(det.repositorio)}.</p>` : ''}
        <div class="campo">
          <label for="gh-token">Token</label>
          <input id="gh-token" type="password" placeholder="${tieneToken ? 'Guardado. Pega otro para cambiarlo' : 'github_pat_…'}" autocapitalize="none" spellcheck="false">
        </div>
        <div class="acciones">
          <button class="boton" type="submit">Guardar ajustes</button>
          <button class="boton secundario" type="button" data-accion="probar">Probar la conexión</button>
          ${tieneToken ? '<button class="boton-texto peligro-texto" type="button" data-accion="olvidar">Olvidar el token</button>' : ''}
        </div>
        <p class="estado-conexion" id="estado-conexion" role="status">${estadoConexion()}</p>
      </form>
    </section>

    <section class="panel">
      <h2>Datos del jardín</h2>
      <div class="prosa-ui">
        <p>El contorno del plano, las zonas y la lista de plantas están en <code>${RUTA_JARDIN}</code>. Puedes editarlo aquí, por ejemplo para poner las medidas reales del jardín.</p>
        <p class="nota">Datos cargados desde ${estado.origen === 'github' ? 'GitHub, versión al día' : 'la web publicada'}.</p>
      </div>
      <div class="acciones">
        <a class="boton secundario" href="#/datos">${ICONOS.hoja}Editar jardin.json</a>
        <button class="boton secundario" type="button" data-accion="recargar">Volver a cargar los datos</button>
      </div>
    </section>
  </section>`;

  const form = $('#form-github', app);
  const salida = $('#estado-conexion', app);

  function leerFormulario() {
    const cambios = {
      usuario: $('#gh-usuario', app).value,
      repositorio: $('#gh-repositorio', app).value,
      rama: $('#gh-rama', app).value,
      carpeta: $('#gh-carpeta', app).value,
    };
    const token = $('#gh-token', app).value.trim();
    if (token) cambios.token = token;
    return cambios;
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!gh.guardarConfig(leerFormulario())) {
      aviso('Este navegador no deja guardar datos (¿modo privado?). Los ajustes no se recordarán.', 'error');
      return;
    }
    aviso('Ajustes guardados.');
    vistaAjustes(app);
  });

  app.querySelector('.ajustes').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-accion]');
    if (!b) return;
    if (b.dataset.accion === 'probar') {
      gh.guardarConfig(leerFormulario());
      if (!gh.puedeEscribir()) {
        salida.innerHTML = estadoConexion();
        return;
      }
      salida.textContent = 'Comprobando…';
      try {
        const r = await gh.probar();
        salida.innerHTML = `Conectado con <strong>${esc(r.nombre)}</strong>${r.privado ? ' (privado)' : ''}. Ya puedes guardar desde la web.`;
      } catch (err) {
        salida.textContent = err.message;
      }
    } else if (b.dataset.accion === 'olvidar') {
      const si = await confirmar({
        titulo: 'Olvidar el token',
        texto: 'Este navegador dejará de poder guardar en GitHub hasta que vuelvas a pegarlo.',
        aceptar: 'Olvidar',
        cancelar: 'Cancelar',
        peligro: true,
      });
      if (!si) return;
      gh.olvidarToken();
      aviso('Token olvidado en este navegador.');
      vistaAjustes(app);
    } else if (b.dataset.accion === 'recargar') {
      b.disabled = true;
      try {
        await cargarTodo();
        window.dispatchEvent(new Event('jardin:recargado'));
        aviso(estado.avisoCarga || 'Datos cargados de nuevo.', estado.avisoCarga ? 'error' : 'info');
      } catch (err) {
        aviso(err.message, 'error');
      } finally {
        b.disabled = false;
      }
    }
  });
  document.title = `Ajustes · ${estado.jardin.nombre}`;
}

export function vistaDatos(app) {
  const original = estado.textos.get(RUTA_JARDIN) ?? jardinATexto(estado.jardin);
  app.innerHTML = `
  <section class="editor">
    <nav class="migas" aria-label="Volver"><a href="#/ajustes">${ICONOS.izquierda}Ajustes</a></nav>
    <header class="cab-vista"><div><h1>Datos del jardín</h1><p class="ruta-archivo">${RUTA_JARDIN}</p></div></header>
    <details class="ayuda">
      <summary>Qué hay en este archivo</summary>
      <ul>
        <li><code>nombre</code>: el nombre que sale arriba.</li>
        <li><code>fichas</code>: las fichas que se cargan, por el nombre de su archivo en <code>fichas/</code>, sin <code>.md</code>.</li>
        <li><code>plano.contorno</code>: las esquinas del jardín, en orden, como pares <code>[x, y]</code>. La <code>y</code> crece hacia abajo. Puedes usar metros.</li>
        <li><code>plano.zonas</code>: textos sobre el plano, como «Fondo», con su posición.</li>
        <li><code>plantas</code>: cada planta con su <code>etiqueta</code>, su <code>ficha</code>, su posición y sus <code>notas</code>.</li>
      </ul>
    </details>
    <textarea id="texto-datos" class="area-texto codigo" spellcheck="false" autocapitalize="none" aria-label="Contenido de jardin.json" aria-describedby="estado-json">${esc(original)}</textarea>
    <p class="estado-json" id="estado-json" role="status">El JSON es válido.</p>
    <div class="barra-guardar">
      <button type="button" class="boton" data-accion="guardar">${gh.puedeEscribir() ? 'Guardar en GitHub' : 'Guardar…'}</button>
      <a class="boton secundario" href="#/ajustes">Cancelar</a>
    </div>
  </section>`;

  const area = $('#texto-datos', app);
  const estadoJson = $('#estado-json', app);
  const boton = app.querySelector('[data-accion="guardar"]');
  ponerGuardia(() => area.value !== original);

  function validar() {
    try {
      const d = JSON.parse(area.value);
      if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error('debe ser un objeto { … }');
      estadoJson.textContent = 'El JSON es válido.';
      estadoJson.classList.remove('mal');
      return d;
    } catch (e) {
      estadoJson.textContent = `El JSON tiene un error: ${e.message}`;
      estadoJson.classList.add('mal');
      return null;
    }
  }
  area.addEventListener('input', validar);

  boton.addEventListener('click', async () => {
    if (!validar()) {
      area.focus();
      return;
    }
    const texto = area.value.endsWith('\n') ? area.value : `${area.value}\n`;
    if (!gh.puedeEscribir()) {
      hojaSinConexion({ ruta: RUTA_JARDIN, texto, tipo: 'application/json' });
      return;
    }
    boton.disabled = true;
    boton.textContent = 'Guardando…';
    try {
      const hecho = await guardarConConflicto((op) => guardarTexto(RUTA_JARDIN, texto, 'Edita los datos del jardín', op), { que: 'El archivo' });
      if (!hecho) return;
      ponerGuardia(null);
      await cargarTodo();
      window.dispatchEvent(new Event('jardin:recargado'));
      aviso('Datos guardados en GitHub.');
      location.hash = '#/plano';
    } catch (e) {
      aviso(e.message, 'error');
    } finally {
      boton.disabled = false;
      boton.textContent = gh.puedeEscribir() ? 'Guardar en GitHub' : 'Guardar…';
    }
  });
  document.title = `Datos del jardín · ${estado.jardin.nombre}`;
}
