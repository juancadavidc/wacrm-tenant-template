'use client';

// ============================================================
// ProfilesPanel — Configuración → Perfiles de acceso (USR.2)
//
// Lista los perfiles de la cuenta, crea perfiles propios y edita los
// de fábrica (R16). Un cambio llega a todos los usuarios del perfil al
// recargar (R13). Admin+; el servidor vuelve a aplicar las reglas.
//
// `ListaPerfiles` y `FormPerfil` son presentacionales (se prueban con
// renderToStaticMarkup); `ProfilesPanel` carga y guarda.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Loader2, Pencil, Plus } from 'lucide-react';
import { CATALOGO_V1, type SeccionId } from '@contracts/emp/company-sections';

import { RequireRole } from '@/components/auth/require-role';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { nombresDeSecciones } from '@/lib/permisos/perfiles-ui';
import type { PerfilEntrada, PerfilListado } from '@/lib/permisos/perfiles';
import { SettingsPanelHead } from './settings-panel-head';

export function ListaPerfiles(props: {
  perfiles: PerfilListado[];
  onEditar(id: string): void;
  onNuevo(): void;
}) {
  const t = useTranslations('Settings.profiles');
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={props.onNuevo}>
          <Plus className="size-4" />
          {t('nuevo')}
        </Button>
      </div>
      <Card>
        <CardContent className="p-0">
          {props.perfiles.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              {t('vacio')}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {props.perfiles.map((p) => {
                const nombres = nombresDeSecciones(p.secciones);
                return (
                  <li
                    key={p.id}
                    className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {p.nombre}
                        </span>
                        {p.deFabrica && (
                          <Badge className="bg-muted text-muted-foreground border-border text-[10px] uppercase tracking-wide">
                            {t('deFabrica')}
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {t('usuarios', { count: p.usuarios })}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {nombres.length > 0
                          ? nombres.join(' · ')
                          : t('sinSecciones')}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => props.onEditar(p.id)}
                    >
                      <Pencil className="size-4" />
                      {t('editar')}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function FormPerfil(props: {
  inicial: { nombre: string; secciones: SeccionId[] } | null;
  guardando: boolean;
  onGuardar(e: PerfilEntrada): void;
  onCancelar(): void;
}) {
  const t = useTranslations('Settings.profiles');
  const [nombre, setNombre] = useState(props.inicial?.nombre ?? '');
  const [marcadas, setMarcadas] = useState<Set<SeccionId>>(
    () => new Set(props.inicial?.secciones ?? [])
  );

  function alternar(id: SeccionId, valor: boolean) {
    setMarcadas((prev) => {
      const siguiente = new Set(prev);
      if (valor) siguiente.add(id);
      else siguiente.delete(id);
      return siguiente;
    });
  }

  const nombreLimpio = nombre.trim();

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="space-y-2">
          <Label htmlFor="perfil-nombre" className="text-muted-foreground">
            {t('nombre')}
          </Label>
          <Input
            id="perfil-nombre"
            value={nombre}
            maxLength={60}
            placeholder={t('nombrePlaceholder')}
            onChange={(e) => setNombre(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-muted-foreground">{t('secciones')}</Label>
          <ul className="grid gap-2 sm:grid-cols-2">
            {CATALOGO_V1.map((s) => (
              <li key={s.id}>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                  <Checkbox
                    checked={marcadas.has(s.id)}
                    onCheckedChange={(v) => alternar(s.id, v === true)}
                  />
                  {s.nombre}
                </label>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">{t('nota')}</p>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={props.onCancelar}
            disabled={props.guardando}
          >
            {t('cancelar')}
          </Button>
          <Button
            disabled={props.guardando || nombreLimpio.length === 0}
            onClick={() =>
              props.onGuardar({
                nombre: nombreLimpio,
                // en el orden del catálogo, sin repetidos
                secciones: CATALOGO_V1.filter((s) => marcadas.has(s.id)).map(
                  (s) => s.id
                ),
              })
            }
          >
            {props.guardando ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t('guardando')}
              </>
            ) : (
              t('guardar')
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

type Edicion = { id: string | null } | null;

export function ProfilesPanel() {
  const t = useTranslations('Settings.profiles');
  const [perfiles, setPerfiles] = useState<PerfilListado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [edicion, setEdicion] = useState<Edicion>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/account/members/profiles', {
        cache: 'no-store',
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || t('loadFailed'));
        return;
      }
      const data = (await res.json()) as { perfiles: PerfilListado[] };
      setPerfiles(data.perfiles);
    } catch (err) {
      console.error('[ProfilesPanel] load error:', err);
      toast.error(t('networkError'));
    } finally {
      setCargando(false);
    }
  }, [t]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function guardar(entrada: PerfilEntrada) {
    if (!edicion) return;
    const existente = edicion.id
      ? perfiles.find((p) => p.id === edicion.id)
      : null;
    setGuardando(true);
    try {
      const res = await fetch(
        edicion.id
          ? `/api/account/members/profiles/${edicion.id}`
          : '/api/account/members/profiles',
        {
          method: edicion.id ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entrada),
        }
      );
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || t('saveFailed'));
        return;
      }
      toast.success(
        existente
          ? t('aplicado', { count: existente.usuarios })
          : t('guardado')
      );
      setEdicion(null);
      await cargar();
    } catch (err) {
      console.error('[ProfilesPanel] save error:', err);
      toast.error(t('networkError'));
    } finally {
      setGuardando(false);
    }
  }

  const editando = edicion?.id
    ? perfiles.find((p) => p.id === edicion.id)
    : undefined;

  return (
    <RequireRole min="admin">
      <section className="animate-in fade-in-50 space-y-6 duration-200">
        <SettingsPanelHead
          title={t('title')}
          description={t('description')}
        />
        {cargando ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : edicion ? (
          <FormPerfil
            key={edicion.id ?? 'nuevo'}
            inicial={
              editando
                ? { nombre: editando.nombre, secciones: editando.secciones }
                : null
            }
            guardando={guardando}
            onGuardar={guardar}
            onCancelar={() => setEdicion(null)}
          />
        ) : (
          <ListaPerfiles
            perfiles={perfiles}
            onEditar={(id) => setEdicion({ id })}
            onNuevo={() => setEdicion({ id: null })}
          />
        )}
      </section>
    </RequireRole>
  );
}
