// vista-ajustes.js — cuenta, instalación de la app y datos del jardín.

import { esc } from './md.js';
import { estado, jardinATexto, guardarJardin, cargarTodo } from './estado.js';
import { ICONOS, $, aviso, confirmar, descargar, guardarConConflicto } from './ui.js';
import { ponerGuardia } from './rutas.js';
import { puedeInstalar, instalada, esIOS, instalar, borrarCopiaDatos } from './instalar.js';
import * as api from './api.js';

function panelInstalar() {
  if (instalada()) return '<p>Estás usando la web como app instalada.</p>';
  if (puedeInstalar()) {
    return `<p>Instálala en este dispositivo para abrirla desde un icono, a pantalla completa, como una app más.</p>
      <div class="acciones"><button type="button" class="boton" data-accion="instalar">${ICONOS.instalar}Instalar la app</button></div>`;
  }
  if (esIOS()) {
    return `<p>En el iPhone o el iPad, ábrela en Safari, pulsa el botón <strong>Compartir</strong> y elige <strong>Añadir a la pantalla de inicio</strong>.</p>`;
  }
  if (!window.isSecureContext) {
    return '<p>Para poder instalarla, la web tiene que servirse por <strong>https</strong>. Mira el apartado «HTTPS» del README.</p>';
  }
  return '<p>En el móvil, abre el menú del navegador y elige <strong>Instalar app</strong> o <strong>Añadir a pantalla de inicio</strong>.</p>';
}

export function vistaAjustes(app) {
  const yo = estado.yo;
  app.innerHTML = `
  <section class="ajustes">
    <header class="cab-vista"><h1>Ajustes</h1></header>

    <section class="panel">
      <h2>Tu cuenta</h2>
      <p class="estado-conexion">Has entrado como <strong>${esc(yo.usuario)}</strong>${yo.rol === 'admin' ? ', con permiso de administración' : ''}.</p>
      <form id="form-nombre" class="formulario estrecho" novalidate>
        <div class="campo">
          <label for="aj-nombre">Tu nombre</label>
          <input id="aj-nombre" value="${esc(yo.nombre)}" autocomplete="name" maxlength="80" required>
        </div>
        <div class="acciones"><button class="boton secundario" type="submit">Guardar el nombre</button></div>
      </form>
      <details class="pasos-token">
        <summary>Cambiar la contraseña</summary>
        <form id="form-clave" class="formulario estrecho" novalidate>
          <input type="text" autocomplete="username" value="${esc(yo.usuario)}" hidden>
          <div class="campo">
            <label for="aj-actual">Contraseña actual</label>
            <input id="aj-actual" type="password" autocomplete="current-password" required>
          </div>
          <div class="campo">
            <label for="aj-nueva">Contraseña nueva</label>
            <input id="aj-nueva" type="password" autocomplete="new-password" minlength="8" required aria-describedby="aj-nueva-ayuda">
            <p class="ayuda-campo" id="aj-nueva-ayuda">Al menos 8 caracteres. Se cerrará la sesión en tus otros dispositivos.</p>
          </div>
          <p class="error-campo" id="aj-clave-error" role="alert" hidden></p>
          <div class="acciones"><button class="boton" type="submit">Cambiar la contraseña</button></div>
        </form>
      </details>
      <div class="acciones"><button class="boton secundario" type="button" data-accion="salir">${ICONOS.salir}Cerrar sesión</button></div>
    </section>

    <section class="panel">
      <h2>La app en el móvil</h2>
      <div class="prosa-ui" id="panel-instalar">${panelInstalar()}</div>
    </section>

    <section class="panel">
      <h2>Tu jardín</h2>
      <form id="form-jardin" class="formulario estrecho" novalidate>
        <div class="campo">
          <label for="aj-jardin">Nombre del jardín</label>
          <input id="aj-jardin" value="${esc(estado.jardin.nombre)}" maxlength="80" required>
        </div>
        <div class="acciones"><button class="boton secundario" type="submit">Guardar el nombre</button></div>
      </form>
      <div class="prosa-ui">
        <p>El contorno del plano, las zonas y la lista de plantas se pueden editar también como texto, por ejemplo para poner las medidas reales del jardín.</p>
      </div>
      <div class="acciones">
        <a class="boton secundario" href="#/datos">${ICONOS.hoja}Editar los datos del plano</a>
        <button class="boton secundario" type="button" data-accion="copia">${ICONOS.descargar}Descargar una copia</button>
        <button class="boton-texto" type="button" data-accion="recargar">Volver a cargar los datos</button>
      </div>
    </section>
  </section>`;

  const actualizarInstalar = () => {
    const panel = $('#panel-instalar', app);
    if (panel) panel.innerHTML = panelInstalar();
  };
  window.addEventListener('jardin:instalable', actualizarInstalar, { once: true });

  $('#form-nombre', app).addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const { usuario } = await api.patch('yo', { nombre: $('#aj-nombre', app).value });
      estado.yo = usuario;
      aviso('Nombre guardado.');
    } catch (err) {
      aviso(err.message, 'error');
    }
  });

  $('#form-clave', app).addEventListener('submit', async (e) => {
    e.preventDefault();
    const error = $('#aj-clave-error', app);
    error.hidden = true;
    try {
      await api.put('yo/clave', { actual: $('#aj-actual', app).value, nueva: $('#aj-nueva', app).value });
      e.target.reset();
      e.target.closest('details').open = false;
      aviso('Contraseña cambiada.');
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
    }
  });

  $('#form-jardin', app).addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = $('#aj-jardin', app).value.trim();
    if (!nombre) return;
    try {
      await guardarConConflicto((op) => guardarJardin({ ...estado.jardin, nombre }, op), { que: 'El jardín', detalle: 'Lo has cambiado desde otro dispositivo.' });
      window.dispatchEvent(new Event('jardin:nombre'));
      aviso('Nombre del jardín guardado.');
    } catch (err) {
      aviso(err.message, 'error');
    }
  });

  app.querySelector('.ajustes').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-accion]');
    if (!b) return;
    const accion = b.dataset.accion;
    if (accion === 'salir') {
      const si = await confirmar({ titulo: 'Cerrar sesión', texto: 'Tendrás que volver a entrar con tu usuario y contraseña.', aceptar: 'Cerrar sesión' });
      if (!si) return;
      try {
        await api.borrar('sesion');
      } catch {
        /* se sale igualmente */
      }
      await borrarCopiaDatos();
      location.replace(location.pathname);
    } else if (accion === 'instalar') {
      await instalar();
      actualizarInstalar();
    } else if (accion === 'copia') {
      const copia = {
        exportado: new Date().toISOString(),
        usuario: estado.yo.usuario,
        jardin: estado.jardin,
        notas: Object.fromEntries([...estado.catalogo.values()].filter((c) => c.notas?.texto).map((c) => [c.id, c.notas.texto])),
      };
      descargar(`jardin-${estado.yo.usuario}.json`, `${JSON.stringify(copia, null, 2)}\n`, 'application/json');
    } else if (accion === 'recargar') {
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
  const original = jardinATexto(estado.jardin);
  app.innerHTML = `
  <section class="editor">
    <nav class="migas" aria-label="Volver"><a href="#/ajustes">${ICONOS.izquierda}Ajustes</a></nav>
    <header class="cab-vista"><div><h1>Datos del plano</h1><p class="ruta-archivo">jardin.json</p></div></header>
    <details class="ayuda">
      <summary>Qué hay en estos datos</summary>
      <ul>
        <li><code>nombre</code>: el nombre que sale arriba.</li>
        <li><code>fichas</code>: las fichas del catálogo que tienes en tu jardín, por su identificador.</li>
        <li><code>plano.contorno</code>: las esquinas del jardín, en orden, como pares <code>[x, y]</code>. La <code>y</code> crece hacia abajo. Puedes usar metros.</li>
        <li><code>plano.zonas</code>: textos sobre el plano, como «Fondo», con su posición.</li>
        <li><code>plantas</code>: cada planta con su <code>etiqueta</code>, su <code>ficha</code>, su posición y sus <code>notas</code>.</li>
      </ul>
    </details>
    <textarea id="texto-datos" class="area-texto codigo" spellcheck="false" autocapitalize="none" aria-label="Datos del jardín en JSON" aria-describedby="estado-json">${esc(original)}</textarea>
    <p class="estado-json" id="estado-json" role="status">El JSON es válido.</p>
    <div class="barra-guardar">
      <button type="button" class="boton" data-accion="guardar">Guardar</button>
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
    const datos = validar();
    if (!datos) {
      area.focus();
      return;
    }
    boton.disabled = true;
    boton.textContent = 'Guardando…';
    try {
      const hecho = await guardarConConflicto((op) => guardarJardin(datos, op), { que: 'El jardín', detalle: 'Lo has cambiado desde otro dispositivo.' });
      if (!hecho) return;
      ponerGuardia(null);
      window.dispatchEvent(new Event('jardin:nombre'));
      aviso('Datos guardados.');
      location.hash = '#/plano';
    } catch (e) {
      aviso(e.message, 'error');
    } finally {
      boton.disabled = false;
      boton.textContent = 'Guardar';
    }
  });
  document.title = `Datos del plano · ${estado.jardin.nombre}`;
}
