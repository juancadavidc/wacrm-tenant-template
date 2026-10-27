import {
  CATALOGO_V1,
  seccionDeRuta,
  type SeccionId,
} from '@contracts/emp/company-sections';

/** Deja solo los ítems cuya sección está contratada; sin sección, se va. */
export function filtrarMenu<T extends { href: string }>(
  items: readonly T[],
  secciones: readonly SeccionId[]
): T[] {
  return items.filter((item) => {
    const id = seccionDeRuta(CATALOGO_V1, item.href);
    return id !== null && secciones.includes(id);
  });
}
