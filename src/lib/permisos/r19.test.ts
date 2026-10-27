import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ACCOUNT_ROLES, isAccountRole } from '@/lib/auth/roles';

const RAIZ = process.cwd();

function archivos(dir: string, ok: (f: string) => boolean): string[] {
  const salida: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) salida.push(...archivos(ruta, ok));
    else if (ok(ruta)) salida.push(ruta);
  }
  return salida;
}

const rel = (f: string) => relative(RAIZ, f).split('\\').join('/');

describe('R19: nadie da superadmin desde wacrm', () => {
  it('superadmin no es un rol de cuenta', () => {
    expect(isAccountRole('superadmin')).toBe(false);
    expect((ACCOUNT_ROLES as readonly string[]).includes('superadmin')).toBe(
      false
    );
  });

  it('ninguna migración agrega superadmin a account_role_enum', () => {
    const sql = archivos(join(RAIZ, 'supabase/migrations'), (f) =>
      f.endsWith('.sql')
    );
    const con = sql.filter((f) => /superadmin/i.test(readFileSync(f, 'utf8')));
    expect(con.map(rel)).toEqual([]);
  });

  it('las rutas que reciben un rol de cuenta son las probadas', () => {
    const rutas = archivos(join(RAIZ, 'src/app/api'), (f) =>
      f.endsWith('/route.ts')
    )
      .filter((f) => {
        const t = readFileSync(f, 'utf8');
        return (
          /isAccountRole\(\s*(role|body)\b/.test(t) || /set_member_role/.test(t)
        );
      })
      .map(rel)
      .sort();
    expect(rutas).toEqual([
      'src/app/api/account/invitations/route.ts',
      'src/app/api/account/members/[userId]/route.ts',
    ]);
  });

  it('ningún archivo de src escribe app_metadata', () => {
    const ts = archivos(
      join(RAIZ, 'src'),
      (f) => /\.tsx?$/.test(f) && !/\.(test|fake)\./.test(f)
    );
    const malos = ts.filter((f) => {
      const t = readFileSync(f, 'utf8');
      return /app_metadata\s*:/.test(t) || /updateUserById/.test(t);
    });
    expect(malos.map(rel)).toEqual([]);
  });

  it.skipIf(!existsSync(join(RAIZ, 'src/lib/secciones/acceso.ts')))(
    'si SRV.1 está, /api/superadmin es libre en el middleware',
    async () => {
      const { clasificarRuta } = await import('@/lib/secciones/acceso');
      expect(clasificarRuta('/api/superadmin/secciones')).toEqual({
        tipo: 'libre',
      });
    }
  );
});
