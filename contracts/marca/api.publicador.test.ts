// Verificación del publicador de I1 (wacrm-marca-ui). La cierra MRC.2: pruebas
// reales contra los handlers de `src/app/api/marca/route.ts`, con la fila y el
// storage en memoria.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { crearEscrituraMarca } from '@/lib/marca/escritura';
import { crearMarcaFalsa } from '@/lib/marca/escritura.fake';
import { crearHandlersMarca } from '@/lib/marca/handlers';
import { png } from '@/lib/marca/imagen.fixtures';
import {
  ErrorSimpleSchema,
  ErrorValidacionSchema,
  ICONO_MAX_BYTES,
  LIMITE_CUERPO_BYTES,
  LOGO_MAX_BYTES,
  MarcaApiSchema,
  RespuestaPutSchema,
  validarPut,
  type RolMarca,
} from './api';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'marca-pub-'));
fs.writeFileSync(
  path.join(dir, 'empresa.yaml'),
  'empresa:\n  id: e\n  nombre: "Empresa"\n'
);
fs.writeFileSync(path.join(dir, 'marca.yaml'), 'marca:\n  logo: logo.png\n');
fs.mkdirSync(path.join(dir, 'marca'));
fs.writeFileSync(path.join(dir, 'marca', 'logo.png'), 'LOGOCFG');
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const URL_MARCA = 'http://localhost/api/marca';

function montar(rol: RolMarca) {
  const f = crearMarcaFalsa({ dirConfig: dir });
  const h = crearHandlersMarca({
    sesion: async () => ({ userId: 'u1', rol }),
    escritura: () => crearEscrituraMarca(f.deps),
    limitar: () => null,
  });
  return { f, h };
}
const form = (campos: Record<string, string | File>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.append(k, v);
  return fd;
};
const put = (fd: FormData, headers: Record<string, string> = {}) =>
  new Request(URL_MARCA, { method: 'PUT', body: fd, headers });
const file = (n: number, type = 'image/png') =>
  new File([new Uint8Array(n)], 'x', { type });
const pngFile = (ancho: number, alto: number) =>
  new File([png(ancho, alto) as BlobPart], 'x.png', { type: 'image/png' });

describe('verificación del publicador de I1 (MRC.2)', () => {
  it('GET devuelve un cuerpo que pasa MarcaApiSchema', async () => {
    const { h } = montar('owner');
    const r = await h.GET(new Request(URL_MARCA));
    expect(r.status).toBe(200);
    expect(MarcaApiSchema.safeParse(await r.json()).success).toBe(true);
  });

  it('PUT como owner y como superadmin responde 200 con RespuestaPutSchema; como admin y usuario, 403 sin-permiso (R5)', async () => {
    for (const rol of ['owner', 'superadmin'] as const) {
      const r = await montar(rol).h.PUT(put(form({ color: '#112233' })));
      expect(r.status).toBe(200);
      expect(RespuestaPutSchema.safeParse(await r.json()).success).toBe(true);
    }
    for (const rol of ['admin', 'usuario'] as const) {
      const { h } = montar(rol);
      const r = await h.PUT(put(form({ color: '#112233' })));
      expect(r.status).toBe(403);
      expect(ErrorSimpleSchema.parse(await r.json()).error).toBe('sin-permiso');
      expect((await h.GET(new Request(URL_MARCA))).status).toBe(403);
      expect(
        (
          await h.DELETE(
            new Request(`${URL_MARCA}?campo=logo`, { method: 'DELETE' })
          )
        ).status
      ).toBe(403);
    }
  });

  it('PUT rechaza lo mismo que validarPut, con el mismo cuerpo 400, y la marca guardada no cambia (R6, R7, R8)', async () => {
    const casos: Record<string, string | File>[] = [
      { logo: file(10, 'image/jpeg') },
      { logo: file(LOGO_MAX_BYTES + 1) },
      { icono: file(ICONO_MAX_BYTES + 1) },
      { icono: file(10, 'image/gif') },
      { color: 'red' },
      { color: '#12345' },
      { nombre: '' },
      { nombre: '   ' },
      { nombre: 'a'.repeat(61) },
      { color: '#111111', nombre: 'a'.repeat(61) },
      { logo: file(0, 'application/octet-stream') },
      { logo: file(0, 'application/octet-stream'), color: '#112233' },
    ];
    for (const campos of casos) {
      const { h } = montar('owner');
      const antes = await (await h.GET(new Request(URL_MARCA))).json();
      const entrada = Object.fromEntries(
        Object.entries(campos).map(([k, v]) => [k, v])
      );
      const esperado = validarPut(entrada as Parameters<typeof validarPut>[0]);
      expect(esperado.ok).toBe(false);
      const r = await h.PUT(put(form(campos)));
      expect(r.status).toBe(400);
      const cuerpo = ErrorValidacionSchema.parse(await r.json());
      if (!esperado.ok && esperado.error === 'validacion') {
        expect(cuerpo).toEqual({
          error: 'validacion',
          campos: esperado.campos,
        });
      }
      expect(await (await h.GET(new Request(URL_MARCA))).json()).toEqual(antes);
    }
  });

  it('un ícono no cuadrado se guarda y responde el aviso no-cuadrado', async () => {
    const { h } = montar('owner');
    const r = await h.PUT(put(form({ icono: pngFile(32, 16) })));
    expect(r.status).toBe(200);
    const b = RespuestaPutSchema.parse(await r.json());
    expect(b.avisos).toContainEqual({ campo: 'icono', aviso: 'no-cuadrado' });
    expect(b.fuentes.icono).toBe('base');
  });

  it('un cuerpo de más de LIMITE_CUERPO_BYTES responde 413 cuerpo-muy-pesado', async () => {
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
  });

  it('DELETE ?campo= restaura un campo a config o a defecto; un campo inválido responde 400 campo-invalido (R9)', async () => {
    const { h } = montar('owner');
    await h.PUT(put(form({ logo: pngFile(8, 8), color: '#112233' })));
    const del = (q: string) =>
      h.DELETE(new Request(`${URL_MARCA}${q}`, { method: 'DELETE' }));
    const logo = MarcaApiSchema.parse(await (await del('?campo=logo')).json());
    expect(logo.fuentes.logo).toBe('config');
    const color = MarcaApiSchema.parse(
      await (await del('?campo=color')).json()
    );
    expect(color.fuentes.color).toBe('defecto');
    for (const q of ['', '?campo=', '?campo=foto']) {
      const r = await del(q);
      expect(r.status).toBe(400);
      expect(ErrorSimpleSchema.parse(await r.json()).error).toBe(
        'campo-invalido'
      );
    }
  });

  it('después de un PUT, GET devuelve el valor nuevo con fuente base', async () => {
    const { h } = montar('owner');
    await h.PUT(put(form({ nombre: 'Nueva', color: '#112233' })));
    const g = MarcaApiSchema.parse(
      await (await h.GET(new Request(URL_MARCA))).json()
    );
    expect(g.marca).toMatchObject({ nombre: 'Nueva', color: '#112233' });
    expect(g.fuentes).toMatchObject({ nombre: 'base', color: 'base' });
  });
});
