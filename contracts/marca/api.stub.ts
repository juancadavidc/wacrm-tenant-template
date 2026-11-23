/**
 * Stub en memoria de I1 (`/api/marca`). Expone un `fetch` que las pruebas de
 * la pantalla (PNL.1) inyectan en lugar del global.
 */
import {
  CAMPOS,
  LIMITE_CUERPO_BYTES,
  MarcaApiSchema,
  RespuestaPutSchema,
  RUTA_API_MARCA,
  permiteEditarMarca,
  validarPut,
  type Campo,
  type EntradaPut,
  type Fuente,
  type MarcaApi,
  type RolMarca,
} from './api';

export const MARCA_DEFECTO_STUB = {
  nombre: 'Stackless',
  color: '#2f7bf5',
  logoUrl: '/marca/logo?v=defecto',
} as const;

export const CONFIG_STUB = {
  nombre: 'Barú',
  color: '#0a7d5a',
  logoUrl: '/marca/logo?v=config',
} as const;

type Capa = {
  nombre?: string;
  color?: string;
  logoUrl?: string;
  iconoUrl?: string;
};
export type EstadoStub = { base: Capa; config: Capa };

export type OpcionesStub = {
  rol?: RolMarca;
  estado?: Partial<EstadoStub>;
  esCuadrado?: (f: File) => boolean;
};

export function crearStubFetchMarca(o: OpcionesStub = {}) {
  let rolActual: RolMarca = o.rol ?? 'owner';
  const esCuadrado = o.esCuadrado ?? (() => true);
  const estado: EstadoStub = {
    base: { ...(o.estado?.base ?? {}) },
    config: { ...(o.estado?.config ?? CONFIG_STUB) },
  };
  let contador = 0;

  function efectiva(): MarcaApi {
    const pick = <K extends keyof Capa>(
      k: K,
      def: string
    ): [string, Fuente] => {
      const b = estado.base[k];
      if (b !== undefined) return [b, 'base'];
      const c = estado.config[k];
      if (c !== undefined) return [c, 'config'];
      return [def, 'defecto'];
    };
    const [nombre, fNombre] = pick('nombre', MARCA_DEFECTO_STUB.nombre);
    const [color, fColor] = pick('color', MARCA_DEFECTO_STUB.color);
    const [logoUrl, fLogo] = pick('logoUrl', MARCA_DEFECTO_STUB.logoUrl);
    const propio = estado.base.iconoUrl ?? estado.config.iconoUrl;
    const iconoUrl = propio ?? logoUrl;
    const fIcono: Fuente =
      estado.base.iconoUrl !== undefined
        ? 'base'
        : estado.config.iconoUrl !== undefined
          ? 'config'
          : fLogo;
    return MarcaApiSchema.parse({
      marca: { nombre, color, logoUrl, iconoUrl },
      fuentes: { nombre: fNombre, logo: fLogo, icono: fIcono, color: fColor },
    });
  }

  const json = (body: unknown, status: number) =>
    Response.json(body, { status });

  async function manejar(
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> {
    const req = input instanceof Request ? input : null;
    const url = new URL(req ? req.url : String(input), 'http://stub');
    if (url.pathname !== RUTA_API_MARCA) {
      return json({ error: 'no-encontrado' }, 404);
    }
    const metodo = (init?.method ?? req?.method ?? 'GET').toUpperCase();
    if (!permiteEditarMarca(rolActual)) {
      return json({ error: 'sin-permiso' }, 403);
    }

    if (metodo === 'GET') return json(efectiva(), 200);

    if (metodo === 'PUT') {
      const body = init?.body ?? null;
      if (!(body instanceof FormData)) {
        return json({ error: 'sin-campos' }, 400);
      }
      const entrada: EntradaPut = {};
      let peso = 0;
      for (const [k, v] of body.entries()) {
        if (typeof v === 'string') {
          peso += v.length;
          if (k === 'nombre' || k === 'color') entrada[k] = v;
        } else {
          peso += v.size;
          if (k === 'logo' || k === 'icono') entrada[k] = v;
        }
      }
      if (peso > LIMITE_CUERPO_BYTES) {
        return json({ error: 'cuerpo-muy-pesado' }, 413);
      }
      const r = validarPut(entrada);
      if (!r.ok) {
        return json(
          r.error === 'sin-campos'
            ? { error: 'sin-campos' }
            : { error: 'validacion', campos: r.campos },
          400
        );
      }
      if (r.valores.nombre !== undefined) estado.base.nombre = r.valores.nombre;
      if (r.valores.color !== undefined) estado.base.color = r.valores.color;
      contador += 1;
      if (entrada.logo) estado.base.logoUrl = `/marca/logo?v=${contador}`;
      if (entrada.icono) estado.base.iconoUrl = `/marca/icono?v=${contador}`;
      const avisos: { campo: 'icono'; aviso: 'no-cuadrado' }[] = [];
      const icono = body.get('icono');
      if (icono instanceof File && !esCuadrado(icono)) {
        avisos.push({ campo: 'icono', aviso: 'no-cuadrado' });
      }
      return json(RespuestaPutSchema.parse({ ...efectiva(), avisos }), 200);
    }

    if (metodo === 'DELETE') {
      const campo = url.searchParams.get('campo');
      if (!campo || !(CAMPOS as readonly string[]).includes(campo)) {
        return json({ error: 'campo-invalido' }, 400);
      }
      const llave = (
        {
          nombre: 'nombre',
          color: 'color',
          logo: 'logoUrl',
          icono: 'iconoUrl',
        } as const
      )[campo as Campo];
      delete estado.base[llave];
      return json(efectiva(), 200);
    }

    return json({ error: 'metodo-no-permitido' }, 405);
  }

  return {
    fetch: manejar,
    estado: (): EstadoStub => ({
      base: { ...estado.base },
      config: { ...estado.config },
    }),
    rol: (r: RolMarca) => {
      rolActual = r;
    },
  };
}
