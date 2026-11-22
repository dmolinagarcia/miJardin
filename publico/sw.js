// sw.js — service worker: la web se abre sin conexión y se puede instalar como app.
//  · Archivos de la web: primero la red (así siempre llega la última versión); sin conexión, la caché.
//  · Datos (/api/… GET): primero la red; sin conexión, la última copia guardada.
//  · Lo que guarda cambios (POST, PUT…) va siempre a la red.

const VERSION = 'v2-2';
const WEB = `jardin-web-${VERSION}`;
const DATOS = 'jardin-datos';

const ARCHIVOS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'assets/css/estilo.css',
  'assets/icono.svg',
  'assets/icono-192.png',
  'assets/fuentes/atkinson-hyperlegible-next-latin-wght-normal.woff2',
  'assets/fuentes/literata-latin-wght-normal.woff2',
  'assets/fuentes/literata-latin-wght-italic.woff2',
  ...[
    'api', 'app', 'estado', 'instalar', 'linea', 'md', 'plano', 'rutas', 'suscripcion', 'ui',
    'vista-admin', 'vista-ajustes', 'vista-entrar', 'vista-fichas', 'vista-plano', 'vista-temporada',
  ].map((n) => `assets/js/${n}.js`),
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(WEB)
      .then((c) => c.addAll(ARCHIVOS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((nombres) => Promise.all(nombres.filter((n) => n.startsWith('jardin-web-') && n !== WEB).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

async function primeroRed(peticion) {
  const cache = await caches.open(DATOS);
  try {
    const r = await fetch(peticion);
    if (r.ok) cache.put(peticion, r.clone());
    // Sin sesión: se borra la copia, para que nadie vea los datos de otro en este dispositivo.
    if (r.status === 401) await caches.delete(DATOS);
    return r;
  } catch (e) {
    const copia = await cache.match(peticion);
    if (copia) return copia;
    throw e;
  }
}

async function web(peticion) {
  const cache = await caches.open(WEB);
  try {
    const r = await fetch(peticion);
    if (r.ok) cache.put(peticion, r.clone());
    return r;
  } catch (e) {
    const copia = await cache.match(peticion, { ignoreSearch: true });
    if (copia) return copia;
    if (peticion.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
    throw e;
  }
}

self.addEventListener('fetch', (e) => {
  const peticion = e.request;
  const url = new URL(peticion.url);
  if (peticion.method !== 'GET' || url.origin !== self.location.origin) return;
  const ruta = url.pathname.slice(new URL(self.registration.scope).pathname.length - 1);
  if (ruta.startsWith('/api/')) {
    e.respondWith(primeroRed(peticion));
  } else {
    e.respondWith(web(peticion));
  }
});
