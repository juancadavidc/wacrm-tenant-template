import {
  CampoSchema,
  LIMITE_CUERPO_BYTES,
  MarcaApiSchema,
  permiteEditarMarca,
  RespuestaPutSchema,
  type ErrorSimple,
  type ErrorValidacion,
} from '@contracts/marca/api';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import type { LeerSesionMarca, SesionMarca } from './editor';
import type {
  ArchivoSubido,
  crearEscrituraMarca,
  EntradaGuardar,
} from './escritura';

/**
 * Handlers HTTP de `/api/marca` (I1). Viven aquí y no en `route.ts` porque un
 * route handler de Next no puede exportar nombres que no sean de ruta.
 */

export type DepsHandlers = {
  sesion: LeerSesionMarca;
  escritura: () => ReturnType<typeof crearEscrituraMarca>;
  /** Devuelve una respuesta 429 si se pasó del límite. */
  limitar?: (llave: string) => Response | null;
};

const limitarPorDefecto = (llave: string): Response | null => {
  const r = checkRateLimit(llave, RATE_LIMITS.adminAction);
  return r.success ? null : rateLimitResponse(r);
};

const simple = (error: ErrorSimple['error'], status: number): Response =>
  Response.json({ error } satisfies ErrorSimple, { status });

function archivoDe(
  valor: FormDataEntryValue | null
): ArchivoSubido | undefined {
  if (valor === null) return undefined;
  if (typeof valor === 'string') {
    // Un texto donde va un archivo no es una imagen: motivo `tipo`.
    const bytes = new TextEncoder().encode(valor);
    return { type: 'text/plain', size: bytes.length, bytes: async () => bytes };
  }
  return {
    type: valor.type,
    size: valor.size,
    bytes: async () => new Uint8Array(await valor.arrayBuffer()),
  };
}

const texto = (v: FormDataEntryValue | null): string | undefined =>
  typeof v === 'string' ? v : undefined;

export function crearHandlersMarca(d: DepsHandlers) {
  const limitar = d.limitar ?? limitarPorDefecto;

  async function conPermiso(
    f: (s: SesionMarca) => Promise<Response>
  ): Promise<Response> {
    try {
      const s = await d.sesion();
      if (!s || !permiteEditarMarca(s.rol)) return simple('sin-permiso', 403);
      return await f(s);
    } catch (e) {
      console.error('[api/marca]', e);
      return Response.json({ error: 'interno' }, { status: 500 });
    }
  }

  return {
    GET: (_req: Request) =>
      conPermiso(async () =>
        Response.json(MarcaApiSchema.parse(await d.escritura().leer()))
      ),

    PUT: (req: Request) =>
      conPermiso(async (s) => {
        const limite = limitar(`admin:marca:${s.userId}`);
        if (limite) return limite;

        const largo = Number(req.headers.get('content-length'));
        if (Number.isFinite(largo) && largo > LIMITE_CUERPO_BYTES) {
          return simple('cuerpo-muy-pesado', 413);
        }
        let form: FormData;
        try {
          form = await req.formData();
        } catch {
          return simple('sin-campos', 400);
        }
        let total = 0;
        for (const [, v] of form) {
          total +=
            typeof v === 'string' ? new TextEncoder().encode(v).length : v.size;
        }
        if (total > LIMITE_CUERPO_BYTES)
          return simple('cuerpo-muy-pesado', 413);

        const entrada: EntradaGuardar = {};
        const nombre = texto(form.get('nombre'));
        const color = texto(form.get('color'));
        const logo = archivoDe(form.get('logo'));
        const icono = archivoDe(form.get('icono'));
        if (nombre !== undefined) entrada.nombre = nombre;
        if (color !== undefined) entrada.color = color;
        if (logo) entrada.logo = logo;
        if (icono) entrada.icono = icono;

        const r = await d.escritura().guardar(entrada, s.userId);
        if (r.ok) {
          return Response.json(
            RespuestaPutSchema.parse({ ...r.marca, avisos: r.avisos })
          );
        }
        if (r.error === 'sin-campos') return simple('sin-campos', 400);
        return Response.json(
          { error: 'validacion', campos: r.campos } satisfies ErrorValidacion,
          { status: 400 }
        );
      }),

    DELETE: (req: Request) =>
      conPermiso(async (s) => {
        const limite = limitar(`admin:marca:${s.userId}`);
        if (limite) return limite;
        const campo = CampoSchema.safeParse(
          new URL(req.url).searchParams.get('campo')
        );
        if (!campo.success) return simple('campo-invalido', 400);
        const marca = await d.escritura().restaurar(campo.data, s.userId);
        return Response.json(MarcaApiSchema.parse(marca));
      }),
  };
}
