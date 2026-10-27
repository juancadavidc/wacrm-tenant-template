// ============================================================
// PATCH /api/account/members/profiles/[id] (USR.2)
//
// Admin+. Edita nombre y secciones de un perfil de la cuenta
// (también los de fábrica, R16). Sin borrar perfiles en USR.2.
// ============================================================

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { getT } from '@/lib/i18n/translate';
import { PerfilEntradaSchema } from '@/lib/permisos/perfiles';
import { respuestaErrorRpc } from '@/lib/permisos/perfiles-rutas';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';

const t = getT('Api');

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireRole('admin');
    const limit = checkRateLimit(
      `admin:perfiles:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);

    const { id } = await params;
    const cuerpo = PerfilEntradaSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!cuerpo.success || !z.uuid().safeParse(id).success) {
      return NextResponse.json(
        { error: t('account.profiles.invalid') },
        { status: 400 }
      );
    }
    const { error } = await ctx.supabase.rpc('permisos_guardar_perfil', {
      p_perfil_id: id,
      p_nombre: cuerpo.data.nombre,
      p_secciones: cuerpo.data.secciones,
    });
    if (error) return respuestaErrorRpc(error);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
