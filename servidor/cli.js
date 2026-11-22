// cli.js — tareas de administración desde la terminal del devbox.
//
//   node servidor/cli.js usuarios
//   node servidor/cli.js crear-usuario <usuario> [--admin] [--nombre "Nombre"]
//   node servidor/cli.js clave <usuario>
//   node servidor/cli.js importar-fichas <carpeta>     (crea o actualiza fichas del catálogo desde .md)
//   node servidor/cli.js exportar-fichas <carpeta>     (escribe el catálogo como .md)
//   node servidor/cli.js importar-jardin <usuario> <archivo.json>
//   node servidor/cli.js copia [archivo.db]                 (copia de la base de datos, en caliente)
//
// La contraseña se pide por la terminal, o se lee de la variable CLAVE.

import { createInterface } from 'node:readline/promises';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { leerConfig, abrirBase, leerFichasDeCarpeta } from './arranque.js';
import { crearUsuario, guardarFichaBase } from './api.js';
import { cifrarClave, validarClave, cerrarSesionesDe } from './auth.js';
import { ahora } from './db.js';

const [orden, ...resto] = process.argv.slice(2);
const opciones = { admin: resto.includes('--admin') };
const i = resto.indexOf('--nombre');
if (i >= 0) opciones.nombre = resto[i + 1];
const args = resto.filter((a, k) => !a.startsWith('--') && resto[k - 1] !== '--nombre');

const cfg = leerConfig();
const db = abrirBase(cfg);

async function pedirClave() {
  if (process.env.CLAVE) return process.env.CLAVE;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const clave = await rl.question('Contraseña (mínimo 8 caracteres): ');
  rl.close();
  return clave;
}

function usuarioPorNombre(u) {
  const fila = db.prepare('SELECT * FROM usuarios WHERE usuario = ?').get(u);
  if (!fila) throw new Error(`No existe el usuario «${u}».`);
  return fila;
}

const tareas = {
  usuarios() {
    const filas = db.prepare('SELECT usuario, nombre, rol, activo, ultimo_acceso FROM usuarios ORDER BY usuario').all();
    if (!filas.length) console.log('No hay usuarios.');
    for (const u of filas) console.log(`${u.usuario}\t${u.rol}${u.activo ? '' : ' (desactivado)'}\t${u.nombre}\t${u.ultimo_acceso || 'nunca'}`);
  },

  async 'crear-usuario'() {
    const [usuario] = args;
    if (!usuario) throw new Error('Uso: crear-usuario <usuario> [--admin] [--nombre "Nombre"]');
    const clave = await pedirClave();
    const u = await crearUsuario(db, { usuario, nombre: opciones.nombre || usuario, clave, rol: opciones.admin ? 'admin' : 'usuario' });
    console.log(`Creado «${u.usuario}» (${u.rol}).`);
  },

  async clave() {
    const u = usuarioPorNombre(args[0]);
    const clave = await pedirClave();
    const error = validarClave(clave);
    if (error) throw new Error(error);
    db.prepare('UPDATE usuarios SET clave = ?, activo = 1 WHERE id = ?').run(await cifrarClave(clave), u.id);
    cerrarSesionesDe(db, u.id);
    console.log(`Contraseña de «${u.usuario}» cambiada. Sus sesiones abiertas se han cerrado.`);
  },

  'importar-fichas'() {
    const carpeta = args[0] || join(cfg.semillas, 'fichas');
    let nuevas = 0;
    let cambiadas = 0;
    for (const f of leerFichasDeCarpeta(carpeta)) {
      const actual = db.prepare('SELECT texto FROM fichas WHERE id = ?').get(f.id);
      if (!actual) {
        guardarFichaBase(db, { id: f.id, texto: f.texto, crear: true });
        nuevas++;
      } else if (actual.texto.trimEnd() !== f.texto.trimEnd()) {
        guardarFichaBase(db, { id: f.id, texto: f.texto });
        cambiadas++;
      }
    }
    console.log(`Fichas nuevas: ${nuevas}. Actualizadas: ${cambiadas}.`);
  },

  'exportar-fichas'() {
    const carpeta = args[0];
    if (!carpeta) throw new Error('Uso: exportar-fichas <carpeta>');
    mkdirSync(carpeta, { recursive: true });
    const filas = db.prepare('SELECT id, texto FROM fichas WHERE archivada = 0').all();
    for (const f of filas) writeFileSync(join(carpeta, `${f.id}.md`), f.texto.endsWith('\n') ? f.texto : `${f.texto}\n`);
    console.log(`${filas.length} fichas escritas en ${carpeta}.`);
  },

  copia() {
    const fecha = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const destino = args[0] || join(cfg.datos, 'copias', `jardin-${fecha}.db`);
    if (existsSync(destino)) throw new Error(`Ya existe ${destino}.`);
    mkdirSync(dirname(destino), { recursive: true });
    db.exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
    console.log(`Copia hecha en ${destino}`);
  },

  'importar-jardin'() {
    const [usuario, archivo] = args;
    if (!usuario || !archivo) throw new Error('Uso: importar-jardin <usuario> <archivo.json>');
    const u = usuarioPorNombre(usuario);
    const datos = JSON.parse(readFileSync(archivo, 'utf8'));
    db.prepare(
      `INSERT INTO jardines (usuario_id, datos, version, actualizado) VALUES (?, ?, 1, ?)
       ON CONFLICT (usuario_id) DO UPDATE SET datos = excluded.datos, version = version + 1, actualizado = excluded.actualizado`,
    ).run(u.id, JSON.stringify(datos), ahora());
    console.log(`Jardín de «${u.usuario}» sustituido por ${archivo}.`);
  },
};

try {
  if (!tareas[orden]) {
    console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).slice(0, 11).join('\n').replace(/^\/\/ ?/gm, ''));
    process.exitCode = orden ? 1 : 0;
  } else {
    await tareas[orden]();
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  db.close();
}
