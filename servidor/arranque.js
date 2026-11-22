// arranque.js — configuración desde variables de entorno y datos iniciales.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrir, ahora } from './db.js';
import { crearUsuario, guardarFichaBase } from './api.js';

export const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

const si = (v) => /^(1|si|sí|true|yes|on)$/i.test(String(v ?? '').trim());

export function leerConfig(env = process.env) {
  const confiarProxy = si(env.CONFIAR_PROXY);
  const cookie = String(env.COOKIE_SEGURA || 'auto').toLowerCase();
  const cabecera = (req, nombre) => String(req.headers[nombre] || '').split(',')[0].trim();
  const hostDe = (req) => (confiarProxy && cabecera(req, 'x-forwarded-host')) || String(req.headers.host || '');
  return {
    puerto: Number(env.PUERTO || env.PORT || 8080),
    host: env.HOST || '0.0.0.0',
    datos: env.DATOS || join(RAIZ, 'datos'),
    publico: join(RAIZ, 'publico'),
    semillas: env.SEMILLAS || join(RAIZ, 'semillas'),
    registroAbierto: si(env.REGISTRO_ABIERTO),
    confiarProxy,
    ipDe: (req) => (confiarProxy && cabecera(req, 'x-forwarded-for')) || req.socket.remoteAddress || '',
    cookieSegura: (req) => {
      if (cookie === 'si' || cookie === 'sí' || cookie === 'true' || cookie === '1') return true;
      if (cookie === 'no' || cookie === 'false' || cookie === '0') return false;
      return Boolean(req.socket.encrypted) || (confiarProxy && cabecera(req, 'x-forwarded-proto') === 'https');
    },
    // Las peticiones que cambian datos solo se aceptan desde la propia web.
    mismoOrigen: (req) => {
      const origen = req.headers.origin;
      if (origen) {
        try {
          return new URL(origen).host === hostDe(req);
        } catch {
          return false;
        }
      }
      const sitio = req.headers['sec-fetch-site'];
      return !sitio || sitio === 'same-origin' || sitio === 'none';
    },
    adminUsuario: env.ADMIN_USUARIO || '',
    adminClave: env.ADMIN_CLAVE || '',
  };
}

export function abrirBase(cfg) {
  return abrir(cfg.datos === ':memory:' ? ':memory:' : join(cfg.datos, 'jardin.db'));
}

export function leerFichasDeCarpeta(carpeta) {
  if (!existsSync(carpeta)) return [];
  return readdirSync(carpeta)
    .filter((n) => n.endsWith('.md'))
    .sort()
    .map((n) => ({ id: basename(n, '.md').toLowerCase(), texto: readFileSync(join(carpeta, n), 'utf8').replace(/\r\n?/g, '\n') }));
}

// Primera vez: carga el catálogo de semillas/fichas y crea el administrador si se ha indicado.
export async function prepararDatos(db, cfg, log = console.log) {
  const hayFichas = db.prepare('SELECT COUNT(*) AS n FROM fichas').get().n > 0;
  if (!hayFichas) {
    const fichas = leerFichasDeCarpeta(join(cfg.semillas, 'fichas'));
    for (const f of fichas) guardarFichaBase(db, { id: f.id, texto: f.texto, crear: true });
    if (fichas.length) log(`Catálogo inicial: ${fichas.length} fichas importadas de ${join(cfg.semillas, 'fichas')}.`);
  }

  const hayUsuarios = db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n > 0;
  if (hayUsuarios) return;
  if (cfg.adminUsuario && cfg.adminClave) {
    const u = await crearUsuario(db, { usuario: cfg.adminUsuario, nombre: cfg.adminUsuario, clave: cfg.adminClave, rol: 'admin' });
    log(`Creado el administrador «${u.usuario}».`);
    const semilla = join(cfg.semillas, 'jardin.json');
    if (existsSync(semilla)) {
      const datos = JSON.parse(readFileSync(semilla, 'utf8'));
      db.prepare('INSERT INTO jardines (usuario_id, datos, version, actualizado) VALUES (?, ?, 1, ?)').run(u.id, JSON.stringify(datos), ahora());
      log(`Su jardín parte de ${semilla}.`);
    }
  } else {
    log('Todavía no hay usuarios. Crea el primer administrador con:');
    log('  node servidor/cli.js crear-usuario TU_USUARIO --admin');
    log('o arranca con las variables ADMIN_USUARIO y ADMIN_CLAVE.');
  }
}
