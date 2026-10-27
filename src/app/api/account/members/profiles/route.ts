// ============================================================
// /api/account/members/profiles (USR.2)
//
//   GET  — perfiles de la cuenta con su conteo de usuarios.
//   POST — crea un perfil propio (R16).
//
// Admin+. Cuelga de /api/account/members/… para caer en la
// sección `settings` de I1. Escribe por la RPC
// permisos_guardar_perfil, que aplica las reglas en la base.
// ============================================================

import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { getT } from '@/lib/i18n/translate';
import { listarPerfiles, PerfilEntradaSchema } from '@/lib/permisos/perfiles';
import { respuestaErrorRpc } from '@/lib/permisos/perfiles-rutas';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';

const t = getT('Api');

export async function GET() {
  try {
    const ctx = await requireRole('admin');
    try {
      const perfiles = await listarPerfiles(ctx.supabase, ctx.accountId);
      return NextResponse.json({ perfiles });
    } catch (err) {
      console.error('[GET /api/account/members/profiles] error:', err);
      return NextResponse.json(
        { error: t('account.profiles.loadFailed') },
        { status: 500 }
      );
    }
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin');
    const limit = checkRateLimit(
      `admin:perfiles:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);

    const cuerpo = PerfilEntradaSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!cuerpo.success) {
      return NextResponse.json(
        { error: t('account.profiles.invalid') },
        { status: 400 }
      );
    }
    const { data, error } = await ctx.supabase.rpc('permisos_guardar_perfil', {
      p_perfil_id: null,
      p_nombre: cuerpo.data.nombre,
      p_secciones: cuerpo.data.secciones,
    });
    if (error) return respuestaErrorRpc(error);
    return NextResponse.json({ id: data as string }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
