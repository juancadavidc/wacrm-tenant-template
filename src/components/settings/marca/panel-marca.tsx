'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import type { Campo } from '@contracts/marca/api';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useActualizarMarca } from '@/components/marca/marca-context';
import { SettingsPanelHead } from '../settings-panel-head';
import {
  crearControladorMarca,
  type EstadoPanel,
  type MotivoCampo,
  type VistaPreviaMarca as Vista,
} from './controlador-marca';
import { VistaPreviaMarca } from './vista-previa-marca';

type Acciones = {
  texto(campo: 'nombre' | 'color', valor: string): void;
  archivo(campo: 'logo' | 'icono', f: File): void;
  guardar(): void;
  restaurar(campo: Campo): void;
};

const CAMPOS: Campo[] = ['nombre', 'logo', 'icono', 'color'];
const ACCEPT = 'image/png,image/svg+xml,image/webp';

export function PanelMarcaVista(p: {
  estado: EstadoPanel;
  vista: Vista;
  hayCambios: boolean;
  on: Acciones;
}) {
  const t = useTranslations('Settings.brand');
  const { estado, vista, on } = p;

  const head = (
    <SettingsPanelHead title={t('title')} description={t('description')} />
  );
  if (estado.fase === 'cargando') return <div>{head}</div>;
  if (estado.fase === 'sin-permiso') {
    return (
      <div>
        {head}
        <p role="alert" className="text-destructive text-sm">
          {t('general.sinPermiso')}
        </p>
      </div>
    );
  }
  if (estado.fase === 'error-carga' || !estado.actual) {
    return (
      <div>
        {head}
        <p role="alert" className="text-destructive text-sm">
          {t('general.carga')}
        </p>
      </div>
    );
  }

  const { fuentes } = estado.actual;
  const textoMotivo = (campo: Campo, m: MotivoCampo): string => {
    if (m === 'vacio') return t('errors.vacio');
    if (m === 'muy-largo') return t('errors.muyLargo');
    if (m === 'formato') return t('errors.formato');
    if (m === 'tipo') return t('errors.tipo');
    return campo === 'logo'
      ? t('errors.logoMuyPesado')
      : t('errors.iconoMuyPesado');
  };
  const errorGeneral =
    estado.errorGeneral === 'red'
      ? t('general.red')
      : estado.errorGeneral === 'cuerpo-muy-pesado'
        ? t('general.cuerpoMuyPesado')
        : estado.errorGeneral === 'sin-permiso'
          ? t('general.sinPermiso')
          : null;

  return (
    <div>
      {head}
      <div className="space-y-4">
        <Card>
          <CardContent className="space-y-5">
            {CAMPOS.map((campo) => {
              const motivo = estado.errores[campo];
              const idError = `marca-${campo}-error`;
              const restaurado =
                estado.restaurado?.campo === campo ? estado.restaurado : null;
              return (
                <div key={campo} className="space-y-1.5">
                  <Label htmlFor={`marca-${campo}`}>
                    {t(`fields.${campo}`)}
                  </Label>
                  {campo === 'nombre' ? (
                    <Input
                      id="marca-nombre"
                      value={vista.nombre}
                      onChange={(e) => on.texto('nombre', e.target.value)}
                      aria-invalid={motivo ? true : undefined}
                      aria-describedby={motivo ? idError : undefined}
                    />
                  ) : campo === 'color' ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        aria-label={t('fields.color')}
                        value={
                          /^#[0-9a-fA-F]{6}$/.test(vista.color)
                            ? vista.color
                            : '#000000'
                        }
                        onChange={(e) => on.texto('color', e.target.value)}
                        className="border-border h-9 w-12 cursor-pointer rounded border bg-transparent p-0.5"
                      />
                      <Input
                        id="marca-color"
                        value={vista.color}
                        onChange={(e) => on.texto('color', e.target.value)}
                        aria-invalid={motivo ? true : undefined}
                        aria-describedby={motivo ? idError : undefined}
                        className="max-w-40"
                      />
                    </div>
                  ) : (
                    <>
                      <input
                        id={`marca-${campo}`}
                        type="file"
                        accept={ACCEPT}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) on.archivo(campo, f);
                          e.target.value = '';
                        }}
                        aria-invalid={motivo ? true : undefined}
                        aria-describedby={motivo ? idError : undefined}
                        className="text-muted-foreground file:border-border file:bg-background file:text-foreground block w-full text-sm file:mr-3 file:rounded-md file:border file:px-3 file:py-1.5 file:text-sm file:font-medium"
                      />
                      <p className="text-muted-foreground text-xs">
                        {t(`hints.${campo}`)}
                      </p>
                    </>
                  )}
                  <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
                    <span>
                      {t('source', { fuente: t(`sources.${fuentes[campo]}`) })}
                    </span>
                    {fuentes[campo] === 'base' ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => on.restaurar(campo)}
                      >
                        {t('restore')}
                      </Button>
                    ) : null}
                    {restaurado ? (
                      <span>
                        {t('restored', {
                          fuente: t(`sources.${restaurado.fuente}`),
                        })}
                      </span>
                    ) : null}
                  </div>
                  {motivo ? (
                    <p
                      id={idError}
                      role="alert"
                      className="text-destructive text-sm"
                    >
                      {textoMotivo(campo, motivo)}
                    </p>
                  ) : null}
                  {campo === 'icono' && estado.iconoNoCuadrado ? (
                    <p className="text-muted-foreground text-sm">
                      {t('notSquare')}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <VistaPreviaMarca {...vista} />
          </CardContent>
        </Card>
        {errorGeneral ? (
          <p role="alert" className="text-destructive text-sm">
            {errorGeneral}
          </p>
        ) : null}
        <Button
          type="button"
          onClick={on.guardar}
          disabled={!p.hayCambios || estado.guardando}
        >
          {estado.guardando ? t('saving') : t('save')}
        </Button>
      </div>
    </div>
  );
}

async function medirImagen(
  f: File
): Promise<{ ancho: number; alto: number } | null> {
  try {
    const b = await createImageBitmap(f);
    const r = { ancho: b.width, alto: b.height };
    b.close();
    return r;
  } catch {
    return null;
  }
}

export function PanelMarca() {
  const t = useTranslations('Settings.brand');
  const actualizar = useActualizarMarca();
  const c = useMemo(
    () =>
      crearControladorMarca({
        fetch: (i, init) => fetch(i, init),
        crearUrl: (f) => URL.createObjectURL(f),
        revocarUrl: (u) => URL.revokeObjectURL(u),
        medir: medirImagen,
        alAplicar: (m) => {
          actualizar(m);
          toast.success(t('saved'));
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const estado = useSyncExternalStore(c.suscribir, c.estado, c.estado);

  useEffect(() => {
    void c.cargar();
    return () => c.desmontar();
  }, [c]);

  return (
    <PanelMarcaVista
      estado={estado}
      vista={c.vistaPrevia()}
      hayCambios={c.hayCambios()}
      on={{
        texto: c.cambiarTexto,
        archivo: (campo, f) => void c.elegirArchivo(campo, f),
        guardar: () => void c.guardar(),
        restaurar: (campo) => void c.restaurar(campo),
      }}
    />
  );
}
