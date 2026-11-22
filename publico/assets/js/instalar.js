// instalar.js — service worker y botón «Instalar la app».

let peticion = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  peticion = e;
  window.dispatchEvent(new Event('jardin:instalable'));
});

window.addEventListener('appinstalled', () => {
  peticion = null;
});

export const puedeInstalar = () => Boolean(peticion);
export const instalada = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export async function instalar() {
  if (!peticion) return 'no-disponible';
  const p = peticion;
  peticion = null;
  await p.prompt();
  const { outcome } = await p.userChoice;
  return outcome;
}

export function registrarServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      /* sin service worker la web funciona igual, solo que no sin conexión */
    });
  });
}

// Al cerrar sesión, se borra la copia de los datos que guarda el service worker.
export async function borrarCopiaDatos() {
  try {
    const nombres = await caches.keys();
    await Promise.all(nombres.filter((n) => n.startsWith('jardin-datos')).map((n) => caches.delete(n)));
  } catch {
    /* sin caché */
  }
}
