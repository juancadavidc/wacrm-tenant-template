/** Cliente de servicio falso en memoria para las pruebas de la vista. */
import { vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { IDS_SECCION } from '@contracts/emp/company-sections';

export type CuentaFalsa = { id: string; name: string; owner_user_id: string };

export function clienteFalso(opciones: {
  cuentas: CuentaFalsa[];
  usuarios: Record<string, Record<string, unknown>>;
  filas?: Record<string, boolean>;
  errorUpsert?: boolean;
}) {
  const filas = new Map<string, boolean>(Object.entries(opciones.filas ?? {}));
  const upsert = vi.fn(
    async (
      fila: { account_id: string; seccion_id: string; prendida: boolean },
      _opts: unknown
    ) => {
      if (opciones.errorUpsert) return { error: { message: 'boom interno' } };
      filas.set(`${fila.account_id}|${fila.seccion_id}`, fila.prendida);
      return { error: null };
    }
  );
  const cliente = {
    from: (tabla: string) => {
      if (tabla === 'accounts') {
        return {
          select: () => ({
            eq: (_col: string, valor: string) => ({
              maybeSingle: async () => ({
                data: opciones.cuentas.find((c) => c.id === valor) ?? null,
                error: null,
              }),
            }),
          }),
        };
      }
      return { upsert };
    },
    rpc: async (_fn: string, args: { p_account_id: string }) => ({
      data: IDS_SECCION.filter(
        (id) => filas.get(`${args.p_account_id}|${id}`) === true
      ),
      error: null,
    }),
    auth: {
      admin: {
        getUserById: async (id: string) => ({
          data: { user: { id, app_metadata: opciones.usuarios[id] ?? {} } },
          error: null,
        }),
      },
    },
  } as unknown as SupabaseClient;
  return { cliente, filas, upsert };
}
