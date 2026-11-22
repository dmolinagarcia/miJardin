// api.js — la API JSON en /api/…
//
// Públicas:  GET /api/config · POST /api/sesion · POST /api/registro (si está abierto)
//            POST /api/stripe/aviso (avisos firmados de Stripe)
// Con sesión: /api/yo · /api/fichas · /api/fichas/:id/notas · /api/jardin · /api/suscripcion/…
// Solo admin: /api/admin/fichas · /api/admin/usuarios

import { ahora, transaccion } from './db.js';
import * as auth from './auth.js';
import * as sus from './suscripcion.js';

const RE_FICHA = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/;
const RE_USUARIO = /^[a-z0-9][a-z0-9._-]{1,39}$/i;
const MAX_FICHA = 200_000;
const MAX_NOTAS = 100_000;
const MAX_JARDIN = 1_000_000;

class ErrorApi extends Error {
  constructor(status, mensaje, extra = {}) {
    super(mensaje);
    this.status = status;
    this.extra = extra;
  }
}
const fallo = (status, mensaje, extra) => {
  throw new ErrorApi(status, mensaje, extra);
};

export function jardinVacio(nombre) {
  return {
    nombre: nombre ? `Jardín de ${nombre}` : 'Mi jardín',
    fichas: [],
    plano: { contorno: [[0, 0], [10, 0], [10, 6], [0, 6]], zonas: [] },
    plantas: [],
  };
}

// ---------- Utilidades de petición ----------

async function leerCrudo(req, limite) {
  const trozos = [];
  let total = 0;
  for await (const t of req) {
    total += t.length;
    if (total > limite) fallo(413, 'El contenido es demasiado grande.');
    trozos.push(t);
  }
  return Buffer.concat(trozos);
}

// Dirección pública de la web, para los enlaces de vuelta desde Stripe.
function baseDe(req, cfg) {
  if (cfg.urlPublica) return cfg.urlPublica.replace(/\/+$/, '');
  const cab = (n) => String(req.headers[n] || '').split(',')[0].trim();
  const proto = (cfg.confiarProxy && cab('x-forwarded-proto')) || (req.socket.encrypted ? 'https' : 'http');
  const host = (cfg.confiarProxy && cab('x-forwarded-host')) || cab('host');
  return `${proto}://${host}`;
}

function contarPlantas(datos) {
  return Array.isArray(datos?.plantas) ? datos.plantas.length : 0;
}

async function leerCuerpo(req, limite) {
  const tipo = String(req.headers['content-type'] || '');
  const sinCuerpo = !req.headers['transfer-encoding'] && Number(req.headers['content-length'] || 0) === 0;
  if (sinCuerpo && !tipo) return {};
  if (!/^application\/json\b/i.test(tipo)) fallo(415, 'La petición debe ser JSON.');
  const trozos = [];
  let total = 0;
  for await (const t of req) {
    total += t.length;
    if (total > limite) fallo(413, 'El contenido es demasiado grande.');
    trozos.push(t);
  }
  try {
    const v = JSON.parse(Buffer.concat(trozos).toString('utf8') || '{}');
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error();
    return v;
  } catch {
    fallo(400, 'El contenido no es un JSON válido.');
  }
}

const texto = (v, nombre, max) => {
  if (typeof v !== 'string') fallo(400, `Falta «${nombre}».`);
  const t = v.replace(/\r\n?/g, '\n');
  if (t.length > max) fallo(413, `«${nombre}» es demasiado largo.`);
  return t;
};

const entero = (v) => (Number.isInteger(v) && v >= 0 ? v : null);

function nombreValido(n) {
  const t = String(n ?? '').trim();
  if (!t) fallo(400, 'Escribe un nombre.');
  if (t.length > 80) fallo(400, 'El nombre es demasiado largo.');
  return t;
}

function usuarioValido(u) {
  const t = String(u ?? '').trim();
  if (!RE_USUARIO.test(t)) fallo(400, 'El usuario debe tener entre 2 y 40 caracteres: letras sin tildes, números, punto, guion o guion bajo.');
  return t;
}

// ---------- Datos ----------

function filaFicha(f) {
  return { id: f.id, texto: f.texto, version: f.version, actualizada: f.actualizada, archivada: Boolean(f.archivada) };
}

function fichasDeUsuario(db, usuarioId, id = null) {
  const filas = db
    .prepare(
      `SELECT f.id, f.texto, f.version, f.actualizada, f.archivada,
              n.texto AS n_texto, n.version AS n_version, n.actualizada AS n_actualizada, n.version_vista
       FROM fichas f LEFT JOIN notas n ON n.ficha_id = f.id AND n.usuario_id = ?
       WHERE f.archivada = 0 ${id ? 'AND f.id = ?' : ''} ORDER BY f.id`,
    )
    .all(...(id ? [usuarioId, id] : [usuarioId]));
  return filas.map((f) => ({
    ...filaFicha(f),
    notas: { texto: f.n_texto ?? '', version: f.n_version ?? 0, actualizada: f.n_actualizada ?? null },
    vista: f.version_vista ?? 0,
  }));
}

function jardinDe(db, usuario) {
  let fila = db.prepare('SELECT datos, version, actualizado FROM jardines WHERE usuario_id = ?').get(usuario.id);
  if (!fila) {
    const datos = JSON.stringify(jardinVacio(usuario.nombre));
    db.prepare('INSERT OR IGNORE INTO jardines (usuario_id, datos, version, actualizado) VALUES (?, ?, 1, ?)').run(usuario.id, datos, ahora());
    fila = db.prepare('SELECT datos, version, actualizado FROM jardines WHERE usuario_id = ?').get(usuario.id);
  }
  return { datos: JSON.parse(fila.datos), version: fila.version, actualizado: fila.actualizado };
}

function publicoUsuario(u) {
  return { id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol };
}

function adminsActivos(db) {
  return db.prepare("SELECT COUNT(*) AS n FROM usuarios WHERE rol = 'admin' AND activo = 1").get().n;
}

export async function crearUsuario(db, { usuario, nombre, clave, rol = 'usuario' }) {
  const u = usuarioValido(usuario);
  const n = nombreValido(nombre || u);
  const error = auth.validarClave(clave);
  if (error) fallo(400, error);
  if (!['admin', 'usuario'].includes(rol)) fallo(400, 'Rol no válido.');
  if (db.prepare('SELECT 1 FROM usuarios WHERE usuario = ?').get(u)) fallo(409, `Ya existe el usuario «${u}».`);
  const hash = await auth.cifrarClave(clave);
  const r = db.prepare('INSERT INTO usuarios (usuario, nombre, clave, rol, creado) VALUES (?, ?, ?, ?, ?)').run(u, n, hash, rol, ahora());
  return { id: Number(r.lastInsertRowid), usuario: u, nombre: n, rol };
}

export function guardarFichaBase(db, { id, texto: t, autorId = null, versionEsperada = null, crear = false }) {
  return transaccion(db, () => {
    const actual = db.prepare('SELECT version, texto FROM fichas WHERE id = ?').get(id);
    if (crear && actual) fallo(409, `Ya existe una ficha con el identificador «${id}».`);
    if (!crear && !actual) fallo(404, 'No existe esa ficha.');
    if (actual && versionEsperada !== null && actual.version !== versionEsperada) {
      fallo(409, 'La ficha ha cambiado desde que la abriste.', { conflicto: true, actual: { version: actual.version, texto: actual.texto } });
    }
    const fecha = ahora();
    const version = actual ? actual.version + 1 : 1;
    if (actual) {
      db.prepare('UPDATE fichas SET texto = ?, version = ?, actualizada = ?, autor_id = ? WHERE id = ?').run(t, version, fecha, autorId, id);
    } else {
      db.prepare('INSERT INTO fichas (id, texto, version, creada, actualizada, autor_id) VALUES (?, ?, 1, ?, ?, ?)').run(id, t, fecha, fecha, autorId);
    }
    db.prepare('INSERT INTO fichas_historial (ficha_id, version, texto, fecha, autor_id) VALUES (?, ?, ?, ?, ?)').run(id, version, t, fecha, autorId);
    return { id, version, actualizada: fecha };
  });
}

// ---------- Rutas ----------

const rutas = [];
const ruta = (metodo, patron, opciones, fn) => {
  const claves = [];
  const re = new RegExp(`^${patron.replace(/:(\w+)/g, (_, k) => (claves.push(k), '([^/]+)'))}$`);
  rutas.push({ metodo, re, claves, ...opciones, fn });
};
const publica = { publica: true };
const conSesion = {};
const soloAdmin = { admin: true };

// --- Sesión y cuenta ---

ruta('GET', '/api/config', publica, async ({ db, cfg }) => ({
  registroAbierto: cfg.registroAbierto,
  sinUsuarios: db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n === 0,
  limitePlantas: cfg.limitePlantas,
  pagos: sus.pagosActivos(cfg),
  precio: await sus.textoPrecio(cfg),
}));

ruta('POST', '/api/sesion', publica, async ({ db, req, ip, cuerpo, res, cfg }) => {
  const usuario = String(cuerpo.usuario ?? '').trim().toLowerCase();
  const clave = String(cuerpo.clave ?? '');
  const claves = [`ip:${ip}`, `u:${usuario}`];
  if (auth.bloqueado(...claves)) fallo(429, 'Demasiados intentos fallidos. Espera unos minutos y prueba otra vez.');
  const fila = usuario ? db.prepare('SELECT * FROM usuarios WHERE usuario = ?').get(usuario) : null;
  const ok = await auth.comprobarClave(clave, fila?.clave);
  if (!ok || !fila.activo) {
    auth.anotarFallo(...claves);
    fallo(401, fila && ok && !fila.activo ? 'Esta cuenta está desactivada.' : 'Usuario o contraseña incorrectos.');
  }
  auth.borrarFallos(...claves);
  const token = auth.crearSesion(db, fila.id);
  res.setHeader('Set-Cookie', auth.cookieSesion(token, cfg.cookieSegura(req)));
  return { usuario: publicoUsuario(fila) };
});

ruta('DELETE', '/api/sesion', publica, ({ db, yo, res, req, cfg }) => {
  if (yo) auth.cerrarSesion(db, yo.sesion);
  res.setHeader('Set-Cookie', auth.cookieBorrada(cfg.cookieSegura(req)));
  return { ok: true };
});

ruta('POST', '/api/registro', publica, async ({ db, cuerpo, res, req, cfg, ip }) => {
  if (!cfg.registroAbierto) fallo(403, 'El registro está cerrado. Pide una cuenta a quien administra la web.');
  if (auth.bloqueado(`reg:${ip}`)) fallo(429, 'Demasiadas cuentas nuevas desde esta conexión. Prueba más tarde.');
  const u = await crearUsuario(db, { usuario: cuerpo.usuario, nombre: cuerpo.nombre, clave: cuerpo.clave });
  auth.anotarFallo(`reg:${ip}`); // cuenta también las altas, para frenar altas masivas
  const token = auth.crearSesion(db, u.id);
  res.setHeader('Set-Cookie', auth.cookieSesion(token, cfg.cookieSegura(req)));
  res.statusCode = 201;
  return { usuario: u };
});

ruta('GET', '/api/yo', conSesion, async ({ db, cfg, yo }) => ({
  usuario: publicoUsuario(yo),
  suscripcion: await sus.refrescarSiHaceFalta(db, cfg, yo.id),
}));

ruta('PATCH', '/api/yo', conSesion, ({ db, yo, cuerpo }) => {
  const nombre = nombreValido(cuerpo.nombre);
  db.prepare('UPDATE usuarios SET nombre = ? WHERE id = ?').run(nombre, yo.id);
  return { usuario: { ...publicoUsuario(yo), nombre } };
});

ruta('PUT', '/api/yo/clave', conSesion, async ({ db, yo, cuerpo }) => {
  const fila = db.prepare('SELECT clave FROM usuarios WHERE id = ?').get(yo.id);
  if (!(await auth.comprobarClave(String(cuerpo.actual ?? ''), fila.clave))) fallo(400, 'La contraseña actual no es correcta.');
  const error = auth.validarClave(cuerpo.nueva);
  if (error) fallo(400, error);
  db.prepare('UPDATE usuarios SET clave = ? WHERE id = ?').run(await auth.cifrarClave(cuerpo.nueva), yo.id);
  auth.cerrarSesionesDe(db, yo.id, yo.sesion);
  return { ok: true };
});

// --- Fichas del catálogo, con las notas de cada usuario ---

ruta('GET', '/api/fichas', conSesion, ({ db, yo }) => ({ fichas: fichasDeUsuario(db, yo.id) }));

ruta('GET', '/api/fichas/:id', conSesion, ({ db, yo, p }) => {
  const [f] = fichasDeUsuario(db, yo.id, p.id);
  if (!f) fallo(404, 'No existe esa ficha.');
  return { ficha: f };
});

ruta('PUT', '/api/fichas/:id/notas', conSesion, ({ db, yo, p, cuerpo }) => {
  const t = texto(cuerpo.texto, 'texto', MAX_NOTAS);
  const esperada = entero(cuerpo.version);
  return transaccion(db, () => {
    if (!db.prepare('SELECT 1 FROM fichas WHERE id = ? AND archivada = 0').get(p.id)) fallo(404, 'No existe esa ficha.');
    const actual = db.prepare('SELECT texto, version FROM notas WHERE usuario_id = ? AND ficha_id = ?').get(yo.id, p.id);
    const versionActual = actual?.version ?? 0;
    if (!cuerpo.forzar && esperada !== null && esperada !== versionActual) {
      fallo(409, 'Tus notas han cambiado desde otro dispositivo.', { conflicto: true, actual: { version: versionActual, texto: actual?.texto ?? '' } });
    }
    const fecha = ahora();
    const version = versionActual + 1;
    db.prepare(
      `INSERT INTO notas (usuario_id, ficha_id, texto, version, actualizada) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (usuario_id, ficha_id) DO UPDATE SET texto = excluded.texto, version = excluded.version, actualizada = excluded.actualizada`,
    ).run(yo.id, p.id, t, version, fecha);
    return { notas: { texto: t, version, actualizada: fecha } };
  });
});

ruta('POST', '/api/fichas/:id/vista', conSesion, ({ db, yo, p, cuerpo }) => {
  const v = entero(cuerpo.version);
  if (v === null) fallo(400, 'Falta la versión.');
  db.prepare(
    `INSERT INTO notas (usuario_id, ficha_id, version_vista) VALUES (?, ?, ?)
     ON CONFLICT (usuario_id, ficha_id) DO UPDATE SET version_vista = MAX(version_vista, excluded.version_vista)`,
  ).run(yo.id, p.id, v);
  return { ok: true };
});

// --- El jardín de cada usuario ---

ruta('GET', '/api/jardin', conSesion, ({ db, yo }) => jardinDe(db, yo));

ruta('PUT', '/api/jardin', conSesion, ({ db, cfg, yo, cuerpo }) => {
  const datos = cuerpo.datos;
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) fallo(400, 'Los datos del jardín deben ser un objeto.');
  const json = JSON.stringify(datos);
  if (json.length > MAX_JARDIN) fallo(413, 'Los datos del jardín son demasiado grandes.');
  const esperada = entero(cuerpo.version);
  return transaccion(db, () => {
    const actual = jardinDe(db, yo);
    if (!cuerpo.forzar && esperada !== null && esperada !== actual.version) {
      fallo(409, 'El jardín ha cambiado desde otro dispositivo.', { conflicto: true, actual });
    }
    // Plan gratuito: no se puede pasar del límite. Quien ya lo pasaba (p. ej. al acabar la
    // suscripción) conserva sus plantas y puede moverlas o quitarlas, pero no añadir más.
    const n = contarPlantas(datos);
    if (n > cfg.limitePlantas && n > contarPlantas(actual.datos) && !sus.esPremium(db, cfg, yo.id)) {
      fallo(402, `Con el plan gratuito puedes tener hasta ${cfg.limitePlantas} plantas en el plano. Para añadir más, suscríbete.`, {
        limite: cfg.limitePlantas,
      });
    }
    const fecha = ahora();
    db.prepare('UPDATE jardines SET datos = ?, version = ?, actualizado = ? WHERE usuario_id = ?').run(json, actual.version + 1, fecha, yo.id);
    return { datos, version: actual.version + 1, actualizado: fecha };
  });
});

// --- Suscripción ---

ruta('POST', '/api/suscripcion/pagar', conSesion, async ({ db, cfg, yo, req }) => {
  if (!sus.pagosActivos(cfg)) fallo(503, 'Los pagos no están configurados en este servidor.');
  if (yo.rol === 'admin') fallo(400, 'Las cuentas de administración no tienen límite de plantas.');
  return { url: await sus.crearPago(db, cfg, yo.id, baseDe(req, cfg)) };
});

ruta('POST', '/api/suscripcion/portal', conSesion, async ({ db, cfg, yo, req }) => {
  if (!sus.pagosActivos(cfg)) fallo(503, 'Los pagos no están configurados en este servidor.');
  return { url: await sus.crearPortal(db, cfg, yo.id, baseDe(req, cfg)) };
});

ruta('POST', '/api/suscripcion/sincronizar', conSesion, async ({ db, cfg, yo }) => ({
  suscripcion: await sus.sincronizar(db, cfg, yo.id),
}));

ruta('POST', '/api/stripe/aviso', { publica: true, externa: true, crudo: true }, async ({ db, cfg, req, crudo }) =>
  sus.recibirAviso(db, cfg, crudo, req.headers['stripe-signature']),
);

// --- Administración: catálogo de fichas ---

ruta('GET', '/api/admin/fichas', soloAdmin, ({ db }) => ({
  fichas: db
    .prepare(
      `SELECT f.*, u.nombre AS autor,
         (SELECT COUNT(*) FROM notas n WHERE n.ficha_id = f.id AND n.texto <> '') AS con_notas
       FROM fichas f LEFT JOIN usuarios u ON u.id = f.autor_id ORDER BY f.archivada, f.id`,
    )
    .all()
    .map((f) => ({ ...filaFicha(f), creada: f.creada, autor: f.autor, conNotas: f.con_notas })),
}));

ruta('POST', '/api/admin/fichas', soloAdmin, ({ db, yo, cuerpo, res }) => {
  const id = String(cuerpo.id ?? '');
  if (!RE_FICHA.test(id)) fallo(400, 'El identificador solo puede tener minúsculas sin tildes, números y guiones.');
  const t = texto(cuerpo.texto, 'texto', MAX_FICHA);
  if (!t.trim()) fallo(400, 'La ficha está vacía.');
  res.statusCode = 201;
  return guardarFichaBase(db, { id, texto: t, autorId: yo.id, crear: true });
});

ruta('PUT', '/api/admin/fichas/:id', soloAdmin, ({ db, yo, p, cuerpo }) => {
  const t = texto(cuerpo.texto, 'texto', MAX_FICHA);
  if (!t.trim()) fallo(400, 'La ficha está vacía.');
  return guardarFichaBase(db, { id: p.id, texto: t, autorId: yo.id, versionEsperada: cuerpo.forzar ? null : entero(cuerpo.version) });
});

ruta('POST', '/api/admin/fichas/:id/archivar', soloAdmin, ({ db, p, cuerpo }) => {
  const r = db.prepare('UPDATE fichas SET archivada = ? WHERE id = ?').run(cuerpo.archivada === false ? 0 : 1, p.id);
  if (!r.changes) fallo(404, 'No existe esa ficha.');
  return { ok: true };
});

ruta('DELETE', '/api/admin/fichas/:id', soloAdmin, ({ db, p }) => {
  const f = db.prepare('SELECT archivada FROM fichas WHERE id = ?').get(p.id);
  if (!f) fallo(404, 'No existe esa ficha.');
  if (!f.archivada) fallo(400, 'Archiva la ficha antes de borrarla para siempre.');
  transaccion(db, () => {
    db.prepare('DELETE FROM fichas WHERE id = ?').run(p.id);
    db.prepare('DELETE FROM fichas_historial WHERE ficha_id = ?').run(p.id);
    db.prepare('DELETE FROM notas WHERE ficha_id = ?').run(p.id);
  });
  return { ok: true };
});

ruta('GET', '/api/admin/fichas/:id/historial', soloAdmin, ({ db, p }) => ({
  versiones: db
    .prepare(
      `SELECT h.version, h.fecha, h.texto, u.nombre AS autor FROM fichas_historial h
       LEFT JOIN usuarios u ON u.id = h.autor_id WHERE h.ficha_id = ? ORDER BY h.version DESC LIMIT 50`,
    )
    .all(p.id),
}));

// --- Administración: usuarios ---

ruta('GET', '/api/admin/usuarios', soloAdmin, ({ db, cfg }) => ({
  usuarios: db
    .prepare(
      `SELECT u.*, COALESCE(json_array_length(j.datos, '$.plantas'), 0) AS plantas
       FROM usuarios u LEFT JOIN jardines j ON j.usuario_id = u.id ORDER BY u.usuario`,
    )
    .all()
    .map((u) => ({
      id: u.id,
      usuario: u.usuario,
      nombre: u.nombre,
      rol: u.rol,
      activo: Boolean(u.activo),
      creado: u.creado,
      ultimo_acceso: u.ultimo_acceso,
      plantas: u.plantas,
      premiumManual: Boolean(u.premium_manual),
      suscripcion: sus.estadoDe(u, cfg),
    })),
}));

ruta('POST', '/api/admin/usuarios', soloAdmin, async ({ db, cuerpo, res }) => {
  res.statusCode = 201;
  return { usuario: await crearUsuario(db, cuerpo) };
});

ruta('PATCH', '/api/admin/usuarios/:id', soloAdmin, async ({ db, yo, p, cuerpo }) => {
  const id = Number(p.id);
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
  if (!u) fallo(404, 'No existe ese usuario.');
  const cambios = {};
  if (cuerpo.nombre !== undefined) cambios.nombre = nombreValido(cuerpo.nombre);
  if (cuerpo.rol !== undefined) {
    if (!['admin', 'usuario'].includes(cuerpo.rol)) fallo(400, 'Rol no válido.');
    cambios.rol = cuerpo.rol;
  }
  if (cuerpo.activo !== undefined) cambios.activo = cuerpo.activo ? 1 : 0;
  if (cuerpo.premium !== undefined) cambios.premium_manual = cuerpo.premium ? 1 : 0;
  if (cuerpo.clave !== undefined) {
    const error = auth.validarClave(cuerpo.clave);
    if (error) fallo(400, error);
    cambios.clave = await auth.cifrarClave(cuerpo.clave);
  }
  const dejaDeSerAdmin = u.rol === 'admin' && u.activo && (cambios.rol === 'usuario' || cambios.activo === 0);
  if (dejaDeSerAdmin && id === yo.id) fallo(400, 'No puedes quitarte a ti el permiso de administración ni desactivar tu cuenta.');
  if (dejaDeSerAdmin && adminsActivos(db) <= 1) fallo(400, 'Tiene que quedar al menos un administrador activo.');
  const claves = Object.keys(cambios);
  if (claves.length) {
    db.prepare(`UPDATE usuarios SET ${claves.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...claves.map((k) => cambios[k]), id);
  }
  if (cambios.clave || cambios.activo === 0) auth.cerrarSesionesDe(db, id, id === yo.id ? yo.sesion : null);
  const fila = db.prepare('SELECT id, usuario, nombre, rol, activo FROM usuarios WHERE id = ?').get(id);
  return { usuario: { ...fila, activo: Boolean(fila.activo) } };
});

ruta('DELETE', '/api/admin/usuarios/:id', soloAdmin, ({ db, yo, p }) => {
  const id = Number(p.id);
  if (id === yo.id) fallo(400, 'No puedes borrar tu propia cuenta.');
  const u = db.prepare('SELECT rol, activo FROM usuarios WHERE id = ?').get(id);
  if (!u) fallo(404, 'No existe ese usuario.');
  if (u.rol === 'admin' && u.activo && adminsActivos(db) <= 1) fallo(400, 'Tiene que quedar al menos un administrador activo.');
  db.prepare('DELETE FROM usuarios WHERE id = ?').run(id);
  return { ok: true };
});

// ---------- Entrada ----------

export async function manejarApi(req, res, ctx) {
  const { db, cfg } = ctx;
  const url = new URL(req.url, 'http://x');
  const enviar = (status, datos) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(datos));
  };
  try {
    const metodo = req.method === 'HEAD' ? 'GET' : req.method;
    const candidatas = rutas.filter((r) => r.re.test(url.pathname));
    if (!candidatas.length) fallo(404, 'No existe esa dirección de la API.');
    const r = candidatas.find((x) => x.metodo === metodo);
    if (!r) fallo(405, 'Método no permitido.');

    // Las peticiones que cambian algo tienen que venir de esta misma web (salvo los avisos de Stripe, que van firmados).
    if (metodo !== 'GET' && !r.externa && !cfg.mismoOrigen(req)) fallo(403, 'Petición rechazada: no viene de esta web.');

    const yo = auth.usuarioDeSesion(db, req);
    if (!r.publica && !yo) fallo(401, 'Tienes que entrar con tu usuario.');
    if (r.admin && yo.rol !== 'admin') fallo(403, 'Solo para administradores.');

    const m = url.pathname.match(r.re);
    const p = Object.fromEntries(r.claves.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    const crudo = r.crudo ? await leerCrudo(req, 1_000_000) : null;
    const cuerpo = !r.crudo && ['POST', 'PUT', 'PATCH'].includes(metodo)
      ? await leerCuerpo(req, url.pathname.startsWith('/api/admin/fichas') ? MAX_FICHA * 2 : MAX_JARDIN + 10_000)
      : {};
    const datos = await r.fn({ ...ctx, req, res, yo, p, cuerpo, crudo, ip: cfg.ipDe(req), url });
    enviar(res.statusCode && res.statusCode !== 200 ? res.statusCode : 200, datos);
  } catch (e) {
    if (e instanceof ErrorApi) {
      enviar(e.status, { error: e.message, ...e.extra });
    } else if (Number.isInteger(e.status) && e.status >= 400) {
      enviar(e.status, { error: e.message });
    } else {
      console.error(e);
      enviar(500, { error: 'Error interno del servidor.' });
    }
  }
}
