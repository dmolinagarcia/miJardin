// vista-admin.js — sección privada de administración: catálogo de fichas y usuarios.

import { esc, parsearFicha } from './md.js';
import { estado, esAdmin, cargarTodo, guardarFichaBase } from './estado.js';
import { ICONOS, abrirHoja, cerrarHoja, confirmar, aviso, fechaCorta, fechaLarga } from './ui.js';
import * as api from './api.js';

let app = null;

export async function vistaAdmin(contenedor) {
  app = contenedor;
  if (!esAdmin()) {
    app.innerHTML = `<section class="vacio-grande"><h1>Solo para administración</h1>
      <p>Esta sección es solo para las personas que mantienen el catálogo de fichas.</p><a class="boton" href="#/temporada">Volver</a></section>`;
    return;
  }
  app.innerHTML = '<p class="cargando" role="status">Cargando…</p>';
  let fichas;
  let usuarios;
  try {
    [{ fichas }, { usuarios }] = await Promise.all([api.get('admin/fichas'), api.get('admin/usuarios')]);
  } catch (e) {
    app.innerHTML = `<section class="vacio-grande"><h1>No se ha podido cargar</h1><p>${esc(e.message)}</p></section>`;
    return;
  }
  if (!location.hash.startsWith('#/admin')) return; // se ha cambiado de vista mientras cargaba

  const activas = fichas.filter((f) => !f.archivada);
  const archivadas = fichas.filter((f) => f.archivada);

  app.innerHTML = `
  <section class="admin">
    <header class="cab-vista">
      <h1>Administración</h1>
    </header>
    <p class="entradilla">El catálogo común de fichas y las cuentas de la web. Lo que cambies en una ficha lo ven al momento todos los usuarios; sus notas personales no se tocan.</p>

    <section class="panel" aria-labelledby="t-catalogo">
      <div class="panel-cab">
        <h2 id="t-catalogo">Catálogo de fichas <span class="cuenta">${activas.length}</span></h2>
        <a class="boton" href="#/admin/nueva">${ICONOS.mas}Nueva ficha</a>
      </div>
      ${activas.length ? `<ul class="filas-admin">${activas.map(filaFicha).join('')}</ul>` : '<p class="vacio">No hay fichas en el catálogo.</p>'}
      ${
        archivadas.length
          ? `<details class="archivadas"><summary>Archivadas (${archivadas.length})</summary>
          <p class="nota">Los usuarios no las ven. Sus notas se conservan mientras no la borres para siempre.</p>
          <ul class="filas-admin">${archivadas.map(filaFicha).join('')}</ul></details>`
          : ''
      }
    </section>

    <section class="panel" aria-labelledby="t-usuarios">
      <div class="panel-cab">
        <h2 id="t-usuarios">Usuarios <span class="cuenta">${usuarios.length}</span></h2>
        <button type="button" class="boton" data-accion="nuevo-usuario">${ICONOS.mas}Nuevo usuario</button>
      </div>
      <ul class="filas-admin">${usuarios.map(filaUsuario).join('')}</ul>
    </section>
  </section>`;

  app.querySelector('.admin').addEventListener('click', (e) => {
    const b = e.target.closest('[data-accion]');
    if (!b) return;
    const { accion, id } = b.dataset;
    if (accion === 'nuevo-usuario') hojaUsuario(null);
    else if (accion === 'usuario') hojaUsuario(usuarios.find((u) => String(u.id) === id));
    else if (accion === 'historial') hojaHistorial(fichas.find((f) => f.id === id));
    else if (accion === 'archivar' || accion === 'restaurar') archivar(fichas.find((f) => f.id === id), accion === 'archivar');
    else if (accion === 'borrar-ficha') borrarFicha(fichas.find((f) => f.id === id));
  });
  document.title = `Administración · ${estado.jardin.nombre}`;
}

function nombreFicha(f) {
  const p = parsearFicha(f.id, f.texto);
  return { nombre: p.nombre, color: p.color || '#6b756f', cientifico: p.cientifico };
}

function filaFicha(f) {
  const { nombre, color, cientifico } = nombreFicha(f);
  return `<li class="fila-admin">
    <span class="ficha-muestra" style="--f:${color}" aria-hidden="true"></span>
    <span class="fila-admin-texto">
      <span class="fila-admin-nombre">${f.archivada ? esc(nombre) : `<a href="#/ficha/${esc(f.id)}">${esc(nombre)}</a>`}${cientifico ? ` <span class="cientifico">${esc(cientifico)}</span>` : ''}</span>
      <span class="fila-admin-meta">${esc(f.id)} · versión ${f.version} · ${esc(fechaLarga(f.actualizada))}${f.autor ? ` por ${esc(f.autor)}` : ''}${
        f.conNotas ? ` · ${f.conNotas} ${f.conNotas === 1 ? 'usuario tiene' : 'usuarios tienen'} notas` : ''
      }</span>
    </span>
    <span class="fila-admin-acciones">
      ${
        f.archivada
          ? `<button type="button" class="boton secundario" data-accion="restaurar" data-id="${esc(f.id)}">Restaurar</button>
             <button type="button" class="boton-texto peligro-texto" data-accion="borrar-ficha" data-id="${esc(f.id)}">Borrar</button>`
          : `<a class="boton secundario" href="#/admin/ficha/${esc(f.id)}">${ICONOS.lapiz}Editar</a>
             <button type="button" class="boton-texto" data-accion="historial" data-id="${esc(f.id)}">Versiones</button>
             <button type="button" class="boton-texto" data-accion="archivar" data-id="${esc(f.id)}">Archivar</button>`
      }
    </span>
  </li>`;
}

function filaUsuario(u) {
  const yo = u.id === estado.yo.id;
  return `<li class="fila-admin">
    <span class="avatar" aria-hidden="true">${esc((u.nombre || u.usuario).charAt(0).toUpperCase())}</span>
    <span class="fila-admin-texto">
      <span class="fila-admin-nombre">${esc(u.nombre)}${yo ? ' <span class="cuenta">tú</span>' : ''}
        ${u.rol === 'admin' ? '<span class="insignia">Admin</span>' : ''}${u.activo ? '' : ' <span class="insignia apagada">Desactivado</span>'}</span>
      <span class="fila-admin-meta">${esc(u.usuario)} · ${u.ultimo_acceso ? `última entrada ${esc(fechaCorta(Date.parse(u.ultimo_acceso)))}` : 'no ha entrado nunca'}</span>
    </span>
    <span class="fila-admin-acciones">
      <button type="button" class="boton secundario" data-accion="usuario" data-id="${u.id}">Editar</button>
    </span>
  </li>`;
}

async function recargar() {
  await cargarTodo();
  window.dispatchEvent(new Event('jardin:recargado'));
}

async function archivar(f, si) {
  const { nombre } = nombreFicha(f);
  if (si) {
    const ok = await confirmar({
      titulo: `Archivar ${nombre}`,
      texto: 'Dejará de verse en el catálogo y en los jardines de los usuarios. Sus notas se conservan, y puedes restaurarla cuando quieras.',
      aceptar: 'Archivar',
      peligro: true,
    });
    if (!ok) return;
  }
  try {
    await api.post(`admin/fichas/${encodeURIComponent(f.id)}/archivar`, { archivada: si });
    aviso(si ? `${nombre} archivada.` : `${nombre} restaurada.`);
    await recargar();
  } catch (e) {
    aviso(e.message, 'error');
  }
}

async function borrarFicha(f) {
  const { nombre } = nombreFicha(f);
  const ok = await confirmar({
    titulo: `Borrar ${nombre} para siempre`,
    texto: 'Se borran la ficha, todas sus versiones y las notas que los usuarios tengan en ella. No se puede deshacer.',
    aceptar: 'Borrar para siempre',
    peligro: true,
  });
  if (!ok) return;
  try {
    await api.borrar(`admin/fichas/${encodeURIComponent(f.id)}`);
    aviso(`${nombre} borrada.`);
    await recargar();
  } catch (e) {
    aviso(e.message, 'error');
  }
}

async function hojaHistorial(f) {
  const { nombre } = nombreFicha(f);
  let versiones;
  try {
    ({ versiones } = await api.get(`admin/fichas/${encodeURIComponent(f.id)}/historial`));
  } catch (e) {
    aviso(e.message, 'error');
    return;
  }
  abrirHoja({
    titulo: `Versiones de ${esc(nombre)}`,
    ancha: true,
    contenido: `<ol class="versiones">${versiones
      .map(
        (v, k) => `<li>
        <details>
          <summary><strong>Versión ${v.version}</strong> · ${esc(fechaCorta(Date.parse(v.fecha)))}${v.autor ? ` · ${esc(v.autor)}` : ''}${k === 0 ? ' <span class="insignia">Actual</span>' : ''}</summary>
          <pre class="texto-version">${esc(v.texto)}</pre>
          ${k === 0 ? '' : `<button type="button" class="boton secundario" data-recuperar="${v.version}">Volver a esta versión</button>`}
        </details>
      </li>`,
      )
      .join('')}</ol>
      ${versiones.length >= 50 ? '<p class="nota">Se muestran las 50 últimas.</p>' : ''}`,
    alMontar: (d) => {
      d.querySelector('.versiones').addEventListener('click', async (e) => {
        const b = e.target.closest('[data-recuperar]');
        if (!b) return;
        const v = versiones.find((x) => String(x.version) === b.dataset.recuperar);
        const ok = await confirmar({
          titulo: `Volver a la versión ${v.version}`,
          texto: 'Se publicará como una versión nueva con el texto de entonces. Todos los usuarios la verán.',
          aceptar: 'Publicar esa versión',
        });
        if (!ok) return;
        try {
          await guardarFichaBase(f.id, v.texto, { forzar: true });
          cerrarHoja();
          aviso(`Publicada de nuevo la versión ${v.version} de ${nombre}.`);
          vistaAdmin(app);
        } catch (err) {
          aviso(err.message, 'error');
        }
      });
    },
  });
}

function hojaUsuario(u) {
  const nuevo = !u;
  const yo = u && u.id === estado.yo.id;
  abrirHoja({
    titulo: nuevo ? 'Nuevo usuario' : `Editar ${esc(u.usuario)}`,
    contenido: `<form class="formulario" id="form-usuario" novalidate autocomplete="off">
      ${
        nuevo
          ? `<div class="campo">
        <label for="us-usuario">Usuario</label>
        <input id="us-usuario" required autocapitalize="none" spellcheck="false" autocomplete="off" aria-describedby="us-usuario-ayuda">
        <p class="ayuda-campo" id="us-usuario-ayuda">Con lo que entrará. Letras sin tildes, números, punto o guion.</p>
      </div>`
          : ''
      }
      <div class="campo">
        <label for="us-nombre">Nombre</label>
        <input id="us-nombre" value="${esc(u?.nombre || '')}" maxlength="80" required>
      </div>
      <div class="campo">
        <label for="us-clave">${nuevo ? 'Contraseña' : 'Contraseña nueva <span class="opcional">(déjala vacía para no cambiarla)</span>'}</label>
        <input id="us-clave" type="text" autocomplete="new-password" spellcheck="false" autocapitalize="none" minlength="8" aria-describedby="us-clave-ayuda">
        <p class="ayuda-campo" id="us-clave-ayuda">Al menos 8 caracteres. Pásasela a la persona por un canal privado.</p>
      </div>
      <div class="campo">
        <label for="us-rol">Permisos</label>
        <select id="us-rol"${yo ? ' disabled' : ''}>
          <option value="usuario"${u?.rol !== 'admin' ? ' selected' : ''}>Usuario: su jardín y sus notas</option>
          <option value="admin"${u?.rol === 'admin' ? ' selected' : ''}>Administración: además, el catálogo y los usuarios</option>
        </select>
      </div>
      ${
        nuevo || yo
          ? ''
          : `<label class="casilla"><input type="checkbox" id="us-activo"${u.activo ? ' checked' : ''}> Cuenta activa</label>`
      }
      <p class="error-campo" id="us-error" role="alert" hidden></p>
      <div class="acciones">
        <button class="boton" type="submit">${nuevo ? 'Crear usuario' : 'Guardar'}</button>
        ${nuevo || yo ? '' : '<button class="boton-texto peligro-texto" type="button" data-accion="borrar">Borrar la cuenta</button>'}
      </div>
    </form>`,
    alMontar: (d) => {
      const form = d.querySelector('#form-usuario');
      const error = form.querySelector('#us-error');
      const valor = (id) => form.querySelector(id)?.value;
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        error.hidden = true;
        try {
          if (nuevo) {
            await api.post('admin/usuarios', { usuario: valor('#us-usuario'), nombre: valor('#us-nombre'), clave: valor('#us-clave'), rol: valor('#us-rol') });
            aviso('Usuario creado.');
          } else {
            const cambios = { nombre: valor('#us-nombre') };
            if (!yo) cambios.rol = valor('#us-rol');
            const activo = form.querySelector('#us-activo');
            if (activo) cambios.activo = activo.checked;
            if (valor('#us-clave')) cambios.clave = valor('#us-clave');
            await api.patch(`admin/usuarios/${u.id}`, cambios);
            if (yo) estado.yo.nombre = cambios.nombre;
            aviso('Cambios guardados.');
          }
          cerrarHoja();
          vistaAdmin(app);
        } catch (err) {
          error.textContent = err.message;
          error.hidden = false;
        }
      });
      form.querySelector('[data-accion="borrar"]')?.addEventListener('click', async () => {
        const ok = await confirmar({
          titulo: `Borrar la cuenta de ${u.usuario}`,
          texto: 'Se borran su jardín y todas sus notas. No se puede deshacer. Si solo quieres impedir que entre, desactívala.',
          aceptar: 'Borrar la cuenta',
          peligro: true,
        });
        if (!ok) return;
        try {
          await api.borrar(`admin/usuarios/${u.id}`);
          cerrarHoja();
          aviso('Cuenta borrada.');
          vistaAdmin(app);
        } catch (err) {
          aviso(err.message, 'error');
        }
      });
    },
  });
}
