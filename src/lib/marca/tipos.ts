/**
 * Tipos de archivo de la marca. Vive aparte para que `base.ts` y `marca.ts`
 * no se importen entre sí (evita el ciclo de imports).
 */

/** Mismos valores que scripts/empresa/nueva-empresa.mjs (una prueba los fija). */
export const TIPOS_LOGO: Record<string, string> = {
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};
export const LOGO_MAX_BYTES = 1024 * 1024;
