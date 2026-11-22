// auth.js — contraseñas (scrypt), sesiones con cookie y límite de intentos de entrada.

import { scrypt, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { ahora } from './db.js';

const scryptAsync = promisify(scrypt);
const N = 16384;
const R = 8;
const P = 1;
const LARGO = 64;

export const COOKIE = 'jardin_sesion';
const DURACION = 60 * 24 * 3600 * 1000; // 60 días, se renueva al usarla

export async function cifrarClave(clave) {
  const sal = randomBytes(16);
  const hash = await scryptAsync(String(clave).normalize('NFC'), sal, LARGO, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${sal.toString('base64')}$${hash.toString('base64')}`;
}

// Un hash de relleno para comprobar algo aunque el usuario no exista (mismo tiempo de respuesta).
let relleno = null;

export async function comprobarClave(clave, guardada) {
  if (!guardada) {
    relleno ||= await cifrarClave(randomBytes(12).toString('hex'));
    guardada = relleno;
    await comprobarClave(clave, guardada);
    return false;
  }
  const [tipo, n, r, p, sal, hash] = String(guardada).split('$');
  if (tipo !== 'scrypt') return false;
  const esperado = Buffer.from(hash, 'base64');
  const obtenido = await scryptAsync(String(clave).normalize('NFC'), Buffer.from(sal, 'base64'), esperado.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return obtenido.length === esperado.length && timingSafeEqual(obtenido, esperado);
}

export function validarClave(clave) {
  const c = String(clave ?? '');
  if (c.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
  if (c.length > 200) return 'La contraseña es demasiado larga.';
  return null;
}

const hashToken = (token) => createHash('sha256').update(token).digest('base64url');

export function crearSesion(db, usuarioId) {
  const token = randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sesiones (hash, usuario_id, creada, caduca) VALUES (?, ?, ?, ?)').run(
    hashToken(token),
    usuarioId,
    ahora(),
    Date.now() + DURACION,
  );
  db.prepare('UPDATE usuarios SET ultimo_acceso = ? WHERE id = ?').run(ahora(), usuarioId);
  return token;
}

export function leerCookies(req) {
  const res = {};
  for (const parte of String(req.headers.cookie || '').split(';')) {
    const i = parte.indexOf('=');
    if (i > 0) res[parte.slice(0, i).trim()] = decodeURIComponent(parte.slice(i + 1).trim());
  }
  return res;
}

// Devuelve el usuario de la sesión, o null. Renueva la caducidad si ha pasado más de un día.
export function usuarioDeSesion(db, req) {
  const token = leerCookies(req)[COOKIE];
  if (!token || token.length > 100) return null;
  const hash = hashToken(token);
  const fila = db
    .prepare(
      `SELECT s.caduca, u.id, u.usuario, u.nombre, u.rol, u.activo
       FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id WHERE s.hash = ?`,
    )
    .get(hash);
  if (!fila) return null;
  if (fila.caduca < Date.now() || !fila.activo) {
    db.prepare('DELETE FROM sesiones WHERE hash = ?').run(hash);
    return null;
  }
  if (fila.caduca - Date.now() < DURACION - 24 * 3600 * 1000) {
    db.prepare('UPDATE sesiones SET caduca = ? WHERE hash = ?').run(Date.now() + DURACION, hash);
    db.prepare('UPDATE usuarios SET ultimo_acceso = ? WHERE id = ?').run(ahora(), fila.id);
  }
  return { id: fila.id, usuario: fila.usuario, nombre: fila.nombre, rol: fila.rol, sesion: hash };
}

export function cerrarSesion(db, hash) {
  db.prepare('DELETE FROM sesiones WHERE hash = ?').run(hash);
}

export function cerrarSesionesDe(db, usuarioId, salvo = null) {
  db.prepare('DELETE FROM sesiones WHERE usuario_id = ? AND hash IS NOT ?').run(usuarioId, salvo);
}

export function limpiarSesiones(db) {
  db.prepare('DELETE FROM sesiones WHERE caduca < ?').run(Date.now());
}

export function cookieSesion(token, segura) {
  const partes = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${Math.floor(DURACION / 1000)}`];
  if (segura) partes.push('Secure');
  return partes.join('; ');
}

export function cookieBorrada(segura) {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${segura ? '; Secure' : ''}`;
}

// ---------- Límite de intentos ----------
// 10 fallos en 15 minutos desde la misma IP o contra el mismo usuario bloquean 15 minutos.

const VENTANA = 15 * 60 * 1000;
const MAX_FALLOS = 10;
const fallos = new Map();

function apunte(clave) {
  const t = Date.now();
  const a = fallos.get(clave);
  if (!a || t - a.desde > VENTANA) return { desde: t, n: 0 };
  return a;
}

export function bloqueado(...claves) {
  return claves.some((c) => apunte(c).n >= MAX_FALLOS);
}

export function anotarFallo(...claves) {
  for (const c of claves) {
    const a = apunte(c);
    a.n++;
    fallos.set(c, a);
  }
  if (fallos.size > 10000) for (const [c, a] of fallos) if (Date.now() - a.desde > VENTANA) fallos.delete(c);
}

export function borrarFallos(...claves) {
  for (const c of claves) fallos.delete(c);
}
