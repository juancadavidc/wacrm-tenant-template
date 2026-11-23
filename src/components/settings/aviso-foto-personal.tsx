'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

/** Aviso bajo "Cambiar foto" en Tu perfil: el logo de la empresa vive en Marca. */
export function AvisoFotoPersonal({ enlazar }: { enlazar: boolean }) {
  const t = useTranslations('Settings.profile');
  return (
    <p className="text-muted-foreground w-full text-xs">
      {t.rich('companyLogoHint', {
        link: (c) =>
          enlazar ? (
            <Link
              href="/settings?tab=brand"
              className="text-primary font-medium underline-offset-2 hover:underline"
            >
              {c}
            </Link>
          ) : (
            <strong>{c}</strong>
          ),
      })}
    </p>
  );
}
