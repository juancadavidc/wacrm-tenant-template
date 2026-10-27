// ============================================================
// PUT /api/account/members/[userId]/profile (USR.2)
//
// Admin+. Asigna o quita (perfilId: null) el perfil de un
// usuario. R10 (nadie cambia el suyo) y R17 (owner y admin no
// llevan perfil) las aplica la RPC permisos_asignar_perfil.
// ============================================================

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { getT } from '@/lib/i18n/translate';
import { AsignacionSchema } from '@/lib/permisos/perfiles';
import { respuestaErrorRpc } from '@/lib/permisos/perfiles-rutas';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';

const t = getT('Api');

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const ctx = await requireRole('admin');
    const limit = checkRateLimit(
      `admin:perfiles:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);

    const { userId } = await params;
    const cuerpo = AsignacionSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!cuerpo.success || !z.uuid().safeParse(userId).success) {
      return NextResponse.json(
        { error: t('account.profiles.invalid') },
        { status: 400 }
      );
    }
    const { error } = await ctx.supabase.rpc('permisos_asignar_perfil', {
      p_user_id: userId,
      p_perfil_id: cuerpo.data.perfilId,
    });
    if (error) return respuestaErrorRpc(error);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
