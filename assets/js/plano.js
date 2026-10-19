// plano.js — plano del jardín con las plantas marcadas.
// Las coordenadas de jardin.json están en las unidades del contorno; el plano
// se puede girar 90° (útil en el móvil) y ampliar. En modo edición las marcas
// se arrastran con el dedo o el ratón, o se mueven con las flechas del teclado.

import { esc } from './md.js';
import { leerLocal, guardarLocal } from './ui.js';

const CLAVE_GIRO = 'jardin:plano-giro'; // 'auto' | 'si' | 'no'
const ZOOMS = [1, 1.5, 2, 3];

const redondear = (n) => Math.round(n * 100) / 100;
const limitar = (n, a = 0, b = 1) => Math.min(b, Math.max(a, n));

function caja(jardin) {
  const puntos = [
    ...jardin.plano.contorno,
    ...jardin.plantas.map((p) => [p.x, p.y]),
    ...jardin.plano.zonas.map((z) => [z.x, z.y]),
  ];
  const xs = puntos.map((p) => p[0]);
  const ys = puntos.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(Math.max(...xs) - minX, 1);
  const h = Math.max(Math.max(...ys) - minY, 1);
  const m = Math.max(w, h) * 0.025;
  return { x0: minX - m, y0: minY - m, w: w + 2 * m, h: h + 2 * m };
}

let contadorClip = 0;

export function montarPlano(raiz, op) {
  // op: { jardin, colorDe(fichaId), nombreDe(fichaId), alElegir(id), alMover(planta),
  //       seleccion, editable, zoom, alCambiarZoom(z) }
  let jardin = op.jardin;
  let zoom = ZOOMS.includes(op.zoom) ? op.zoom : 1;
  let editable = Boolean(op.editable);
  let seleccion = op.seleccion || null;
  let resaltado = null;
  let giro = leerLocal(CLAVE_GIRO, 'auto');
  let girado = false;
  let c = null;
  let ignorarClick = false;
  const idClip = `contorno-${++contadorClip}`;

  raiz.innerHTML = '<div class="plano-marco"><div class="plano"></div></div>';
  const marco = raiz.querySelector('.plano-marco');
  const plano = raiz.querySelector('.plano');

  const dimensiones = () => (girado ? [c.h, c.w] : [c.w, c.h]);

  function decidirGiro() {
    if (giro === 'si') return true;
    if (giro === 'no') return false;
    const ancho = marco.clientWidth || window.innerWidth;
    return ancho < 640 && c.w / c.h > 1.3;
  }

  // Plano (x, y) → fracción de la vista (u, v). Girado = 90° en el sentido del reloj.
  function aVista(x, y) {
    const fx = (x - c.x0) / c.w;
    const fy = (y - c.y0) / c.h;
    return girado ? [1 - fy, fx] : [fx, fy];
  }

  function aPlano(u, v) {
    const [fx, fy] = girado ? [v, 1 - u] : [u, v];
    return [c.x0 + fx * c.w, c.y0 + fy * c.h];
  }

  function posicion(p) {
    const [u, v] = aVista(p.x, p.y);
    return `left:${(u * 100).toFixed(3)}%;top:${(v * 100).toFixed(3)}%`;
  }

  function marcaHTML(p) {
    const clases = ['marca'];
    if (p.id === seleccion) clases.push('activa');
    if (resaltado && p.ficha === resaltado) clases.push('resaltada');
    const ayuda = editable ? '. Arrastra para moverla, o usa las flechas del teclado' : '';
    return `<button type="button" class="${clases.join(' ')}" data-id="${esc(p.id)}" data-ficha="${esc(p.ficha)}"
      style="${posicion(p)};--f:${op.colorDe(p.ficha)}" aria-label="${esc(p.etiqueta)}, ${esc(op.nombreDe(p.ficha))}${ayuda}">${esc(p.etiqueta)}</button>`;
  }

  function dibujar() {
    c = caja(jardin);
    girado = decidirGiro();
    const [VW, VH] = dimensiones();
    const punto = (x, y) => {
      const [u, v] = aVista(x, y);
      return [(u * VW).toFixed(3), (v * VH).toFixed(3)];
    };
    const contorno = jardin.plano.contorno.map(([x, y]) => punto(x, y).join(',')).join(' ');
    const linea = (x1, y1, x2, y2) => {
      const [a, b] = punto(x1, y1);
      const [d, e] = punto(x2, y2);
      return `<line x1="${a}" y1="${b}" x2="${d}" y2="${e}"/>`;
    };
    let rejilla = '';
    for (let x = Math.ceil(c.x0); x <= c.x0 + c.w; x++) rejilla += linea(x, c.y0, x, c.y0 + c.h);
    for (let y = Math.ceil(c.y0); y <= c.y0 + c.h; y++) rejilla += linea(c.x0, y, c.x0 + c.w, y);

    plano.style.setProperty('--aspecto', `${VW.toFixed(3)} / ${VH.toFixed(3)}`);
    plano.style.setProperty('--zoom', zoom);
    plano.classList.toggle('editando', editable);
    plano.dataset.girado = girado ? 'si' : 'no';
    plano.innerHTML = `
      <svg viewBox="0 0 ${VW.toFixed(3)} ${VH.toFixed(3)}" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <defs><clipPath id="${idClip}"><polygon points="${contorno}"/></clipPath></defs>
        <polygon class="plano-suelo" points="${contorno}"/>
        <g class="plano-rejilla" clip-path="url(#${idClip})">${rejilla}</g>
        <polygon class="plano-borde" points="${contorno}"/>
      </svg>
      ${jardin.plano.zonas.map((z) => `<span class="zona" style="${posicion(z)}">${esc(z.nombre)}</span>`).join('')}
      ${jardin.plantas.map(marcaHTML).join('')}`;
    ajustarTamano();
  }

  function ajustarTamano() {
    const [VW] = dimensiones();
    const px = (plano.clientWidth || marco.clientWidth || 300) / VW;
    plano.style.setProperty('--mk', `${limitar(px * 1.3, 24, 38).toFixed(1)}px`);
  }

  function colocar(boton, p) {
    const [u, v] = aVista(p.x, p.y);
    boton.style.left = `${(u * 100).toFixed(3)}%`;
    boton.style.top = `${(v * 100).toFixed(3)}%`;
  }

  // ---------- Eventos ----------

  plano.addEventListener('click', (e) => {
    const b = e.target.closest('.marca');
    if (!b) return;
    if (ignorarClick) {
      ignorarClick = false;
      return;
    }
    op.alElegir?.(b.dataset.id);
  });

  plano.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.marca');
    if (!b || !editable || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const p = jardin.plantas.find((x) => x.id === b.dataset.id);
    if (!p) return;
    const inicio = { x: e.clientX, y: e.clientY };
    let moviendo = false;
    try {
      b.setPointerCapture(e.pointerId);
    } catch {
      /* sin captura */
    }
    const mover = (ev) => {
      if (!moviendo && Math.hypot(ev.clientX - inicio.x, ev.clientY - inicio.y) < 6) return;
      if (!moviendo) {
        moviendo = true;
        b.classList.add('arrastrando');
      }
      const r = plano.getBoundingClientRect();
      const [x, y] = aPlano(limitar((ev.clientX - r.left) / r.width), limitar((ev.clientY - r.top) / r.height));
      p.x = redondear(x);
      p.y = redondear(y);
      colocar(b, p);
    };
    const fin = () => {
      b.removeEventListener('pointermove', mover);
      b.removeEventListener('pointerup', fin);
      b.removeEventListener('pointercancel', fin);
      b.classList.remove('arrastrando');
      if (moviendo) {
        ignorarClick = true;
        setTimeout(() => {
          ignorarClick = false;
        }, 0);
        op.alMover?.(p);
      }
    };
    b.addEventListener('pointermove', mover);
    b.addEventListener('pointerup', fin);
    b.addEventListener('pointercancel', fin);
  });

  plano.addEventListener('keydown', (e) => {
    if (!editable) return;
    const b = e.target.closest('.marca');
    const paso = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!b || !paso) return;
    e.preventDefault();
    const p = jardin.plantas.find((x) => x.id === b.dataset.id);
    if (!p) return;
    const [VW, VH] = dimensiones();
    const d = e.shiftKey ? 0.5 : 0.1;
    const [u, v] = aVista(p.x, p.y);
    const [x, y] = aPlano(limitar(u + (paso[0] * d) / VW), limitar(v + (paso[1] * d) / VH));
    p.x = redondear(x);
    p.y = redondear(y);
    colocar(b, p);
    op.alMover?.(p);
  });

  const observador = new ResizeObserver(() => {
    if (!c) return;
    if (decidirGiro() !== girado) dibujar();
    else ajustarTamano();
  });
  observador.observe(marco);

  dibujar();

  // ---------- API ----------

  return {
    redibujar(nuevo) {
      if (nuevo) jardin = nuevo;
      dibujar();
    },
    seleccionar(id) {
      seleccion = id;
      for (const b of plano.querySelectorAll('.marca')) b.classList.toggle('activa', b.dataset.id === id);
    },
    resaltar(fichaId) {
      resaltado = fichaId;
      plano.classList.toggle('con-resalte', Boolean(fichaId));
      for (const b of plano.querySelectorAll('.marca')) b.classList.toggle('resaltada', b.dataset.ficha === fichaId);
    },
    girar() {
      giro = girado ? 'no' : 'si';
      guardarLocal(CLAVE_GIRO, giro);
      dibujar();
      return girado;
    },
    cambiarZoom(dir) {
      const i = ZOOMS.indexOf(zoom);
      const nuevo = ZOOMS[limitar(i + dir, 0, ZOOMS.length - 1)];
      if (nuevo === zoom) return zoom;
      const centro = (marco.scrollLeft + marco.clientWidth / 2) / (plano.offsetWidth || 1);
      zoom = nuevo;
      plano.style.setProperty('--zoom', zoom);
      ajustarTamano();
      marco.scrollLeft = centro * plano.offsetWidth - marco.clientWidth / 2;
      op.alCambiarZoom?.(zoom);
      return zoom;
    },
    get zoom() {
      return zoom;
    },
    limitesZoom() {
      return { min: zoom === ZOOMS[0], max: zoom === ZOOMS[ZOOMS.length - 1] };
    },
    centroVisible() {
      const r = plano.getBoundingClientRect();
      const m = marco.getBoundingClientRect();
      const izq = Math.max(m.left, 0);
      const der = Math.min(m.right, window.innerWidth);
      const arr = Math.max(m.top, 0);
      const aba = Math.min(m.bottom, window.innerHeight);
      const u = limitar(((izq + der) / 2 - r.left) / r.width);
      const v = limitar(((arr + aba) / 2 - r.top) / r.height);
      return aPlano(u, v).map(redondear);
    },
    enfocar(id) {
      const b = plano.querySelector(`.marca[data-id="${CSS.escape(id)}"]`);
      if (!b) return;
      b.scrollIntoView({ block: 'center', inline: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      b.classList.remove('latido');
      void b.offsetWidth;
      b.classList.add('latido');
    },
    destruir() {
      observador.disconnect();
    },
  };
}
