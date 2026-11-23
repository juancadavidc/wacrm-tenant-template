import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ErrorSimpleSchema,
  ErrorValidacionSchema,
  LIMITE_CUERPO_BYTES,
  MarcaApiSchema,
  RespuestaPutSchema,
  type RolMarca,
} from '@contracts/marca/api';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { crearEscrituraMarca } from '@/lib/marca/escritura';
import { crearMarcaFalsa } from '@/lib/marca/escritura.fake';
import { crearHandlersMarca } from '@/lib/marca/handlers';
import { png } from '@/lib/marca/imagen.fixtures';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

const URL_MARCA = 'http://localhost/api/marca';
const dirs: string[] = [];
function dirConfig(logo = true): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'marca-ruta-'));
  dirs.push(dir);
  fs.writeFileSync(
    path.join(dir, 'empresa.yaml'),
    'empresa:\n  id: e\n  nombre: "Empresa"\n'
  );
  if (logo) {
    fs.writeFileSync(
      path.join(dir, 'marca.yaml'),
      'marca:\n  logo: logo.png\n'
    );
    fs.mkdirSync(path.join(dir, 'marca'));
    fs.writeFileSync(path.join(dir, 'marca', 'logo.png'), 'LOGOCFG');
  }
  return dir;
}
afterEach(() => {
  while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true });
});

function montar(
  rol: RolMarca | null,
  o: { sinConfig?: boolean; limitar?: (l: string) => Response | null } = {}
) {
  const f = crearMarcaFalsa({ dirConfig: dirConfig(!o.sinConfig) });
  const h = crearHandlersMarca({
    sesion: async () => (rol ? { userId: 'u1', rol } : null),
    escritura: () => crearEscrituraMarca(f.deps),
    limitar: o.limitar,
  });
  return { f, h };
}

const form = (campos: Record<string, string | File>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.append(k, v);
  return fd;
};
const archivo = (bytes: Uint8Array, type = 'image/png', n = 'x') =>
  new File([bytes as BlobPart], n, { type });
const grande = (n: number, type = 'image/png') =>
  new File([new Uint8Array(n)], 'x', { type });
const put = (fd: FormData, headers: Record<string, string> = {}) =>
  new Request(URL_MARCA, { method: 'PUT', body: fd, headers });
const del = (q: string) =>
  new Request(`${URL_MARCA}${q}`, { method: 'DELETE' });
const get = () => new Request(URL_MARCA);

describe('permiso (R5)', () => {
  it.each(['owner', 'superadmin'] as const)(
    'PUT como %s responde 200',
    async (rol) => {
      const { h } = montar(rol);
      const r = await h.PUT(put(form({ color: '#112233' })));
      expect(r.status).toBe(200);
      expect(RespuestaPutSchema.safeParse(await r.json()).success).toBe(true);
    }
  );

  it.each(['admin', 'usuario'] as const)(
    '%s recibe 403 en los tres métodos',
    async (rol) => {
      const { h } = montar(rol);
      for (const r of [
        await h.PUT(put(form({ color: '#112233' }))),
        await h.GET(get()),
        await h.DELETE(del('?campo=logo')),
      ]) {
        expect(r.status).toBe(403);
        expect(await r.json()).toEqual({ error: 'sin-permiso' });
      }
    }
  );

  it('sin sesión: 403 sin-permiso', async () => {
    const { h } = montar(null);
    expect((await h.GET(get())).status).toBe(403);
    expect((await h.PUT(put(form({ color: '#112233' })))).status).toBe(403);
    expect((await h.DELETE(del('?campo=logo'))).status).toBe(403);
  });
});

describe('validación (R6, R7, R8)', () => {
  const casos: [string, Record<string, string | File>, string, string][] = [
    [
      '.jpg',
      { logo: archivo(new Uint8Array(10), 'image/jpeg') },
      'logo',
      'tipo',
    ],
    [
      'logo de más de 1 MB',
      { logo: grande(1024 * 1024 + 1) },
      'logo',
      'muy-pesado',
    ],
    [
      'ícono de más de 512 KB',
      { icono: grande(512 * 1024 + 1) },
      'icono',
      'muy-pesado',
    ],
    ['color red', { color: 'red' }, 'color', 'formato'],
    ['nombre vacío', { nombre: '' }, 'nombre', 'vacio'],
    ['nombre de 61', { nombre: 'a'.repeat(61) }, 'nombre', 'muy-largo'],
    [
      'archivo de 0 bytes',
      { logo: archivo(new Uint8Array(0), 'application/octet-stream') },
      'logo',
      'tipo',
    ],
  ];
  it.each(casos)(
    '%s: 400 con el motivo y la marca no cambia',
    async (_n, campos, campo, motivo) => {
      const { h } = montar('owner');
      const antes = await (await h.GET(get())).json();
      const r = await h.PUT(put(form(campos)));
      expect(r.status).toBe(400);
      const e = ErrorValidacionSchema.parse(await r.json());
      expect(e.campos[campo as 'logo']).toBe(motivo);
      expect(await (await h.GET(get())).json()).toEqual(antes);
    }
  );

  it('413 si Content-Length pasa el límite; 400 sin campos', async () => {
    const { h } = montar('owner');
    const r = await h.PUT(
      put(form({ color: '#112233' }), {
        'content-length': String(LIMITE_CUERPO_BYTES + 1),
      })
    );
    expect(r.status).toBe(413);
    expect(ErrorSimpleSchema.parse(await r.json()).error).toBe(
      'cuerpo-muy-pesado'
    );
    const s = await h.PUT(put(form({})));
    expect(s.status).toBe(400);
    expect(await s.json()).toEqual({ error: 'sin-campos' });
  });

  it('413 si el cuerpo real pasa el límite aunque no haya Content-Length', async () => {
    const { h } = montar('owner');
    const r = await h.PUT(
      put(
        form({
          logo: grande(1000 * 1024),
          icono: grande(1000 * 1024),
          nombre: 'x'.repeat(200 * 1024),
        })
      )
    );
    expect(r.status).toBe(413);
  });
});

describe('DELETE y GET', () => {
  it.each(['', '?campo=', '?campo=foto'])(
    'DELETE %s: 400 campo-invalido',
    async (q) => {
      const { h } = montar('owner');
      const r = await h.DELETE(del(q));
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ error: 'campo-invalido' });
    }
  );

  it('DELETE ?campo=logo vuelve a config/ y borra el archivo', async () => {
    const { f, h } = montar('owner');
    await h.PUT(put(form({ logo: archivo(png(8, 8)) })));
    expect(f.archivos().size).toBe(1);
    const r = await h.DELETE(del('?campo=logo'));
    expect(r.status).toBe(200);
    expect(MarcaApiSchema.parse(await r.json()).fuentes.logo).toBe('config');
    expect(f.archivos().size).toBe(0);
  });

  it('DELETE ?campo=logo sin config/ vuelve a Stackless', async () => {
    const { h } = montar('owner', { sinConfig: true });
    await h.PUT(put(form({ logo: archivo(png(8, 8)) })));
    const r = MarcaApiSchema.parse(
      await (await h.DELETE(del('?campo=logo'))).json()
    );
    expect(r.fuentes.logo).toBe('defecto');
  });

  it('PUT de color y luego GET devuelve el valor nuevo con fuente base', async () => {
    const { h } = montar('owner');
    await h.PUT(put(form({ color: '#112233' })));
    const g = MarcaApiSchema.parse(await (await h.GET(get())).json());
    expect(g.marca.color).toBe('#112233');
    expect(g.fuentes.color).toBe('base');
  });
});

describe('rate limit', () => {
  it('PUT y DELETE llaman a limitar; GET no', async () => {
    let n = 0;
    const limitar = vi.fn((): Response | null =>
      ++n >= 3 ? new Response(null, { status: 429 }) : null
    );
    const { h } = montar('owner', { limitar });
    await h.GET(get());
    expect(limitar).not.toHaveBeenCalled();
    expect((await h.PUT(put(form({ color: '#112233' })))).status).toBe(200);
    expect((await h.DELETE(del('?campo=color'))).status).toBe(200);
    expect((await h.PUT(put(form({ color: '#445566' })))).status).toBe(429);
    expect(limitar).toHaveBeenCalledWith('admin:marca:u1');
  });

  it('un 403 no gasta rate limit', async () => {
    const limitar = vi.fn((): Response | null => null);
    const { h } = montar('admin', { limitar });
    await h.PUT(put(form({ color: '#112233' })));
    expect(limitar).not.toHaveBeenCalled();
  });
});

describe('route.ts', () => {
  it('exporta solo GET, PUT, DELETE y dynamic', async () => {
    const m = await import('./route');
    expect(Object.keys(m).sort()).toEqual(['DELETE', 'GET', 'PUT', 'dynamic']);
  });
});
