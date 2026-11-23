import { describe, expect, it } from 'vitest';
import {
  ICONO_MAX_BYTES,
  LIMITE_CUERPO_BYTES,
  MarcaApiSchema,
  RespuestaPutSchema,
  type RolMarca,
} from './api';
import { crearStubFetchMarca } from './api.stub';

const file = (n: number, type = 'image/png') =>
  new File([new Uint8Array(n)], 'x', { type });
const form = (campos: Record<string, string | File>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.append(k, v);
  return f;
};
const put = (s: ReturnType<typeof crearStubFetchMarca>, b: FormData) =>
  s.fetch('/api/marca', { method: 'PUT', body: b });

describe('stub de I1', () => {
  it('GET por defecto', async () => {
    const s = crearStubFetchMarca();
    const r = await s.fetch('/api/marca');
    expect(r.status).toBe(200);
    const m = MarcaApiSchema.parse(await r.json());
    expect(m.marca.nombre).toBe('Barú');
    expect(m.fuentes).toEqual({
      nombre: 'config',
      logo: 'config',
      icono: 'config',
      color: 'config',
    });
    expect(m.marca.iconoUrl).toBe(m.marca.logoUrl);
  });
  it('sin config todo es defecto', async () => {
    const s = crearStubFetchMarca({ estado: { config: {} } });
    const m = MarcaApiSchema.parse(await (await s.fetch('/api/marca')).json());
    expect(m.marca.nombre).toBe('Stackless');
    expect(Object.values(m.fuentes)).toEqual([
      'defecto',
      'defecto',
      'defecto',
      'defecto',
    ]);
  });
  it('PUT color y luego GET', async () => {
    const s = crearStubFetchMarca();
    expect((await put(s, form({ color: '#111111' }))).status).toBe(200);
    const m = MarcaApiSchema.parse(await (await s.fetch('/api/marca')).json());
    expect(m.marca.color).toBe('#111111');
    expect(m.fuentes.color).toBe('base');
  });
  it('PUT de ícono y logo', async () => {
    const s = crearStubFetchMarca();
    const a = RespuestaPutSchema.parse(
      await (await put(s, form({ icono: file(10) }))).json()
    );
    expect(a.fuentes.icono).toBe('base');
    expect(a.marca.iconoUrl).not.toBe(a.marca.logoUrl);
    const l1 = RespuestaPutSchema.parse(
      await (await put(s, form({ logo: file(10) }))).json()
    );
    const l2 = RespuestaPutSchema.parse(
      await (await put(s, form({ logo: file(10) }))).json()
    );
    expect(l1.marca.logoUrl).not.toBe(l2.marca.logoUrl);
  });
  it('PUT sin campos y cuerpo pesado', async () => {
    const s = crearStubFetchMarca();
    const r = await put(s, form({}));
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'sin-campos' });
    const g = await put(s, form({ logo: file(LIMITE_CUERPO_BYTES + 1) }));
    expect(g.status).toBe(413);
    expect(await g.json()).toEqual({ error: 'cuerpo-muy-pesado' });
  });
  it('PUT inválido no guarda nada', async () => {
    const s = crearStubFetchMarca();
    const antes = s.estado();
    const r = await put(
      s,
      form({ color: '#111111', icono: file(ICONO_MAX_BYTES + 1) })
    );
    expect(r.status).toBe(400);
    expect(s.estado()).toEqual(antes);
  });
  it('DELETE con campo inválido', async () => {
    const s = crearStubFetchMarca();
    const antes = s.estado();
    for (const q of ['?campo=foto', '?campo=', '']) {
      const r = await s.fetch(`/api/marca${q}`, { method: 'DELETE' });
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ error: 'campo-invalido' });
    }
    expect(s.estado()).toEqual(antes);
  });
  it('DELETE idempotente y restaura', async () => {
    const s = crearStubFetchMarca();
    const r = await s.fetch('/api/marca?campo=color', { method: 'DELETE' });
    expect(r.status).toBe(200);
    await put(s, form({ logo: file(10) }));
    const m = MarcaApiSchema.parse(
      await (
        await s.fetch('/api/marca?campo=logo', { method: 'DELETE' })
      ).json()
    );
    expect(m.fuentes.logo).toBe('config');
  });
  it('permisos', async () => {
    const s = crearStubFetchMarca();
    for (const rol of ['admin', 'usuario'] as RolMarca[]) {
      s.rol(rol);
      for (const [metodo, url, body] of [
        ['GET', '/api/marca', undefined],
        ['PUT', '/api/marca', form({ color: '#111111' })],
        ['DELETE', '/api/marca?campo=color', undefined],
      ] as const) {
        const r = await s.fetch(url, { method: metodo, body });
        expect(r.status).toBe(403);
        expect(await r.json()).toEqual({ error: 'sin-permiso' });
      }
    }
    s.rol('superadmin');
    expect((await s.fetch('/api/marca')).status).toBe(200);
  });
  it('otra ruta es 404', async () => {
    expect((await crearStubFetchMarca().fetch('/api/otra')).status).toBe(404);
  });
});
