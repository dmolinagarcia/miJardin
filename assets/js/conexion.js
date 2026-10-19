// conexion.js — qué ofrecer cuando no se puede guardar directamente en GitHub,
// y cómo resolver un conflicto (el archivo cambió en GitHub mientras se editaba).

import * as gh from './github.js';
import { esc } from './md.js';
import { ICONOS, abrirHoja, aviso, copiar, descargar, confirmar } from './ui.js';

export function hojaSinConexion({ ruta, texto, tipo = 'text/markdown' }) {
  const nombre = ruta.split('/').pop();
  const editar = gh.urlEditar(ruta);
  abrirHoja({
    titulo: 'Falta conectar con GitHub',
    contenido: `<div class="prosa-ui">
        <p>Para guardar desde la web, añade un token de GitHub en <a href="#/ajustes" data-cerrar>Ajustes</a>. Se hace una vez en cada dispositivo.</p>
        <p>Mientras tanto, copia el texto y pégalo en el archivo <code>${esc(ruta)}</code> de tu repositorio, sustituyendo todo lo que tenga.</p>
      </div>
      <div class="acciones">
        <button type="button" class="boton" data-accion="copiar">Copiar el texto</button>
        ${editar ? `<a class="boton secundario" href="${esc(editar)}" target="_blank" rel="noopener">${ICONOS.github}Abrir en GitHub</a>` : ''}
        <button type="button" class="boton secundario" data-accion="descargar">Descargar ${esc(nombre)}</button>
      </div>`,
    alMontar: (d) => {
      d.querySelector('[data-accion="copiar"]').addEventListener('click', async () => {
        const ok = await copiar(texto);
        aviso(ok ? 'Texto copiado.' : 'No se ha podido copiar. Usa «Descargar».', ok ? 'info' : 'error');
      });
      d.querySelector('[data-accion="descargar"]').addEventListener('click', () => descargar(nombre, texto, tipo));
    },
  });
}

// fn recibe { forzar } y guarda. Si GitHub tiene una versión más nueva, pregunta antes de sobrescribir.
export async function guardarConConflicto(fn, { que = 'El archivo' } = {}) {
  try {
    return await fn({});
  } catch (e) {
    if (!e.conflicto) throw e;
    const si = await confirmar({
      titulo: `${que} ha cambiado en GitHub`,
      texto: 'Alguien lo ha modificado desde que lo abriste. Si guardas, tu versión sustituirá a la que hay en GitHub.',
      aceptar: 'Guardar mi versión',
      cancelar: 'No guardar',
    });
    if (!si) return null;
    return fn({ forzar: true });
  }
}
