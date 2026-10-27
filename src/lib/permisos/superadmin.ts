/**
 * Superadmin de la instalación (R19): una marca en `app_metadata` de Supabase
 * Auth. `app_metadata` solo se escribe con la llave de servicio, desde el
 * script de la instalación; `user_metadata` (editable por el usuario) no cuenta.
 */
import { createClient } from '@/lib/supabase/server';
import { ForbiddenError, UnauthorizedError } from '@/lib/auth/account';

import { MARCA_SUPERADMIN, esSuperadmin } from './marca-superadmin';

export { MARCA_SUPERADMIN, esSuperadmin };

/** Lee el usuario en GoTrue en cada llamada: quitar la marca surte efecto ya. */
export async function requireSuperadmin(): Promise<{ userId: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) throw new UnauthorizedError();
  if (!esSuperadmin(data.user)) throw new ForbiddenError();
  return { userId: data.user.id };
}
