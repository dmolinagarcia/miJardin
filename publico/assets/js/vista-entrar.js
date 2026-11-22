// vista-entrar.js — pantalla de entrada (y de alta, si el registro está abierto).

import { esc } from './md.js';
import { $ } from './ui.js';
import * as api from './api.js';

export function vistaEntrar(app, { registroAbierto = false, sinUsuarios = false, alEntrar }) {
  let modo = 'entrar';

  function pintar() {
    const alta = modo === 'alta';
    app.innerHTML = `
    <section class="entrar">
      <div class="entrar-marca" aria-hidden="true">
        <svg viewBox="0 0 32 32" width="56" height="56" focusable="false">
          <path d="M3 4h15v12h11v12H3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
          <circle cx="8" cy="8.5" r="2" fill="#b0243b"/><circle cx="13" cy="8.5" r="2" fill="#5b4687"/>
          <circle cx="25" cy="22" r="2" fill="#2f7357"/>
        </svg>
      </div>
      <h1>${alta ? 'Crear una cuenta' : 'Entrar en tu jardín'}</h1>
      ${
        sinUsuarios
          ? `<p class="aviso-borrador">Todavía no hay ninguna cuenta. Crea el primer administrador en el servidor con
             <code>npm run cli -- crear-usuario TU_USUARIO --admin</code>, o arráncalo con <code>ADMIN_USUARIO</code> y <code>ADMIN_CLAVE</code>.</p>`
          : ''
      }
      <form class="formulario" id="form-entrar" novalidate>
        <div class="campo">
          <label for="en-usuario">Usuario</label>
          <input id="en-usuario" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required>
        </div>
        ${
          alta
            ? `<div class="campo">
          <label for="en-nombre">Tu nombre</label>
          <input id="en-nombre" name="name" autocomplete="name" maxlength="80">
        </div>`
            : ''
        }
        <div class="campo">
          <label for="en-clave">Contraseña</label>
          <input id="en-clave" name="password" type="password" autocomplete="${alta ? 'new-password' : 'current-password'}" required${alta ? ' minlength="8"' : ''}>
          ${alta ? '<p class="ayuda-campo">Al menos 8 caracteres.</p>' : ''}
        </div>
        <p class="error-campo" id="en-error" role="alert" hidden></p>
        <button class="boton" type="submit">${alta ? 'Crear la cuenta' : 'Entrar'}</button>
      </form>
      ${
        registroAbierto
          ? `<p class="entrar-cambio">${
              alta
                ? '¿Ya tienes cuenta? <button type="button" class="boton-texto" data-modo="entrar">Entra</button>'
                : '¿No tienes cuenta? <button type="button" class="boton-texto" data-modo="alta">Crea una</button>'
            }</p>`
          : '<p class="nota entrar-cambio">Si no tienes cuenta, pídesela a quien administra la web.</p>'
      }
    </section>`;

    const form = $('#form-entrar', app);
    const error = $('#en-error', app);
    $('#en-usuario', app).focus();
    app.querySelector('[data-modo]')?.addEventListener('click', (e) => {
      modo = e.target.dataset.modo;
      pintar();
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const boton = form.querySelector('[type="submit"]');
      error.hidden = true;
      boton.disabled = true;
      const usuario = $('#en-usuario', app).value.trim();
      const clave = $('#en-clave', app).value;
      try {
        const r = alta
          ? await api.post('registro', { usuario, clave, nombre: $('#en-nombre', app).value.trim() || usuario })
          : await api.post('sesion', { usuario, clave });
        await alEntrar(r.usuario);
      } catch (err) {
        error.innerHTML = esc(err.message);
        error.hidden = false;
        boton.disabled = false;
      }
    });
  }

  pintar();
  document.title = 'Entrar · Jardín';
}
