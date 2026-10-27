import { NextResponse } from 'next/server';
import { z } from 'zod';
import { toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { requireSuperadmin } from '@/lib/permisos/superadmin';
import {
  CuentaEmpresaError,
  cambiarSeccion,
  cuentaDeEmpresa,
  esSeccionId,
  leerVista,
} from '@/lib/permisos/vista-superadmin';

export const dynamic = 'force-dynamic';

const CuerpoSchema = z.strictObject({ prendida: z.boolean() });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // El chequeo de superadmin va antes de validar nada.
    await requireSuperadmin();

    const { id } = await params;
    if (!esSeccionId(id)) {
      return NextResponse.json(
        { error: 'sección desconocida' },
        { status: 404 }
      );
    }
    const cuerpo = CuerpoSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!cuerpo.success) {
      return NextResponse.json(
        { error: 'cuerpo inválido: se espera { prendida: boolean }' },
        { status: 400 }
      );
    }

    const admin = supabaseAdmin();
    const cuenta = await cuentaDeEmpresa(admin);
    await cambiarSeccion(admin, cuenta.id, id, cuerpo.data.prendida);
    return NextResponse.json(await leerVista(admin));
  } catch (err) {
    if (err instanceof CuentaEmpresaError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return toErrorResponse(err);
  }
}
