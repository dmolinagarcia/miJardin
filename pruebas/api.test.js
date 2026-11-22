// Pruebas de la API: node --test pruebas/

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { crearServidor } from '../servidor/index.js';
import { leerConfig } from '../servidor/arranque.js';

let servidor;
let base;

before(async () => {
  const cfg = leerConfig({ DATOS: ':memory:', ADMIN_USUARIO: 'admin', ADMIN_CLAVE: 'clave-admin-1', PUERTO: '0' });
  ({ servidor } = await crearServidor(cfg, { log: () => {} }));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(() => new Promise((r) => servidor.close(r)));

function cliente() {
  let cookie = '';
  return async (metodo, ruta, cuerpo, cabeceras = {}) => {
    const r = await fetch(base + ruta, {
      method: metodo,
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(cuerpo ? { 'Content-Type': 'application/json' } : {}),
        Origin: base,
        ...cabeceras,
      },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    const c = r.headers.get('set-cookie');
    if (c) cookie = c.split(';')[0];
    return { status: r.status, datos: await r.json().catch(() => null) };
  };
}

test('sin sesión no se ve nada privado', async () => {
  const pedir = cliente();
  assert.equal((await pedir('GET', '/api/fichas')).status, 401);
  assert.equal((await pedir('GET', '/api/jardin')).status, 401);
  const cfg = await pedir('GET', '/api/config');
  assert.equal(cfg.status, 200);
  assert.equal(cfg.datos.registroAbierto, false);
});

test('archivos estáticos y protección de rutas', async () => {
  const r = await fetch(`${base}/`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/html/);
  assert.equal((await fetch(`${base}/../servidor/api.js`)).status, 404);
  assert.equal((await fetch(`${base}/%2e%2e/package.json`)).status, 404);
});

test('flujo completo: admin crea ficha y usuario, el usuario añade notas', async () => {
  const admin = cliente();
  assert.equal((await admin('POST', '/api/sesion', { usuario: 'admin', clave: 'mala' })).status, 401);
  const entrar = await admin('POST', '/api/sesion', { usuario: 'ADMIN', clave: 'clave-admin-1' });
  assert.equal(entrar.status, 200);
  assert.equal(entrar.datos.usuario.rol, 'admin');

  // El catálogo inicial viene de semillas/fichas
  const fichas = await admin('GET', '/api/fichas');
  assert.ok(fichas.datos.fichas.some((f) => f.id === 'granado'));

  // El jardín del admin parte de semillas/jardin.json
  const jardin = await admin('GET', '/api/jardin');
  assert.equal(jardin.datos.datos.nombre, 'Jardín de Colmenar');

  // Nueva ficha
  const nueva = await admin('POST', '/api/admin/fichas', { id: 'lavanda', texto: '# Lavanda\n' });
  assert.equal(nueva.status, 201);
  assert.equal((await admin('POST', '/api/admin/fichas', { id: 'lavanda', texto: 'x' })).status, 409);
  assert.equal((await admin('POST', '/api/admin/fichas', { id: '../x', texto: 'x' })).status, 400);

  // Nuevo usuario
  const alta = await admin('POST', '/api/admin/usuarios', { usuario: 'ana', nombre: 'Ana', clave: 'clave-ana-1' });
  assert.equal(alta.status, 201);

  const ana = cliente();
  assert.equal((await ana('POST', '/api/sesion', { usuario: 'ana', clave: 'clave-ana-1' })).status, 200);
  assert.equal((await ana('GET', '/api/admin/usuarios')).status, 403);
  assert.equal((await ana('PUT', '/api/admin/fichas/lavanda', { texto: 'hack', version: 1 })).status, 403);

  // Jardín vacío propio
  const jA = await ana('GET', '/api/jardin');
  assert.deepEqual(jA.datos.datos.plantas, []);
  assert.equal(jA.datos.datos.nombre, 'Jardín de Ana');

  // Notas
  const n1 = await ana('PUT', '/api/fichas/lavanda/notas', { texto: 'Mi lavanda está en el patio.', version: 0 });
  assert.equal(n1.status, 200);
  assert.equal(n1.datos.notas.version, 1);
  const conflicto = await ana('PUT', '/api/fichas/lavanda/notas', { texto: 'Otra cosa', version: 0 });
  assert.equal(conflicto.status, 409);
  assert.equal(conflicto.datos.conflicto, true);

  // El admin actualiza la base; las notas de Ana se conservan y la versión sube
  const act = await admin('PUT', '/api/admin/fichas/lavanda', { texto: '# Lavanda\n\nActualizada.\n', version: 1 });
  assert.equal(act.status, 200);
  assert.equal(act.datos.version, 2);
  assert.equal((await admin('PUT', '/api/admin/fichas/lavanda', { texto: 'vieja', version: 1 })).status, 409);

  const vista = await ana('GET', '/api/fichas/lavanda');
  assert.equal(vista.datos.ficha.version, 2);
  assert.match(vista.datos.ficha.texto, /Actualizada/);
  assert.equal(vista.datos.ficha.notas.texto, 'Mi lavanda está en el patio.');
  assert.equal(vista.datos.ficha.vista, 0);
  await ana('POST', '/api/fichas/lavanda/vista', { version: 2 });
  assert.equal((await ana('GET', '/api/fichas/lavanda')).datos.ficha.vista, 2);

  // Las notas de Ana no las ve el admin
  assert.equal((await admin('GET', '/api/fichas/lavanda')).datos.ficha.notas.texto, '');

  // Historial
  const h = await admin('GET', '/api/admin/fichas/lavanda/historial');
  assert.deepEqual(h.datos.versiones.map((v) => v.version), [2, 1]);

  // Archivar oculta la ficha a los usuarios
  await admin('POST', '/api/admin/fichas/lavanda/archivar', { archivada: true });
  assert.equal((await ana('GET', '/api/fichas/lavanda')).status, 404);
  await admin('POST', '/api/admin/fichas/lavanda/archivar', { archivada: false });
  assert.equal((await ana('GET', '/api/fichas/lavanda')).status, 200);

  // Jardín con control de versiones
  const g1 = await ana('PUT', '/api/jardin', { datos: { ...jA.datos.datos, nombre: 'Patio' }, version: jA.datos.version });
  assert.equal(g1.status, 200);
  assert.equal((await ana('PUT', '/api/jardin', { datos: { nombre: 'x' }, version: jA.datos.version })).status, 409);
  assert.equal((await ana('PUT', '/api/jardin', { datos: { nombre: 'y' }, version: 0, forzar: true })).status, 200);
});

test('protecciones de administración y de origen', async () => {
  const admin = cliente();
  await admin('POST', '/api/sesion', { usuario: 'admin', clave: 'clave-admin-1' });
  const { datos } = await admin('GET', '/api/admin/usuarios');
  const yo = datos.usuarios.find((u) => u.usuario === 'admin');
  assert.equal((await admin('PATCH', `/api/admin/usuarios/${yo.id}`, { rol: 'usuario' })).status, 400);
  assert.equal((await admin('DELETE', `/api/admin/usuarios/${yo.id}`)).status, 400);

  const ajeno = await admin('POST', '/api/admin/fichas', { id: 'x', texto: 'x' }, { Origin: 'https://malo.example' });
  assert.equal(ajeno.status, 403);
  const sinJson = await fetch(`${base}/api/sesion`, { method: 'POST', body: 'usuario=a', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  assert.equal(sinJson.status, 415);
});

test('cambio de contraseña cierra las otras sesiones', async () => {
  const a = cliente();
  const b = cliente();
  await a('POST', '/api/sesion', { usuario: 'ana', clave: 'clave-ana-1' });
  await b('POST', '/api/sesion', { usuario: 'ana', clave: 'clave-ana-1' });
  assert.equal((await a('PUT', '/api/yo/clave', { actual: 'clave-ana-1', nueva: 'clave-ana-2' })).status, 200);
  assert.equal((await a('GET', '/api/yo')).status, 200);
  assert.equal((await b('GET', '/api/yo')).status, 401);
});
