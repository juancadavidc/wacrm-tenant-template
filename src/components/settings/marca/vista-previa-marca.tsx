'use client';

import { useTranslations } from 'next-intl';

import type { VistaPreviaMarca as Vista } from './controlador-marca';

/**
 * Tres maquetas de la marca antes de guardar: menú lateral, pestaña del
 * navegador e inicio de sesión. Las imágenes llevan `data-preview`.
 */
export function VistaPreviaMarca({ nombre, color, logoUrl, iconoUrl }: Vista) {
  const t = useTranslations('Settings.brand.preview');
  return (
    <div className="space-y-3">
      <h3 className="text-foreground text-sm font-medium">{t('title')}</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <figure className="space-y-1.5">
          <div className="border-border overflow-hidden rounded-lg border">
            <div className="h-1.5" style={{ backgroundColor: color }} />
            <div className="flex items-center gap-2 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                data-preview="sidebar"
                src={iconoUrl}
                alt=""
                className="size-6 shrink-0 rounded object-contain"
              />
              <span className="truncate text-sm font-semibold">{nombre}</span>
            </div>
          </div>
          <figcaption className="text-muted-foreground text-xs">
            {t('sidebar')}
          </figcaption>
        </figure>
        <figure className="space-y-1.5">
          <div className="border-border bg-muted rounded-lg border p-2">
            <div className="bg-background flex items-center gap-1.5 rounded-t-md px-2 py-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                data-preview="tab"
                src={iconoUrl}
                alt=""
                className="size-4 shrink-0 object-contain"
              />
              <span className="truncate text-xs">{nombre}</span>
            </div>
          </div>
          <figcaption className="text-muted-foreground text-xs">
            {t('tab')}
          </figcaption>
        </figure>
        <figure className="space-y-1.5">
          <div className="border-border flex flex-col items-center gap-2 rounded-lg border p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              data-preview="login"
              src={logoUrl}
              alt=""
              className="h-8 max-w-full object-contain"
            />
            <span className="truncate text-sm font-semibold">{nombre}</span>
          </div>
          <figcaption className="text-muted-foreground text-xs">
            {t('login')}
          </figcaption>
        </figure>
      </div>
    </div>
  );
}
