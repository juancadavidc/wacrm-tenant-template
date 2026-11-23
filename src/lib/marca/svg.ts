/**
 * Limpieza de SVG en el servidor (R10), sin dependencias: sin `<script>`,
 * atributos `on*` ni referencias externas. Lista blanca de elementos; todo
 * lo que no se entiende se rechaza (`null`) en vez de repararse.
 */

export const ELEMENTOS_SVG_PERMITIDOS: readonly string[] = [
  'svg',
  'g',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'defs',
  'linearGradient',
  'radialGradient',
  'stop',
  'clipPath',
  'mask',
  'pattern',
  'use',
  'symbol',
  'title',
  'desc',
  'style',
];

const CANONICO = new Map(
  ELEMENTOS_SVG_PERMITIDOS.map((e) => [e.toLowerCase(), e])
);
const TEXTO_CRUDO = new Set(['script', 'style']);
const NOMBRE_ATRIBUTO = /^[A-Za-z_:][\w:.-]*$/;
const NOMBRE_ELEMENTO = /^[A-Za-z][\w:.-]*$/;
const REFERENCIAS = new Set(['href', 'src']);

type Atributo = { nombre: string; valor: string };
type Etiqueta = {
  nombre: string;
  atributos: Atributo[];
  cierre: boolean;
  autocierre: boolean;
  fin: number;
};

/** Valor de CSS o de atributo con algo que carga recursos o ejecuta. */
function cssPeligroso(v: string): boolean {
  if (/[\\]|&#|\/\*/.test(v)) return true;
  if (/@import|expression\s*\(|javascript:|vbscript:|data:/i.test(v)) {
    return true;
  }
  if (/image-set\s*\(|cross-fade\s*\(|\bsrc\s*\(|\/\//i.test(v)) return true;
  return /url\(\s*(?!['"]?\s*#)/i.test(v);
}

function atributoSeguro(a: Atributo): boolean {
  const nombre = a.nombre.toLowerCase();
  if (nombre.slice(nombre.lastIndexOf(':') + 1).startsWith('on')) return false;
  if (nombre === 'xmlns' || nombre.startsWith('xmlns:')) return true;
  if (!NOMBRE_ATRIBUTO.test(a.nombre)) return false;
  if (REFERENCIAS.has(nombre.slice(nombre.lastIndexOf(':') + 1))) {
    return a.valor.trim().startsWith('#');
  }
  return !cssPeligroso(a.valor);
}

function leerEtiqueta(s: string, inicio: number): Etiqueta | null {
  let i = inicio + 1;
  let cierre = false;
  if (s[i] === '/') {
    cierre = true;
    i += 1;
  }
  const m = /^[^\s/>]+/.exec(s.slice(i));
  if (!m || !NOMBRE_ELEMENTO.test(m[0])) return null;
  const nombre = m[0];
  i += nombre.length;
  const atributos: Atributo[] = [];
  for (;;) {
    while (i < s.length && /\s/.test(s[i]!)) i += 1;
    if (i >= s.length) return null;
    if (s[i] === '>') {
      return { nombre, atributos, cierre, autocierre: false, fin: i + 1 };
    }
    if (s[i] === '/') {
      if (s[i + 1] !== '>') return null;
      return { nombre, atributos, cierre, autocierre: true, fin: i + 2 };
    }
    if (cierre) return null;
    const n = /^[^\s=/>]+/.exec(s.slice(i));
    if (!n) return null;
    i += n[0].length;
    while (i < s.length && /\s/.test(s[i]!)) i += 1;
    let valor = '';
    if (s[i] === '=') {
      i += 1;
      while (i < s.length && /\s/.test(s[i]!)) i += 1;
      const q = s[i];
      if (q === '"' || q === "'") {
        const fin = s.indexOf(q, i + 1);
        if (fin < 0) return null;
        valor = s.slice(i + 1, fin);
        i = fin + 1;
      } else {
        const v = /^[^\s>]*/.exec(s.slice(i))![0];
        valor = v;
        i += v.length;
      }
    }
    atributos.push({ nombre: n[0], valor });
  }
}

function escribirAtributo(a: Atributo): string {
  const v = a.valor
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return ` ${a.nombre}="${v}"`;
}

/** SVG limpio, o `null` si hay que rechazarlo (no es SVG, DOCTYPE, roto). */
export function limpiarSvg(texto: string): string | null {
  const s = texto.replace(/^﻿/, '');
  let salida = '';
  let i = 0;
  // Elementos abiertos que se conservan (para cerrar bien).
  const abiertos: string[] = [];
  // > 0 mientras se descarta un elemento y su contenido.
  let omitiendo = 0;
  let raiz = false;
  let raizCerrada = false;

  while (i < s.length) {
    if (s[i] !== '<') {
      const sig = s.indexOf('<', i);
      const fin = sig < 0 ? s.length : sig;
      const t = s.slice(i, fin);
      if (omitiendo === 0 && abiertos.length > 0) salida += t;
      i = fin;
      continue;
    }
    if (s.startsWith('<!--', i)) {
      const fin = s.indexOf('-->', i + 4);
      if (fin < 0) return null;
      i = fin + 3;
      continue;
    }
    if (s.startsWith('<![CDATA[', i)) {
      const fin = s.indexOf(']]>', i + 9);
      if (fin < 0) return null;
      i = fin + 3;
      continue;
    }
    if (s.startsWith('<?', i)) {
      const fin = s.indexOf('?>', i + 2);
      if (fin < 0) return null;
      i = fin + 2;
      continue;
    }
    if (s.startsWith('<!', i)) return null; // DOCTYPE, ENTITY, etc.

    const et = leerEtiqueta(s, i);
    if (!et) return null;
    i = et.fin;
    const minuscula = et.nombre.toLowerCase();

    if (et.cierre) {
      if (omitiendo > 0) {
        omitiendo -= 1;
        continue;
      }
      const ultimo = abiertos.pop();
      if (ultimo === undefined || ultimo.toLowerCase() !== minuscula) {
        return null;
      }
      salida += `</${ultimo}>`;
      if (abiertos.length === 0) raizCerrada = true;
      continue;
    }

    // Contenido crudo (script, style): se salta o se revisa entero.
    let crudo: string | null = null;
    if (TEXTO_CRUDO.has(minuscula) && !et.autocierre) {
      const re = new RegExp(`</${minuscula}\\s*>`, 'i');
      const m = re.exec(s.slice(i));
      if (!m) return null;
      crudo = s.slice(i, i + m.index);
      i += m.index + m[0].length;
    }

    if (omitiendo > 0) {
      if (!et.autocierre && crudo === null) omitiendo += 1;
      continue;
    }

    const canonico = CANONICO.get(minuscula);
    const sinElemento =
      !canonico ||
      (minuscula === 'style' &&
        (/[<&]|\]\]>/.test(crudo ?? '') || cssPeligroso(crudo ?? '')));
    if (sinElemento) {
      if (!raiz && minuscula !== 'svg') return null;
      if (!et.autocierre && crudo === null) omitiendo = 1;
      continue;
    }

    if (!raiz) {
      if (canonico !== 'svg') return null;
      raiz = true;
    } else if (raizCerrada || abiertos.length === 0) {
      return null; // más de un elemento raíz
    }

    const atributos = et.atributos.filter(atributoSeguro);
    salida += `<${canonico}${atributos.map(escribirAtributo).join('')}`;
    if (et.autocierre) {
      salida += '/>';
      if (abiertos.length === 0) raizCerrada = true;
    } else {
      salida += '>';
      if (crudo !== null) {
        salida += crudo;
        salida += `</${canonico}>`;
      } else {
        abiertos.push(canonico!);
      }
    }
  }

  if (!raiz || abiertos.length > 0 || omitiendo > 0) return null;
  return salida.trim();
}
