// suscripcion.js — plan gratuito, suscripción mensual y avisos de límite.

import { esc } from './md.js';
import { estado } from './estado.js';
import { ICONOS, abrirHoja, aviso, fechaLarga } from './ui.js';
import * as api from './api.js';

const precio = () => (estado.config.precio ? ` por ${esc(estado.config.precio)}` : '');

export async function irAPagar(boton) {
  if (boton) boton.disabled = true;
  try {
    const { url } = await api.post('suscripcion/pagar');
    location.href = url;
  } catch (e) {
    aviso(e.message, 'error');
    if (boton) boton.disabled = false;
  }
}

export async function irAlPortal(boton) {
  if (boton) boton.disabled = true;
  try {
    const { url } = await api.post('suscripcion/portal');
    location.href = url;
  } catch (e) {
    aviso(e.message, 'error');
    if (boton) boton.disabled = false;
  }
}

export async function sincronizar() {
  const { suscripcion } = await api.post('suscripcion/sincronizar');
  estado.suscripcion = suscripcion;
  return suscripcion;
}

function botonPagar(texto = 'Suscribirme') {
  return estado.config.pagos
    ? `<button type="button" class="boton" data-suscripcion="pagar">${ICONOS.mas}${texto}${precio()}</button>`
    : '<p class="nota">Los pagos todavía no están activos en esta web. Si necesitas más plantas, habla con quien la administra.</p>';
}

export function conectarBotones(raiz) {
  raiz.addEventListener('click', (e) => {
    const b = e.target.closest('[data-suscripcion]');
    if (!b) return;
    if (b.dataset.suscripcion === 'pagar') irAPagar(b);
    else if (b.dataset.suscripcion === 'portal') irAlPortal(b);
  });
}

// Hoja que sale al intentar pasar del límite gratuito.
export function hojaLimite() {
  const { limite } = estado.suscripcion;
  abrirHoja({
    titulo: 'Has llegado al límite gratuito',
    contenido: `<div class="prosa-ui">
        <p>Con el plan gratuito puedes tener hasta <strong>${limite} ${limite === 1 ? 'planta' : 'plantas'}</strong> en el plano.</p>
        <p>Con la suscripción${precio()} no hay límite. Puedes cancelarla cuando quieras; si lo haces, conservas todas tus plantas, aunque no podrás añadir más.</p>
      </div>
      <div class="acciones">${botonPagar()}</div>`,
    alMontar: (d) => conectarBotones(d),
  });
}

// Panel «Tu plan» de Ajustes.
export function htmlPlan(plantas) {
  const s = estado.suscripcion;
  if (s.motivo === 'admin') return '<p>Las cuentas de administración no tienen límite de plantas.</p>';
  if (s.motivo === 'manual') {
    return `<p><span class="insignia">Sin límite</span> La administración te ha dado plantas ilimitadas sin pagar.</p>
      ${s.cliente ? `<div class="acciones"><button type="button" class="boton secundario" data-suscripcion="portal">Ver mis pagos anteriores</button></div>` : ''}`;
  }
  if (s.motivo === 'stripe') {
    return `<p><span class="insignia">Suscripción activa</span> Puedes tener todas las plantas que quieras.</p>
      ${
        s.impago
          ? '<p class="error-caja">El último cobro no se ha podido hacer. Revisa tu tarjeta para no perder la suscripción.</p>'
          : s.hasta
            ? `<p>${s.cancela ? 'Está cancelada y termina' : 'Se renueva'} el ${esc(fechaLarga(s.hasta))}.</p>`
            : ''
      }
      <div class="acciones"><button type="button" class="boton secundario" data-suscripcion="portal">Gestionar la suscripción</button></div>
      <p class="nota">Cambiar la tarjeta, ver las facturas o cancelar se hace en la página segura de Stripe.</p>`;
  }
  const usadas = Math.min(plantas, s.limite);
  const pct = s.limite ? Math.min(100, (plantas / s.limite) * 100) : 100;
  return `<p>Plan gratuito: <strong>${plantas} de ${s.limite}</strong> plantas en el plano${plantas > s.limite ? ' (tienes más de las que permite el plan gratuito: las conservas, pero no puedes añadir más)' : ''}.</p>
    <div class="medidor" role="meter" aria-valuemin="0" aria-valuemax="${s.limite}" aria-valuenow="${usadas}" aria-label="Plantas usadas"><span style="width:${pct}%"></span></div>
    <p>Con la suscripción${precio()} puedes tener todas las que quieras.</p>
    <div class="acciones">${botonPagar()}</div>`;
}
