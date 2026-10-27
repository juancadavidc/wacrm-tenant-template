import { NextResponse } from 'next/server';
import { toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { requireSuperadmin } from '@/lib/permisos/superadmin';
import { CuentaEmpresaError, leerVista } from '@/lib/permisos/vista-superadmin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireSuperadmin();
    return NextResponse.json(await leerVista(supabaseAdmin()));
  } catch (err) {
    if (err instanceof CuentaEmpresaError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return toErrorResponse(err);
  }
}
