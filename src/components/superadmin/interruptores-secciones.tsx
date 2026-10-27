'use client';

import { useState } from 'react';
import { Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type { SeccionId } from '@contracts/emp/company-sections';
import { Switch } from '@/components/ui/switch';
import type { Vista } from '@/lib/permisos/vista-superadmin';

export function aplicarCambio(
  v: Vista,
  id: SeccionId,
  prendida: boolean
): Vista {
  return {
    ...v,
    secciones: v.secciones.map((s) => (s.id === id ? { ...s, prendida } : s)),
  };
}

export type CambiarSeccion = (
  id: SeccionId,
  prendida: boolean
) => Promise<Vista>;

export const cambiarPorApi: CambiarSeccion = async (id, prendida) => {
  const res = await fetch('/api/superadmin/secciones/' + id, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prendida }),
  });
  if (!res.ok) throw new Error('No se pudo cambiar la sección');
  return (await res.json()) as Vista;
};

export function InterruptoresSecciones({
  inicial,
  cambiar = cambiarPorApi,
}: {
  inicial: Vista;
  cambiar?: CambiarSeccion;
}) {
  const t = useTranslations('Superadmin');
  const [vista, setVista] = useState<Vista>(inicial);
  const [enVuelo, setEnVuelo] = useState<ReadonlySet<SeccionId>>(new Set());

  function marcarEnVuelo(id: SeccionId, activo: boolean) {
    setEnVuelo((prev) => {
      const sig = new Set(prev);
      if (activo) sig.add(id);
      else sig.delete(id);
      return sig;
    });
  }

  async function alternar(id: SeccionId, prendida: boolean) {
    const antes = vista;
    setVista((v) => aplicarCambio(v, id, prendida));
    marcarEnVuelo(id, true);
    try {
      setVista(await cambiar(id, prendida));
    } catch {
      setVista(antes);
      toast.error(t('errorCambiar'));
    } finally {
      marcarEnVuelo(id, false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">{t('titulo')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('descripcion', { cuenta: vista.cuenta.nombre })}
        </p>
      </div>
      <ul className="divide-y divide-border rounded-md border border-border">
        {vista.secciones.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 p-3">
            <div>
              <p className="text-sm font-medium text-foreground">{s.nombre}</p>
              <p className="text-xs text-muted-foreground">{s.ruta}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {s.prendida ? t('prendida') : t('apagada')}
              </span>
              <Switch
                aria-label={s.nombre}
                checked={s.prendida}
                disabled={enVuelo.has(s.id)}
                onCheckedChange={(v: boolean) => void alternar(s.id, v)}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SinAccesoSuperadmin() {
  const t = useTranslations('Superadmin');
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <Lock className="h-8 w-8 text-muted-foreground" />
      <h1 className="text-lg font-semibold text-foreground">
        {t('sinAccesoTitulo')}
      </h1>
      <p className="text-sm text-muted-foreground">{t('sinAccesoTexto')}</p>
    </div>
  );
}

export function AvisoCuentaEmpresa({ encontradas }: { encontradas: number }) {
  const t = useTranslations('Superadmin');
  return (
    <div className="mx-auto max-w-md py-16 text-center text-sm text-muted-foreground">
      {t('cuentaEmpresa', { n: encontradas })}
    </div>
  );
}
