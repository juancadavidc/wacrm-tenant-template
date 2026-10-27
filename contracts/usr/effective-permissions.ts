/**
 * Contrato de la interfaz I2 (PRD wacrm-permisos-granulares): permisos
 * efectivos de un usuario en una cuenta (rol, perfil y secciones que puede usar).
 * Publica: USR (USR.1)
 * Consumen: SRV (SRV.2)
 *
 * Fuente: prd-hub, prds/wacrm-permisos-granulares/slices/CT.2-contrato-permisos-efectivos.md
 * (origen 04-modulos#i2). No lo cambies sin actualizar antes el PRD.
 *
 * Convención de contracts/: `<nombre>.ts` (contrato), `<nombre>.stub.ts` (stub),
 * `<nombre>.cdc-<consumidor>.test.ts` (CDC) y `<nombre>.publicador.test.ts`
 * (verificación del publicador, pendiente hasta que lo implemente su slice).
 */

import { z } from 'zod';

export const VERSION_CONTRATO = 1;

/** Roles de cuenta. `superadmin` no es un rol de cuenta y no sale en I2. */
export const ROLES = ['owner', 'admin', 'usuario'] as const;
export const RolSchema = z.enum(ROLES);
export type Rol = z.infer<typeof RolSchema>;

/** Id de sección: la ruta de la página sin `/`. Se valida solo la forma. */
export const IdSeccionSchema = z.string().regex(/^[a-z][a-z0-9-]*$/);
export type IdSeccion = string;

export const PerfilRefSchema = z.strictObject({
  id: z.uuid(),
  nombre: z.string().trim().min(1),
});
export type PerfilRef = z.infer<typeof PerfilRefSchema>;

export const PermisosEfectivosSchema = z
  .strictObject({
    cuentaId: z.uuid(),
    usuarioId: z.uuid(),
    rol: RolSchema,
    perfil: PerfilRefSchema.nullable(),
    secciones: z.array(IdSeccionSchema),
  })
  .superRefine((p, ctx) => {
    if (new Set(p.secciones).size !== p.secciones.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['secciones'],
        message: 'secciones no admite repetidos',
      });
    }
    if (p.rol !== 'usuario' && p.perfil !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['perfil'],
        message: 'owner y admin no tienen perfil (R17)',
      });
    }
    if (p.rol === 'usuario' && p.perfil === null && p.secciones.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['secciones'],
        message: 'un usuario sin perfil no tiene secciones (R8)',
      });
    }
  });
export type PermisosEfectivos = z.infer<typeof PermisosEfectivosSchema>;

/**
 * Definición ejecutable de R7, R9, R11, R17 y R8: owner/admin reciben todas las
 * contratadas; un usuario recibe perfil ∩ contratadas; sin perfil, nada.
 * Conserva el orden de `contratadas`.
 */
export function recortarSecciones(e: {
  rol: Rol;
  seccionesPerfil: readonly IdSeccion[] | null;
  contratadas: readonly IdSeccion[];
}): IdSeccion[] {
  if (e.rol !== 'usuario') return [...e.contratadas];
  const perfil = e.seccionesPerfil;
  if (perfil === null) return [];
  return e.contratadas.filter((s) => perfil.includes(s));
}

export function puedeUsar(p: PermisosEfectivos, seccion: IdSeccion): boolean {
  return p.secciones.includes(seccion);
}

/** Lo que publica USR.1. `null` = el usuario no es miembro de esa cuenta. */
export type ObtenerPermisosEfectivos = (q: {
  cuentaId: string;
  usuarioId: string;
}) => Promise<PermisosEfectivos | null>;
