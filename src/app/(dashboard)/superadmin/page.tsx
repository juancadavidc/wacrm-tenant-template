import { connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import {
  CuentaEmpresaError,
  leerVista,
} from '@/lib/permisos/vista-superadmin';
import {
  AvisoCuentaEmpresa,
  InterruptoresSecciones,
  SinAccesoSuperadmin,
} from '@/components/superadmin/interruptores-secciones';
import { decidirPagina } from '@/lib/permisos/marca-superadmin';

export default async function SuperadminPage() {
  await connection();
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (decidirPagina(data?.user) === 'sin-acceso') {
    return <SinAccesoSuperadmin />;
  }
  let vista;
  try {
    vista = await leerVista(supabaseAdmin());
  } catch (err) {
    // Sin EMPRESA_ACCOUNT_ID válido la vista no opera: aviso, nunca una cuenta al azar.
    if (err instanceof CuentaEmpresaError) {
      return <AvisoCuentaEmpresa encontradas={0} />;
    }
    throw err;
  }
  return <InterruptoresSecciones inicial={vista} />;
}
