// rutas.js — aviso de cambios sin guardar al salir de una vista.

let guardia = null;
let salida = null;

export function ponerGuardia(fn) {
  guardia = fn;
}

export function hayCambios() {
  return Boolean(guardia && guardia());
}

// Lo que hay que limpiar cuando se cambia de vista (p. ej. salir del modo edición del plano).
export function ponerSalida(fn) {
  salida = fn;
}

export function ejecutarSalida() {
  const fn = salida;
  salida = null;
  fn?.();
}
