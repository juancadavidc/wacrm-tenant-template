import {
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
  // Guardar y restaurar se ejecutan de a uno, en el orden en que se piden.
  let cola: Promise<unknown> = Promise.resolve();
  const enCola = <T>(fn: () => Promise<T>): Promise<T> => {
    const p = cola.then(fn, fn);
    cola = p.catch(() => undefined);
    return p;
  };
  // Una secuencia por campo: solo la última elección de archivo cuenta.
  const secuencia: Record<'logo' | 'icono', number> = { logo: 0, icono: 0 };

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
    // Si el texto vuelve al valor actual no hay cambio: mandarlo fijaría el
    // campo como "subido aquí" aunque el valor viniera de config/.
    const vuelve = valor === e.actual?.marca[campo];
    poner({
      borrador: vuelve
        ? sinCampo(e.borrador, campo)
        : { ...e.borrador, [campo]: valor },
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
    const mia = ++secuencia[campo];
    const medida = campo === 'icono' ? await d.medir(f) : null;
    if (mia !== secuencia[campo]) return; // eligieron otro mientras medía
    revocarPrevias([llave]);
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

  function guardar(): Promise<void> {
    if (e.guardando) return Promise.resolve();
    poner({ guardando: true, errorGeneral: null, restaurado: null });
    return enCola(ejecutarGuardado);
  }

  async function ejecutarGuardado() {
    const enviado = e.borrador;
    const r = validarPut(enviado);
    if (!r.ok) {
      poner({
        guardando: false,
        ...(r.error === 'validacion' ? { errores: r.campos } : {}),
      });
      return;
    }
    const cuerpo = new FormData();
    for (const k of ['nombre', 'color', 'logo', 'icono'] as const) {
      const v = enviado[k];
      if (v !== undefined) cuerpo.append(k, v);
    }
    try {
      const res = await d.fetch(RUTA_API_MARCA, {
        method: 'PUT',
        body: cuerpo,
      });
      const cuerpoRes = await leerJson(res);
      if (res.status === 200) {
        const { avisos, ...api } = RespuestaPutSchema.parse(cuerpoRes);
        // Se limpia solo lo que se envió; lo editado durante el guardado
        // sigue en el borrador.
        const borrador: EstadoPanel['borrador'] = {};
        const previas: EstadoPanel['previas'] = { ...e.previas };
        const errores = { ...e.errores };
        for (const k of ['nombre', 'color', 'logo', 'icono'] as const) {
          const igual = e.borrador[k] === enviado[k];
          if (igual && enviado[k] !== undefined) {
            delete errores[k];
            if (k === 'logo' || k === 'icono') {
              const llave = k === 'logo' ? 'logoUrl' : 'iconoUrl';
              revocarPrevias([llave]);
              delete previas[llave];
            }
          } else if (e.borrador[k] !== undefined) {
            Object.assign(borrador, { [k]: e.borrador[k] });
          }
        }
        const iconoCambio = e.borrador.icono !== enviado.icono;
        poner({
          actual: api,
          borrador,
          previas,
          errores,
          iconoNoCuadrado: iconoCambio
            ? e.iconoNoCuadrado
            : avisos.some((a) => a.campo === 'icono'),
          guardando: false,
        });
        d.alAplicar(api);
        return;
      }
      // Se decide por el estado antes que por el cuerpo: un 403 o un 413 de
      // un proxy pueden venir sin JSON.
      if (res.status === 403) {
        return poner({ errorGeneral: 'sin-permiso', guardando: false });
      }
      if (res.status === 413) {
        return poner({ errorGeneral: 'cuerpo-muy-pesado', guardando: false });
      }
      if (res.status === 400) {
        const v = ErrorValidacionSchema.safeParse(cuerpoRes);
        if (v.success) {
          return poner({ errores: v.data.campos, guardando: false });
        }
      }
      poner({ errorGeneral: 'red', guardando: false });
    } catch {
      poner({ errorGeneral: 'red', guardando: false });
    }
  }

  function restaurar(campo: Campo): Promise<void> {
    // Espera al guardado en curso para no cruzarse con él.
    return enCola(() => ejecutarRestaurar(campo));
  }

  async function ejecutarRestaurar(campo: Campo) {
    poner({ errorGeneral: null });
    try {
      const res = await d.fetch(`${RUTA_API_MARCA}?campo=${campo}`, {
        method: 'DELETE',
      });
      if (res.status === 403) return poner({ errorGeneral: 'sin-permiso' });
      if (res.status !== 200) return poner({ errorGeneral: 'red' });
      const api = MarcaApiSchema.parse(await leerJson(res));
      if (campo === 'logo' || campo === 'icono') secuencia[campo]++;
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
