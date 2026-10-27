/**
 * Stub del contrato I2 (permisos efectivos): perfiles de fábrica y un
 * `ObtenerPermisosEfectivos` en memoria para que los consumidores prueben.
 */

import {
  PermisosEfectivosSchema,
  recortarSecciones,
  type IdSeccion,
  type ObtenerPermisosEfectivos,
  type PerfilRef,
  type PermisosEfectivos,
  type Rol,
} from './effective-permissions';

export const IDS_STUB = {
  cuenta: '10000000-0000-4000-8000-000000000001',
  otraCuenta: '10000000-0000-4000-8000-000000000002',
  owner: '20000000-0000-4000-8000-000000000001',
  admin: '20000000-0000-4000-8000-000000000002',
  asesor: '20000000-0000-4000-8000-000000000003',
  contestador: '20000000-0000-4000-8000-000000000004',
  marketing: '20000000-0000-4000-8000-000000000005',
  asesorIa: '20000000-0000-4000-8000-000000000006',
  sinPerfil: '20000000-0000-4000-8000-000000000007',
  perfilAsesor: '30000000-0000-4000-8000-000000000001',
  perfilContestador: '30000000-0000-4000-8000-000000000002',
  perfilMarketing: '30000000-0000-4000-8000-000000000003',
  perfilAsesorIa: '30000000-0000-4000-8000-000000000004',
} as const;

export const SECCIONES_STUB: readonly IdSeccion[] = [
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
];

const ASESOR = ['inbox', 'contacts', 'pipelines'];

export const PERFILES_STUB: Record<
  'asesor' | 'contestador' | 'marketing' | 'asesorIa',
  { ref: PerfilRef; secciones: IdSeccion[] }
> = {
  asesor: {
    ref: { id: IDS_STUB.perfilAsesor, nombre: 'Asesor' },
    secciones: ASESOR,
  },
  contestador: {
    ref: { id: IDS_STUB.perfilContestador, nombre: 'Contestador' },
    secciones: ['inbox', 'notifications'],
  },
  marketing: {
    ref: { id: IDS_STUB.perfilMarketing, nombre: 'Marketing' },
    secciones: SECCIONES_STUB.filter((s) => s !== 'settings'),
  },
  asesorIa: {
    ref: { id: IDS_STUB.perfilAsesorIa, nombre: 'Asesor con Agentes IA' },
    secciones: [...ASESOR, 'agents'],
  },
};

const USUARIO_POR_PERFIL = {
  asesor: IDS_STUB.asesor,
  contestador: IDS_STUB.contestador,
  marketing: IDS_STUB.marketing,
  asesorIa: IDS_STUB.asesorIa,
} as const;

export function stubPermisos(e: {
  rol: Rol;
  perfil?: keyof typeof PERFILES_STUB | null;
  contratadas?: readonly IdSeccion[];
  usuarioId?: string;
  cuentaId?: string;
}): PermisosEfectivos {
  const perfil = e.perfil ? PERFILES_STUB[e.perfil] : null;
  const usuarioDefecto =
    e.rol === 'owner'
      ? IDS_STUB.owner
      : e.rol === 'admin'
        ? IDS_STUB.admin
        : e.perfil
          ? USUARIO_POR_PERFIL[e.perfil]
          : IDS_STUB.sinPerfil;
  return PermisosEfectivosSchema.parse({
    cuentaId: e.cuentaId ?? IDS_STUB.cuenta,
    usuarioId: e.usuarioId ?? usuarioDefecto,
    rol: e.rol,
    perfil: perfil ? perfil.ref : null,
    secciones: recortarSecciones({
      rol: e.rol,
      seccionesPerfil: perfil ? perfil.secciones : null,
      contratadas: e.contratadas ?? SECCIONES_STUB,
    }),
  });
}

export function stubObtenerPermisos(
  permisos: readonly PermisosEfectivos[]
): ObtenerPermisosEfectivos {
  return async ({ cuentaId, usuarioId }) =>
    permisos.find(
      (p) => p.cuentaId === cuentaId && p.usuarioId === usuarioId
    ) ?? null;
}
