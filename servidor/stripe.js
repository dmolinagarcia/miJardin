// stripe.js — llamadas a la API de Stripe con fetch y comprobación de la firma de sus avisos (webhooks).
// Sin la librería oficial: solo hacen falta cuatro llamadas.

import { createHmac, timingSafeEqual } from 'node:crypto';

// { a: 1, b: { c: 2 }, d: [ { e: 3 } ] } → a=1&b[c]=2&d[0][e]=3
function formulario(datos, prefijo = '', salida = new URLSearchParams()) {
  for (const [k, v] of Object.entries(datos)) {
    if (v === undefined || v === null) continue;
    const clave = prefijo ? `${prefijo}[${k}]` : k;
    if (typeof v === 'object') formulario(v, clave, salida);
    else salida.append(clave, String(v));
  }
  return salida;
}

export function crearCliente({ clave, api = 'https://api.stripe.com' }) {
  async function llamar(metodo, ruta, datos, { idempotencia } = {}) {
    const url = new URL(`/v1/${ruta}`, api);
    const cabeceras = { Authorization: `Bearer ${clave}` };
    let cuerpo;
    if (metodo === 'GET' && datos) url.search = formulario(datos).toString();
    else if (datos) {
      cuerpo = formulario(datos).toString();
      cabeceras['Content-Type'] = 'application/x-www-form-urlencoded';
    }
    if (idempotencia) cabeceras['Idempotency-Key'] = idempotencia;
    let r;
    try {
      r = await fetch(url, { method: metodo, headers: cabeceras, body: cuerpo, signal: AbortSignal.timeout(15000) });
    } catch (e) {
      throw Object.assign(new Error(`No se ha podido conectar con Stripe (${e.message}).`), { status: 502 });
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const mensaje = j.error?.message || `error ${r.status}`;
      console.error(`Stripe ${metodo} ${ruta}: ${mensaje}`);
      throw Object.assign(new Error(`Stripe ha rechazado la operación: ${mensaje}`), { status: 502 });
    }
    return j;
  }
  return {
    get: (ruta, datos) => llamar('GET', ruta, datos),
    post: (ruta, datos, opciones) => llamar('POST', ruta, datos, opciones),
  };
}

// Cabecera Stripe-Signature: t=123,v1=abc,v1=def
export function verificarFirma(cuerpo, cabecera, secreto, tolerancia = 300) {
  const partes = String(cabecera || '').split(',').map((p) => p.split('='));
  const t = partes.find(([k]) => k === 't')?.[1];
  const firmas = partes.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || !firmas.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > tolerancia) return false;
  const esperada = createHmac('sha256', secreto).update(`${t}.`).update(cuerpo).digest();
  return firmas.some((f) => {
    const b = Buffer.from(f, 'hex');
    return b.length === esperada.length && timingSafeEqual(b, esperada);
  });
}

export function firmar(cuerpo, secreto, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${createHmac('sha256', secreto).update(`${t}.${cuerpo}`).digest('hex')}`;
}

// Fin del periodo pagado. En las versiones nuevas de la API está en cada elemento de la suscripción.
export function finDelPeriodo(sub) {
  const s = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? null;
  return s ? new Date(s * 1000).toISOString() : null;
}
