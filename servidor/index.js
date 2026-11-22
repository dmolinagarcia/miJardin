// index.js — servidor web del jardín: la API y los archivos de publico/.
// Sin dependencias: solo Node 22.13 o posterior.

import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { join, normalize, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { leerConfig, abrirBase, prepararDatos } from './arranque.js';
import { manejarApi } from './api.js';
import { limpiarSesiones } from './auth.js';

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'", // los colores de cada planta van en atributos style
  "img-src 'self' data: https:",
  "connect-src 'self'",
  "font-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join('; ');

function cabecerasSeguridad(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', CSP);
}

function servirArchivo(req, res, raiz) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  let ruta;
  try {
    ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (ruta.endsWith('/')) ruta += 'index.html';
  const archivo = normalize(join(raiz, ruta));
  if (!archivo.startsWith(raiz + sep) || ruta.split('/').some((p) => p.startsWith('.'))) {
    res.writeHead(404).end();
    return;
  }
  let info;
  try {
    info = statSync(archivo);
    if (!info.isFile()) throw new Error();
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No encontrado');
    return;
  }
  const etag = `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
  const ext = extname(archivo).toLowerCase();
  // Fuentes e iconos cambian poco; el resto se revalida siempre (el service worker ya guarda copia).
  const cache = ['.woff2', '.png', '.ico'].includes(ext) ? 'public, max-age=604800' : 'no-cache';
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', cache);
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304).end();
    return;
  }
  res.writeHead(200, { 'Content-Type': TIPOS[ext] || 'application/octet-stream', 'Content-Length': info.size });
  if (req.method === 'HEAD') res.end();
  else createReadStream(archivo).pipe(res);
}

export async function crearServidor(cfg = leerConfig(), { log = console.log } = {}) {
  const db = abrirBase(cfg);
  await prepararDatos(db, cfg, log);
  limpiarSesiones(db);
  const limpieza = setInterval(() => limpiarSesiones(db), 6 * 3600 * 1000);
  limpieza.unref();

  const servidor = createServer((req, res) => {
    cabecerasSeguridad(res);
    if (req.url === '/api' || req.url.startsWith('/api/')) {
      manejarApi(req, res, { db, cfg });
    } else if (req.url === '/salud') {
      res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
    } else {
      servirArchivo(req, res, cfg.publico);
    }
  });
  servidor.on('close', () => {
    clearInterval(limpieza);
    db.close();
  });
  return { servidor, db };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cfg = leerConfig();
  const { servidor } = await crearServidor(cfg);
  servidor.listen(cfg.puerto, cfg.host, () => {
    console.log(`Jardín escuchando en http://${cfg.host === '0.0.0.0' ? 'localhost' : cfg.host}:${cfg.puerto}`);
    console.log(`Datos en ${cfg.datos}`);
  });
  const parar = () => servidor.close(() => process.exit(0));
  process.on('SIGTERM', parar);
  process.on('SIGINT', parar);
}
