import type { MarcaApi } from '@contracts/marca/api';
import { cssDeMarca } from '@/lib/marca/color';

export type MarcaBase = {
  nombre: string;
  color: string;
  logoUrl: string;
  marcaUrl: string;
};

/**
 * Pone la respuesta de I1 sobre la marca del contexto. Copia `iconoUrl`,
 * `fuentes` y `logoPropio` solo si la marca actual ya tiene esa llave, así
 * funciona antes y después de MRC.1.
 */
export function fusionarMarca<M extends MarcaBase>(
  actual: M,
  api: MarcaApi
): M {
  const siguiente: Record<string, unknown> = {
    ...actual,
    nombre: api.marca.nombre,
    color: api.marca.color,
    logoUrl: api.marca.logoUrl,
    marcaUrl: api.marca.iconoUrl,
  };
  if ('iconoUrl' in actual) siguiente.iconoUrl = api.marca.iconoUrl;
  if ('fuentes' in actual) siguiente.fuentes = api.fuentes;
  if ('logoPropio' in actual) {
    siguiente.logoPropio = api.fuentes.logo !== 'defecto';
  }
  return siguiente as M;
}

type Atributos = { setAttribute(k: string, v: string): void };

/** Un `Document` lo cumple. */
export type DocumentoMarca = {
  head: { appendChild(n: unknown): unknown };
  querySelectorAll(sel: string): ArrayLike<Atributos>;
  getElementById(id: string): { textContent: string | null } | null;
  createElement(tag: 'link'): Atributos;
};

/** Cambia el favicon y los tokens de color sin recargar la página. */
export function aplicarMarcaEnDocumento(
  doc: DocumentoMarca,
  m: { color: string; iconoUrl: string }
): void {
  const links = Array.from(doc.querySelectorAll('link[rel~="icon"]'));
  if (links.length === 0) {
    const link = doc.createElement('link');
    link.setAttribute('rel', 'icon');
    link.setAttribute('href', m.iconoUrl);
    doc.head.appendChild(link);
  } else {
    for (const l of links) l.setAttribute('href', m.iconoUrl);
  }
  const estilo = doc.getElementById('marca-tokens');
  if (estilo) estilo.textContent = cssDeMarca(m.color);
}
