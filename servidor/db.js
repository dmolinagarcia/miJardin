// db.js — base de datos SQLite (módulo node:sqlite, incluido en Node 22.13+).
//
//   usuarios          cuentas (admin o usuario)
//   sesiones          sesiones abiertas (se guarda el hash del token, no el token)
//   fichas            catálogo central: la ficha base de cada tipo de planta
//   fichas_historial  todas las versiones de cada ficha base
//   notas             lo que cada usuario añade a cada ficha, y qué versión de la base vio por última vez
//   jardines          el plano y las plantas de cada usuario
//   stripe_eventos    avisos de Stripe ya procesados (para no aplicarlos dos veces)

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const ESQUEMA = [
  // Versión 1
  `
  CREATE TABLE usuarios (
    id INTEGER PRIMARY KEY,
    usuario TEXT NOT NULL UNIQUE COLLATE NOCASE,
    nombre TEXT NOT NULL,
    clave TEXT NOT NULL,
    rol TEXT NOT NULL DEFAULT 'usuario' CHECK (rol IN ('admin', 'usuario')),
    activo INTEGER NOT NULL DEFAULT 1,
    creado TEXT NOT NULL,
    ultimo_acceso TEXT
  );
  CREATE TABLE sesiones (
    hash TEXT PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    creada TEXT NOT NULL,
    caduca INTEGER NOT NULL
  );
  CREATE INDEX sesiones_usuario ON sesiones(usuario_id);
  CREATE TABLE fichas (
    id TEXT PRIMARY KEY,
    texto TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    archivada INTEGER NOT NULL DEFAULT 0,
    creada TEXT NOT NULL,
    actualizada TEXT NOT NULL,
    autor_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL
  );
  CREATE TABLE fichas_historial (
    ficha_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    texto TEXT NOT NULL,
    fecha TEXT NOT NULL,
    autor_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    PRIMARY KEY (ficha_id, version)
  );
  CREATE TABLE notas (
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    ficha_id TEXT NOT NULL,
    texto TEXT NOT NULL DEFAULT '',
    version INTEGER NOT NULL DEFAULT 0,
    version_vista INTEGER NOT NULL DEFAULT 0,
    actualizada TEXT,
    PRIMARY KEY (usuario_id, ficha_id)
  );
  CREATE TABLE jardines (
    usuario_id INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
    datos TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    actualizado TEXT NOT NULL
  );
  `,
  // Versión 2: suscripciones
  `
  ALTER TABLE usuarios ADD COLUMN premium_manual INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE usuarios ADD COLUMN stripe_cliente TEXT;
  ALTER TABLE usuarios ADD COLUMN stripe_suscripcion TEXT;
  ALTER TABLE usuarios ADD COLUMN suscripcion_estado TEXT;
  ALTER TABLE usuarios ADD COLUMN suscripcion_hasta TEXT;
  ALTER TABLE usuarios ADD COLUMN suscripcion_cancela INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE usuarios ADD COLUMN suscripcion_sync TEXT;
  CREATE UNIQUE INDEX usuarios_stripe_cliente ON usuarios(stripe_cliente) WHERE stripe_cliente IS NOT NULL;
  CREATE TABLE stripe_eventos (
    id TEXT PRIMARY KEY,
    tipo TEXT NOT NULL,
    recibido TEXT NOT NULL
  );
  `,
];

export function abrir(ruta) {
  if (ruta !== ':memory:') mkdirSync(dirname(ruta), { recursive: true });
  const db = new DatabaseSync(ruta);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  const { user_version: actual } = db.prepare('PRAGMA user_version').get();
  for (let v = actual; v < ESQUEMA.length; v++) {
    transaccion(db, () => {
      db.exec(ESQUEMA[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
  return db;
}

export function transaccion(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export const ahora = () => new Date().toISOString();
