'use client';

import { cn } from '@/lib/utils';
import { useMarca } from './marca-context';

/**
 * Logo compacto (sidebar): el ícono de la empresa o, sin ícono, el logo completo.
 * Va en un cuadro fijo con `object-contain`: un logo apaisado se ve entero, sin deformarse.
 */
export function MarcaLogo({ className }: { className?: string }) {
  const marca = useMarca();
  return (
    // eslint-disable-next-line @next/next/no-img-element -- logo servido desde config/, sin optimizador
    <img
      src={marca.marcaUrl}
      alt={marca.nombre}
      className={cn('shrink-0 rounded-lg object-contain object-center', className)}
    />
  );
}

/** Logo completo (pantallas de acceso): alto fijo, ancho según la proporción del archivo. */
export function MarcaLogoCompleto({ className }: { className?: string }) {
  const marca = useMarca();
  return (
    // eslint-disable-next-line @next/next/no-img-element -- logo servido desde config/, sin optimizador
    <img
      src={marca.logoUrl}
      alt={marca.nombre}
      className={cn('object-contain', className)}
    />
  );
}
