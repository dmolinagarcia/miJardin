// Pruebas del plan gratuito, la suscripción y los avisos de Stripe (con un Stripe simulado).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { crearServidor } from '../servidor/index.js';
import { leerConfig } from '../servidor/arranque.js';
import { firmar } from '../servidor/stripe.js';

const SECRETO = 'whsec_prueba';
let servidor;
let falso;
let base;
const stripe = { clientes: [], pagos: [], suscripciones: new Map() };

before(async () => {
  // Stripe simulado
  falso = createServer(async (req, res) => {
    let cuerpo = '';
    for await (const t of req) cuerpo += t;
    const f = new URLSearchParams(cuerpo);
    const url = new URL(req.url, 'http://x');
    const json = (d, s = 200) => res.writeHead(s, { 'Content-Type': 'application/json' }).end(JSON.stringify(d));
    if (req.headers.authorization !== 'Bearer sk_test_x') return json({ error: { message: 'clave' } }, 401);
    if (req.method === 'POST' && url.pathname === '/v1/customers') {
      const c = { id: `cus_${stripe.clientes.length + 1}`, metadata: { usuario_id: f.get('metadata[usuario_id]') } };
      stripe.clientes.push(c);
      return json(c);
    }
    if (req.method === 'POST' && url.pathname === '/v1/checkout/sessions') {
      stripe.pagos.push(Object.fromEntries(f));
      return json({ id: 'cs_1', url: 'https://checkout.stripe.test/cs_1' });
    }
    if (req.method === 'POST' && url.pathname === '/v1/billing_portal/sessions') return json({ url: 'https://portal.stripe.test/x' });
    if (req.method === 'GET' && url.pathname === '/v1/prices/price_mes') {
      return json({ unit_amount: 250, currency: 'eur', recurring: { interval: 'month', interval_count: 1 } });
    }
    if (req.method === 'GET' && url.pathname === '/v1/subscriptions') {
      const c = url.searchParams.get('customer');
      return json({ data: [...stripe.suscripciones.values()].filter((s) => s.customer === c) });
    }
    const m = url.pathname.match(/^\/v1\/subscriptions\/(\w+)$/);
    if (m) return json(stripe.suscripciones.get(m[1]));
    json({ error: { message: 'no' } }, 404);
  });
  await new Promise((r) => falso.listen(0, '127.0.0.1', r));

  const cfg = leerConfig({
    DATOS: ':memory:',
    ADMIN_USUARIO: 'admin',
    ADMIN_CLAVE: 'clave-admin-1',
    LIMITE_PLANTAS_GRATIS: '2',
    STRIPE_CLAVE_SECRETA: 'sk_test_x',
    STRIPE_PRECIO: 'price_mes',
    STRIPE_SECRETO_AVISOS: SECRETO,
    STRIPE_API: `http://127.0.0.1:${falso.address().port}`,
  });
  ({ servidor } = await crearServidor(cfg, { log: () => {} }));
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(async () => {
  await new Promise((r) => servidor.close(r));
  await new Promise((r) => falso.close(r));
});

function cliente() {
  let cookie = '';
  return async (metodo, ruta, cuerpo) => {
    const r = await fetch(base + ruta, {
      method: metodo,
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...(cuerpo ? { 'Content-Type': 'application/json' } : {}), Origin: base },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    const c = r.headers.get('set-cookie');
    if (c) cookie = c.split(';')[0];
    return { status: r.status, datos: await r.json().catch(() => null) };
  };
}

const plantas = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, etiqueta: `P${i}`, ficha: 'granado', x: i, y: 1 }));

async function aviso(evento) {
  const cuerpo = JSON.stringify(evento);
  return fetch(`${base}/api/stripe/aviso`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': firmar(cuerpo, SECRETO) },
    body: cuerpo,
  });
}

async function guardarPlantas(pedir, n) {
  const { datos } = await pedir('GET', '/api/jardin');
  return pedir('PUT', '/api/jardin', { datos: { ...datos.datos, plantas: plantas(n) }, version: datos.version });
}

test('registro libre, límite gratuito, pago, avisos de Stripe y fin de la suscripción', async () => {
  const cfg = await cliente()('GET', '/api/config');
  assert.equal(cfg.datos.registroAbierto, true);
  assert.equal(cfg.datos.limitePlantas, 2);
  assert.equal(cfg.datos.pagos, true);
  assert.equal(cfg.datos.precio, '2,50 € al mes');

  const luis = cliente();
  const alta = await luis('POST', '/api/registro', { usuario: 'luis', nombre: 'Luis', clave: 'clave-luis-1' });
  assert.equal(alta.status, 201);
  const yo = await luis('GET', '/api/yo');
  assert.equal(yo.datos.suscripcion.premium, false);
  const id = yo.datos.usuario.id;

  // Gratis: hasta 2
  assert.equal((await guardarPlantas(luis, 2)).status, 200);
  const pasado = await guardarPlantas(luis, 3);
  assert.equal(pasado.status, 402);
  assert.match(pasado.datos.error, /hasta 2 plantas/);

  // Pagar: crea el cliente en Stripe y la sesión de pago
  const pago = await luis('POST', '/api/suscripcion/pagar');
  assert.equal(pago.status, 200);
  assert.equal(pago.datos.url, 'https://checkout.stripe.test/cs_1');
  assert.equal(stripe.clientes.length, 1);
  assert.equal(stripe.pagos[0].customer, 'cus_1');
  assert.equal(stripe.pagos[0]['line_items[0][price]'], 'price_mes');
  assert.match(stripe.pagos[0].success_url, /#\/ajustes\/pago-ok$/);

  // Aviso con firma falsa
  const malo = await fetch(`${base}/api/stripe/aviso`, { method: 'POST', headers: { 'Stripe-Signature': 't=1,v1=00' }, body: '{}' });
  assert.equal(malo.status, 400);

  // Stripe avisa de que el pago se ha completado
  const sub = { id: 'sub_1', customer: 'cus_1', status: 'active', cancel_at_period_end: false, items: { data: [{ current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400 }] }, metadata: { usuario_id: String(id) } };
  stripe.suscripciones.set('sub_1', sub);
  const r1 = await aviso({ id: 'evt_1', type: 'checkout.session.completed', data: { object: { mode: 'subscription', client_reference_id: String(id), customer: 'cus_1', subscription: 'sub_1' } } });
  assert.equal(r1.status, 200);
  const s1 = (await luis('GET', '/api/yo')).datos.suscripcion;
  assert.equal(s1.premium, true);
  assert.equal(s1.motivo, 'stripe');
  assert.ok(s1.hasta);

  // Con suscripción: sin límite. Y no se puede pagar dos veces.
  assert.equal((await guardarPlantas(luis, 5)).status, 200);
  assert.equal((await luis('POST', '/api/suscripcion/pagar')).status, 409);
  assert.equal((await luis('POST', '/api/suscripcion/portal')).datos.url, 'https://portal.stripe.test/x');

  // El mismo aviso dos veces no hace nada
  assert.deepEqual(await (await aviso({ id: 'evt_1', type: 'checkout.session.completed', data: { object: {} } })).json(), { repetido: true });

  // Se cancela: conserva sus 5 plantas, puede moverlas o quitar, pero no añadir
  await aviso({ id: 'evt_2', type: 'customer.subscription.deleted', data: { object: { ...sub, status: 'canceled' } } });
  assert.equal((await luis('GET', '/api/yo')).datos.suscripcion.premium, false);
  assert.equal((await guardarPlantas(luis, 5)).status, 200);
  assert.equal((await guardarPlantas(luis, 6)).status, 402);
  assert.equal((await guardarPlantas(luis, 4)).status, 200);

  // Sin webhook: al volver del pago se pregunta a Stripe
  stripe.suscripciones.set('sub_1', { ...sub, status: 'active' });
  const s2 = await luis('POST', '/api/suscripcion/sincronizar');
  assert.equal(s2.datos.suscripcion.premium, true);
});

test('premium concedido por un administrador', async () => {
  const admin = cliente();
  await admin('POST', '/api/sesion', { usuario: 'admin', clave: 'clave-admin-1' });
  const marta = cliente();
  await marta('POST', '/api/registro', { usuario: 'marta', clave: 'clave-marta-1' });
  assert.equal((await guardarPlantas(marta, 3)).status, 402);

  const { datos } = await admin('GET', '/api/admin/usuarios');
  const m = datos.usuarios.find((u) => u.usuario === 'marta');
  assert.equal(m.suscripcion.premium, false);
  await admin('PATCH', `/api/admin/usuarios/${m.id}`, { premium: true });
  assert.equal((await marta('GET', '/api/yo')).datos.suscripcion.motivo, 'manual');
  assert.equal((await guardarPlantas(marta, 3)).status, 200);
  const otra = (await admin('GET', '/api/admin/usuarios')).datos.usuarios.find((u) => u.usuario === 'marta');
  assert.equal(otra.plantas, 3);

  // Los administradores no tienen límite
  assert.equal((await admin('GET', '/api/yo')).datos.suscripcion.motivo, 'admin');
});
