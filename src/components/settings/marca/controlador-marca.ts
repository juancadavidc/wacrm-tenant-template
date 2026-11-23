import {
  ErrorSimpleSchema,
  ErrorValidacionSchema,
  MarcaApiSchema,
  RespuestaPutSchema,
  RUTA_API_MARCA,
  validarPut,
  type Campo,
  type Fuente,
  type MarcaApi,
} from '@contracts/marca/api';

export type MotivoCampo =
  'vacio' | 'muy-largo' | 'formato' | 'tipo' | 'muy-pesado';

export type EstadoPanel = {
  fase: 'cargando' | 'lista' | 'sin-permiso' | 'error-carga';
  actual: MarcaApi | null;
  borrador: { nombre?: string; color?: string; logo?: File; icono?: File };
  previas: { logoUrl?: string; iconoUrl?: string };
  errores: Partial<Record<Campo, MotivoCampo>>;
  iconoNoCuadrado: boolean;
  guardando: boolean;
  restaurado: { campo: Campo; fuente: Fuente } | null;
  errorGeneral: 'red' | 'cuerpo-muy-pesado' | 'sin-permiso' | null;
};

export type DepsControlador = {
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  crearUrl: (f: File) => string;
  revocarUrl: (u: string) => void;
  medir: (f: File) => Promise<{ ancho: number; alto: number } | null>;
  alAplicar: (m: MarcaApi) => void;
};

export type VistaPreviaMarca = {
  nombre: string;
  color: string;
  logoUrl: string;
  iconoUrl: string;
};

function estadoInicial(): EstadoPanel {
  return {
    fase: 'cargando',
    actual: null,
    borrador: {},
    previas: {},
    errores: {},
    iconoNoCuadrado: false,
    guardando: false,
    restaurado: null,
    errorGeneral: null,
  };
}

async function leerJson(r: Response): Promise<unknown> {
  try {
    return await r.json();
  } catch {
    return undefined;
  }
}

export function crearControladorMarca(d: DepsControlador) {
  let e: EstadoPanel = estadoInicial();
  const oyentes = new Set<() => void>();

  function poner(parcial: Partial<EstadoPanel>) {
    e = { ...e, ...parcial };
    for (const fn of [...oyentes]) fn();
  }

  function revocarPrevias(campos: ('logoUrl' | 'iconoUrl')[]) {
    for (const k of campos) {
      const u = e.previas[k];
      if (u) d.revocarUrl(u);
    }
  }

  function sinCampo<T extends object>(o: T, k: keyof T): T {
    const copia = { ...o };
    delete copia[k];
    return copia;
  }

  function hayCambios(): boolean {
    return Object.keys(e.borrador).length > 0;
  }

  async function cargar() {
    try {
      const r = await d.fetch(RUTA_API_MARCA);
      if (r.status === 403) return poner({ fase: 'sin-permiso' });
      if (r.status !== 200) return poner({ fase: 'error-carga' });
      const actual = MarcaApiSchema.parse(await leerJson(r));
      poner({ fase: 'lista', actual });
    } catch {
      poner({ fase: 'error-carga' });
    }
  }

  function cambiarTexto(campo: 'nombre' | 'color', valor: string) {
    poner({
      borrador: { ...e.borrador, [campo]: valor },
      errores: sinCampo(e.errores, campo),
      restaurado: null,
    });
  }

  async function elegirArchivo(campo: 'logo' | 'icono', f: File) {
    const r = validarPut({ [campo]: f });
    if (!r.ok) {
      const motivo = r.error === 'validacion' ? r.campos[campo] : undefined;
      if (motivo) poner({ errores: { ...e.errores, [campo]: motivo } });
      return;
    }
    const llave = campo === 'logo' ? 'logoUrl' : 'iconoUrl';
    revocarPrevias([llave]);
    const medida = campo === 'icono' ? await d.medir(f) : null;
    poner({
      borrador: { ...e.borrador, [campo]: f },
      previas: { ...e.previas, [llave]: d.crearUrl(f) },
      errores: sinCampo(e.errores, campo),
      restaurado: null,
      iconoNoCuadrado:
        campo === 'icono'
          ? medida !== null && medida.ancho !== medida.alto
          : e.iconoNoCuadrado,
    });
  }

  async function guardar() {
    if (e.guardando) return;
    const r = validarPut(e.borrador);
    if (!r.ok) {
      if (r.error === 'validacion') poner({ errores: r.campos });
      return;
    }
    const cuerpo = new FormData();
    for (const k of ['nombre', 'color'] as const) {
      const v = e.borrador[k];
      if (v !== undefined) cuerpo.append(k, v);
    }
    for (const k of ['logo', 'icono'] as const) {
      const v = e.borrador[k];
      if (v !== undefined) cuerpo.append(k, v);
    }
    poner({ guardando: true, errorGeneral: null, restaurado: null });
    try {
      const res = await d.fetch(RUTA_API_MARCA, {
        method: 'PUT',
        body: cuerpo,
      });
      const cuerpoRes = await leerJson(res);
      if (res.status === 200) {
        const { avisos, ...api } = RespuestaPutSchema.parse(cuerpoRes);
        revocarPrevias(['logoUrl', 'iconoUrl']);
        poner({
          actual: api,
          borrador: {},
          previas: {},
          errores: {},
          iconoNoCuadrado: avisos.some((a) => a.campo === 'icono'),
          guardando: false,
        });
        d.alAplicar(api);
        return;
      }
      if (res.status === 400) {
        const v = ErrorValidacionSchema.safeParse(cuerpoRes);
        if (v.success) {
          return poner({ errores: v.data.campos, guardando: false });
        }
        ErrorSimpleSchema.parse(cuerpoRes);
        return poner({ errorGeneral: 'red', guardando: false });
      }
      const simple = ErrorSimpleSchema.parse(cuerpoRes);
      if (res.status === 403) {
        return poner({ errorGeneral: 'sin-permiso', guardando: false });
      }
      if (res.status === 413 && simple.error === 'cuerpo-muy-pesado') {
        return poner({ errorGeneral: 'cuerpo-muy-pesado', guardando: false });
      }
      poner({ errorGeneral: 'red', guardando: false });
    } catch {
      poner({ errorGeneral: 'red', guardando: false });
    }
  }

  async function restaurar(campo: Campo) {
    poner({ errorGeneral: null });
    try {
      const res = await d.fetch(`${RUTA_API_MARCA}?campo=${campo}`, {
        method: 'DELETE',
      });
      if (res.status === 403) return poner({ errorGeneral: 'sin-permiso' });
      if (res.status !== 200) return poner({ errorGeneral: 'red' });
      const api = MarcaApiSchema.parse(await leerJson(res));
      let borrador = e.borrador;
      let previas = e.previas;
      if (campo === 'logo' || campo === 'icono') {
        const llave = campo === 'logo' ? 'logoUrl' : 'iconoUrl';
        revocarPrevias([llave]);
        borrador = sinCampo(borrador, campo);
        previas = sinCampo(previas, llave);
      } else {
        borrador = sinCampo(borrador, campo);
      }
      poner({
        actual: api,
        borrador,
        previas,
        errores: sinCampo(e.errores, campo),
        iconoNoCuadrado: campo === 'icono' ? false : e.iconoNoCuadrado,
        restaurado: { campo, fuente: api.fuentes[campo] },
      });
      d.alAplicar(api);
    } catch {
      poner({ errorGeneral: 'red' });
    }
  }

  function vistaPrevia(): VistaPreviaMarca {
    const m = e.actual?.marca;
    const logoUrl = e.previas.logoUrl ?? m?.logoUrl ?? '';
    // R2: sin ícono propio (el efectivo es el logo), el ícono es el logo.
    const propioActual =
      m !== undefined && m.iconoUrl !== m.logoUrl ? m.iconoUrl : undefined;
    return {
      nombre: e.borrador.nombre ?? m?.nombre ?? '',
      color: e.borrador.color ?? m?.color ?? '',
      logoUrl,
      iconoUrl: e.previas.iconoUrl ?? propioActual ?? logoUrl,
    };
  }

  function desmontar() {
    revocarPrevias(['logoUrl', 'iconoUrl']);
    oyentes.clear();
  }

  return {
    estado: () => e,
    suscribir(fn: () => void) {
      oyentes.add(fn);
      return () => void oyentes.delete(fn);
    },
    cargar,
    cambiarTexto,
    elegirArchivo,
    guardar,
    restaurar,
    vistaPrevia,
    hayCambios,
    desmontar,
  };
}

export type ControladorMarca = ReturnType<typeof crearControladorMarca>;
