/**
 * Respuesta común de error de las rutas de perfiles de USR.2.
 */
import { NextResponse } from 'next/server';
import type { PostgrestError } from '@supabase/supabase-js';
import { getT } from '@/lib/i18n/translate';
import { errorRpcAEstado } from './perfiles';

const t = getT('Api');

export function respuestaErrorRpc(error: PostgrestError): NextResponse {
  const status = errorRpcAEstado(error);
  console.error('[perfiles] rpc error:', error);
  let mensaje = error.message;
  if (error.code === '23505') mensaje = t('account.profiles.nameTaken');
  else if (status === 500) mensaje = t('account.profiles.saveFailed');
  return NextResponse.json({ error: mensaje }, { status });
}
