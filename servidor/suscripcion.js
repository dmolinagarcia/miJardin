// suscripcion.js — plan gratuito con límite de plantas y suscripción mensual con Stripe.
//
// Quién tiene plantas sin límite:
//   · administradores
//   · usuarios con «premium sin pagar» (lo concede un administrador)
//   · usuarios con una suscripción de Stripe activa (active, trialing o past_due,
//     este último mientras Stripe reintenta el cobro)
//
// El estado de la suscripción llega por dos caminos, y vale cualquiera de los dos:
//   · los avisos de Stripe (webhook) en /api/stripe/aviso, si el servidor es accesible desde internet
//   · una consulta a Stripe al volver del pago y, como mucho, cada 6 horas al abrir la web

import { ahora } from './db.js';
import { crearCliente, verificarFirma, finDelPeriodo } from './stripe.js';

const ACTIVOS = ['active', 'trialing', 'past_due'];
const REFRESCO = 6 * 3600 * 1000;

export const pagosActivos = (cfg) => Boolean(cfg.stripe.clave && cfg.stripe.precio);

let cliente = null;
let claveCliente = '';
function stripe(cfg) {
  if (!cliente || claveCliente !== cfg.stripe.clave + cfg.stripe.api) {
    cliente = crearCliente({ clave: cfg.stripe.clave, api: cfg.stripe.api });
    claveCliente = cfg.stripe.clave + cfg.stripe.api;
  }
  return cliente;
}

const COLUMNAS = 'id, usuario, nombre, rol, premium_manual, stripe_cliente, stripe_suscripcion, suscripcion_estado, suscripcion_hasta, suscripcion_cancela, suscripcion_sync';
const fila = (db, id) => db.prepare(`SELECT ${COLUMNAS} FROM usuarios WHERE id = ?`).get(id);

export function estadoDe(u, cfg) {
  const porStripe = ACTIVOS.includes(u.suscripcion_estado);
  const motivo = u.rol === 'admin' ? 'admin' : u.premium_manual ? 'manual' : porStripe ? 'stripe' : null;
  return {
    premium: Boolean(motivo),
    motivo,
    estado: u.suscripcion_estado || null,
    hasta: u.suscripcion_hasta || null,
    cancela: Boolean(u.suscripcion_cancela),
    impago: u.suscripcion_estado === 'past_due',
    cliente: Boolean(u.stripe_cliente),
    limite: cfg.limitePlantas,
  };
}

export function estado(db, cfg, usuarioId) {
  return estadoDe(fila(db, usuarioId), cfg);
}

export function esPremium(db, cfg, usuarioId) {
  return estado(db, cfg, usuarioId).premium;
}

// ---------- Precio (se pregunta a Stripe y se guarda una hora) ----------

let precio = { texto: '', hasta: 0 };

export async function textoPrecio(cfg) {
  if (cfg.precioTexto) return cfg.precioTexto;
  if (!pagosActivos(cfg)) return '';
  if (precio.hasta > Date.now()) return precio.texto;
  try {
    const p = await stripe(cfg).get(`prices/${encodeURIComponent(cfg.stripe.precio)}`);
    const importe = new Intl.NumberFormat('es-ES', { style: 'currency', currency: p.currency.toUpperCase() }).format(p.unit_amount / 100).replace(/\s/g, ' ');
    const n = p.recurring?.interval_count || 1;
    const periodo = { day: ['día', 'días'], week: ['semana', 'semanas'], month: ['mes', 'meses'], year: ['año', 'años'] }[p.recurring?.interval] || ['mes', 'meses'];
    precio = { texto: n === 1 ? `${importe} al ${periodo[0]}` : `${importe} cada ${n} ${periodo[1]}`, hasta: Date.now() + 3600 * 1000 };
  } catch {
    precio = { texto: '', hasta: Date.now() + 60 * 1000 };
  }
  return precio.texto;
}

// ---------- Guardar lo que dice Stripe ----------

function aplicar(db, usuarioId, sub) {
  db.prepare(
    `UPDATE usuarios SET stripe_suscripcion = ?, suscripcion_estado = ?, suscripcion_hasta = ?, suscripcion_cancela = ?, suscripcion_sync = ?
     WHERE id = ?`,
  ).run(sub.id, sub.status, finDelPeriodo(sub), sub.cancel_at_period_end ? 1 : 0, ahora(), usuarioId);
}

function enlazarCliente(db, usuarioId, clienteId) {
  if (!clienteId) return;
  db.prepare('UPDATE usuarios SET stripe_cliente = ? WHERE id = ? AND (stripe_cliente IS NULL OR stripe_cliente = ?)').run(clienteId, usuarioId, clienteId);
}

function usuarioDeSuscripcion(db, sub) {
  const porCliente = db.prepare('SELECT id FROM usuarios WHERE stripe_cliente = ?').get(sub.customer);
  if (porCliente) return porCliente.id;
  const id = Number(sub.metadata?.usuario_id);
  if (id && db.prepare('SELECT 1 FROM usuarios WHERE id = ?').get(id)) {
    enlazarCliente(db, id, sub.customer);
    return id;
  }
  return null;
}

// Pregunta a Stripe por la suscripción del usuario y la guarda.
export async function sincronizar(db, cfg, usuarioId) {
  const u = fila(db, usuarioId);
  if (!pagosActivos(cfg) || !u.stripe_cliente) return estadoDe(u, cfg);
  const { data } = await stripe(cfg).get('subscriptions', { customer: u.stripe_cliente, status: 'all', limit: 10 });
  // La más útil: una activa si la hay; si no, la más reciente.
  const sub = data.find((s) => ACTIVOS.includes(s.status)) || data[0];
  if (sub) aplicar(db, usuarioId, sub);
  else db.prepare('UPDATE usuarios SET suscripcion_sync = ? WHERE id = ?').run(ahora(), usuarioId);
  return estado(db, cfg, usuarioId);
}

// Al abrir la web: si hace tiempo que no se pregunta a Stripe, se pregunta (sin bloquear si Stripe falla).
export async function refrescarSiHaceFalta(db, cfg, usuarioId) {
  const u = fila(db, usuarioId);
  if (!pagosActivos(cfg) || !u.stripe_cliente) return estadoDe(u, cfg);
  const ultima = u.suscripcion_sync ? Date.parse(u.suscripcion_sync) : 0;
  const caducada = u.suscripcion_hasta && Date.parse(u.suscripcion_hasta) < Date.now();
  if (Date.now() - ultima < REFRESCO && !caducada) return estadoDe(u, cfg);
  try {
    return await sincronizar(db, cfg, usuarioId);
  } catch {
    return estadoDe(u, cfg);
  }
}

// ---------- Pagar y gestionar ----------

async function clienteDe(db, cfg, usuarioId) {
  const u = fila(db, usuarioId);
  if (u.stripe_cliente) return u.stripe_cliente;
  const c = await stripe(cfg).post(
    'customers',
    { name: u.nombre, description: `Jardín: ${u.usuario}`, metadata: { usuario_id: u.id, usuario: u.usuario } },
    { idempotencia: `cliente-${u.id}-${u.usuario}` },
  );
  enlazarCliente(db, u.id, c.id);
  return fila(db, usuarioId).stripe_cliente;
}

export async function crearPago(db, cfg, usuarioId, base) {
  const actual = estado(db, cfg, usuarioId);
  if (actual.motivo === 'stripe') {
    throw Object.assign(new Error('Ya tienes una suscripción activa. Puedes gestionarla desde Ajustes.'), { status: 409 });
  }
  const customer = await clienteDe(db, cfg, usuarioId);
  const datos = {
    mode: 'subscription',
    customer,
    client_reference_id: String(usuarioId),
    line_items: [{ price: cfg.stripe.precio, quantity: 1 }],
    success_url: `${base}/#/ajustes/pago-ok`,
    cancel_url: `${base}/#/ajustes/pago-cancelado`,
    allow_promotion_codes: 'true',
    subscription_data: { metadata: { usuario_id: usuarioId } },
    locale: 'es',
  };
  if (cfg.stripe.impuestos) {
    datos.automatic_tax = { enabled: 'true' };
    datos.customer_update = { address: 'auto', name: 'auto' };
    datos.tax_id_collection = { enabled: 'true' };
  }
  const sesion = await stripe(cfg).post('checkout/sessions', datos);
  return sesion.url;
}

export async function crearPortal(db, cfg, usuarioId, base) {
  const u = fila(db, usuarioId);
  if (!u.stripe_cliente) throw Object.assign(new Error('Todavía no tienes ninguna suscripción.'), { status: 400 });
  const sesion = await stripe(cfg).post('billing_portal/sessions', { customer: u.stripe_cliente, return_url: `${base}/#/ajustes/pago-ok` });
  return sesion.url;
}

// ---------- Avisos de Stripe (webhook) ----------

export async function recibirAviso(db, cfg, cuerpo, firma) {
  if (!cfg.stripe.secretoAvisos) throw Object.assign(new Error('Avisos de Stripe no configurados.'), { status: 404 });
  if (!verificarFirma(cuerpo, firma, cfg.stripe.secretoAvisos)) throw Object.assign(new Error('Firma no válida.'), { status: 400 });
  const evento = JSON.parse(cuerpo.toString('utf8'));
  if (db.prepare('SELECT 1 FROM stripe_eventos WHERE id = ?').get(evento.id)) return { repetido: true };

  const obj = evento.data?.object || {};
  if (evento.type === 'checkout.session.completed' && obj.mode === 'subscription') {
    const usuarioId = Number(obj.client_reference_id);
    if (usuarioId && db.prepare('SELECT 1 FROM usuarios WHERE id = ?').get(usuarioId)) {
      enlazarCliente(db, usuarioId, obj.customer);
      if (obj.subscription) aplicar(db, usuarioId, await stripe(cfg).get(`subscriptions/${encodeURIComponent(obj.subscription)}`));
    }
  } else if (/^customer\.subscription\.(created|updated|deleted|paused|resumed)$/.test(evento.type)) {
    const usuarioId = usuarioDeSuscripcion(db, obj);
    // Una suscripción vieja que acaba no pisa a otra activa más reciente.
    const u = usuarioId && fila(db, usuarioId);
    if (u && !(u.stripe_suscripcion && u.stripe_suscripcion !== obj.id && ACTIVOS.includes(u.suscripcion_estado) && !ACTIVOS.includes(obj.status))) {
      aplicar(db, usuarioId, obj);
    }
  }
  db.prepare('INSERT OR IGNORE INTO stripe_eventos (id, tipo, recibido) VALUES (?, ?, ?)').run(evento.id, evento.type, ahora());
  return { ok: true };
}
