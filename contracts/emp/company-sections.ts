/**
 * Contrato I1 · Catálogo de secciones y secciones contratadas
 * (PRD wacrm-permisos-granulares, origen 04-modulos#i1).
 * Publica EMP (EMP.1); consumen USR y SRV.
 * No lo cambies sin actualizar antes el PRD.
 */
import { z } from 'zod';

export const VERSION_CONTRATO = 'permisos.I1.v1';

/** Ids estables de sección, en el orden del catálogo de 03-alcance. */
export const IDS_SECCION = [
  'dashboard',
  'inbox',
  'notifications',
  'contacts',
  'pipelines',
  'broadcasts',
  'automations',
  'flows',
  'agents',
  'settings',
] as const;

export const SeccionIdSchema = z.enum(IDS_SECCION);
export type SeccionId = z.infer<typeof SeccionIdSchema>;

export const SeccionSchema = z.strictObject({
  id: SeccionIdSchema,
  nombre: z.string().min(1),
  ruta: z.string().regex(/^\/[a-z-]+$/),
  prefijosApi: z.array(z.string().regex(/^\/api(\/[a-z0-9-]+)+$/)),
});
export type Seccion = z.infer<typeof SeccionSchema>;

function contienePrefijo(prefijo: string, pathname: string): boolean {
  return pathname === prefijo || pathname.startsWith(prefijo + '/');
}

export const CatalogoSchema = z.array(SeccionSchema).superRefine((c, ctx) => {
  const ids = new Set<string>();
  const rutas = new Set<string>();
  for (const [i, s] of c.entries()) {
    if (ids.has(s.id)) {
      ctx.addIssue({
        code: 'custom',
        message: `id repetido: ${s.id}`,
        path: [i, 'id'],
      });
    }
    ids.add(s.id);
    if (rutas.has(s.ruta)) {
      ctx.addIssue({
        code: 'custom',
        message: `ruta repetida: ${s.ruta}`,
        path: [i, 'ruta'],
      });
    }
    rutas.add(s.ruta);
  }
  for (const [i, a] of c.entries()) {
    for (const [j, b] of c.entries()) {
      if (i === j) continue;
      for (const pa of a.prefijosApi) {
        for (const pb of b.prefijosApi) {
          if (contienePrefijo(pa, pb)) {
            ctx.addIssue({
              code: 'custom',
              message: `prefijo ${pb} anidado o repetido con ${pa} de otra sección`,
              path: [j, 'prefijosApi'],
            });
          }
        }
      }
    }
  }
});
export type Catalogo = z.infer<typeof CatalogoSchema>;

export const SeccionesContratadasSchema = z
  .strictObject({
    cuentaId: z.uuid(),
    secciones: z.array(SeccionIdSchema),
  })
  .refine((v) => new Set(v.secciones).size === v.secciones.length, {
    message: 'secciones con ids repetidos',
    path: ['secciones'],
  });
export type SeccionesContratadas = z.infer<typeof SeccionesContratadasSchema>;

export const CATALOGO_V1: Catalogo = Object.freeze(
  CatalogoSchema.parse([
    {
      id: 'dashboard',
      nombre: 'Panel',
      ruta: '/dashboard',
      prefijosApi: ['/api/whatsapp/health'],
    },
    {
      id: 'inbox',
      nombre: 'Bandeja de entrada',
      ruta: '/inbox',
      prefijosApi: [
        '/api/whatsapp/send',
        '/api/whatsapp/react',
        '/api/whatsapp/media',
        '/api/quick-replies',
        '/api/v1/conversations',
        '/api/v1/messages',
      ],
    },
    {
      id: 'notifications',
      nombre: 'Notificaciones',
      ruta: '/notifications',
      prefijosApi: [],
    },
    {
      id: 'contacts',
      nombre: 'Contactos',
      ruta: '/contacts',
      prefijosApi: ['/api/contacts', '/api/v1/contacts'],
    },
    {
      id: 'pipelines',
      nombre: 'Pipelines',
      ruta: '/pipelines',
      prefijosApi: [],
    },
    {
      id: 'broadcasts',
      nombre: 'Difusiones',
      ruta: '/broadcasts',
      prefijosApi: ['/api/whatsapp/broadcast', '/api/v1/broadcasts'],
    },
    {
      id: 'automations',
      nombre: 'Automatizaciones',
      ruta: '/automations',
      prefijosApi: ['/api/automations'],
    },
    {
      id: 'flows',
      nombre: 'Flujos',
      ruta: '/flows',
      prefijosApi: ['/api/flows'],
    },
    {
      id: 'agents',
      nombre: 'Agentes de IA',
      ruta: '/agents',
      // `/api/ai/config` (solo la raíz) es de cuenta/sesión: ver RUTAS_API_DE_CUENTA.
      prefijosApi: ['/api/ai'],
    },
    {
      id: 'settings',
      nombre: 'Configuración',
      ruta: '/settings',
      prefijosApi: [
        '/api/whatsapp/config',
        '/api/whatsapp/templates',
        '/api/account/members', // la raíz exacta es de cuenta (RUTAS_API_DE_CUENTA)
        '/api/account/invitations',
        '/api/account/api-keys',
        '/api/v1/webhooks',
      ],
    },
  ])
) as Catalogo;

/**
 * Lecturas compartidas entre secciones: rutas exactas (sin subrutas) que no
 * pertenecen a ninguna sección (R18). SRV.1 las pone en `RUTAS_API_LIBRES`.
 * - `/api/account/members`: selector de miembros de Agentes y Automatizaciones.
 * - `/api/ai/config`: estado de autorrespuesta que lee la Bandeja.
 * Sus escrituras (`/api/account/members/<id>`, POST/DELETE de config) siguen
 * protegidas por `requireRole('admin')`. El llamador pasa el pathname tal como
 * lo enruta Next.
 */
export const RUTAS_API_DE_CUENTA: readonly string[] = Object.freeze([
  '/api/account/members',
  '/api/ai/config',
]);

function normalizar(pathname: string): string {
  let p = pathname.split('#')[0].split('?')[0];
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

/** Sección dueña de una ruta de página, o null si no pertenece a ninguna. */
export function seccionDeRuta(
  catalogo: Catalogo,
  pathname: string
): SeccionId | null {
  const p = normalizar(pathname);
  return catalogo.find((s) => contienePrefijo(s.ruta, p))?.id ?? null;
}

/** Sección dueña de una ruta `/api`, o null (cuenta, sesión o sistema: R18). */
export function seccionDeApi(
  catalogo: Catalogo,
  pathname: string
): SeccionId | null {
  const p = normalizar(pathname);
  if (RUTAS_API_DE_CUENTA.includes(p)) return null;
  return (
    catalogo.find((s) => s.prefijosApi.some((x) => contienePrefijo(x, p)))
      ?.id ?? null
  );
}

/** Intersección pura (R7): en el orden de IDS_SECCION y sin repetidos. */
export function recortarPorContratadas(
  pedidas: readonly SeccionId[],
  contratadas: SeccionesContratadas
): SeccionId[] {
  return IDS_SECCION.filter(
    (id) => pedidas.includes(id) && contratadas.secciones.includes(id)
  );
}

/**
 * Lo que EMP.1 implementa. Cada llamada lee el estado vigente, sin caché que
 * exija redesplegar (R3).
 */
export interface FuenteSecciones {
  catalogo(): Promise<Catalogo>;
  contratadas(cuentaId: string): Promise<SeccionesContratadas>;
}
