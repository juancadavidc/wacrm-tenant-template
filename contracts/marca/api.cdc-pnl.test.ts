import { describe, expect, it } from 'vitest';
import {
  ErrorSimpleSchema,
  ErrorValidacionSchema,
  LOGO_MAX_BYTES,
  MarcaApiSchema,
  RespuestaPutSchema,
  RUTA_API_MARCA,
} from './api';
import { CONFIG_STUB, crearStubFetchMarca } from './api.stub';

const file = (n: number, type = 'image/png') =>
  new File([new Uint8Array(n)], 'x', { type });
const form = (campos: Record<string, string | File>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.append(k, v);
  return f;
};
const get = async (s: ReturnType<typeof crearStubFetchMarca>) =>
  MarcaApiSchema.parse(await (await s.fetch(RUTA_API_MARCA)).json());
const put = (s: ReturnType<typeof crearStubFetchMarca>, b: FormData) =>
  s.fetch(RUTA_API_MARCA, { method: 'PUT', body: b });

describe('CDC PNL.1 · API de marca', () => {
  it('al abrir trae los cuatro campos con su fuente', async () => {
    const m = await get(crearStubFetchMarca());
    expect(Object.keys(m.marca).sort()).toEqual(
      ['color', 'iconoUrl', 'logoUrl', 'nombre'].sort()
    );
    expect(Object.keys(m.fuentes).sort()).toEqual(
      ['color', 'icono', 'logo', 'nombre'].sort()
    );
  });
  it('ícono no cuadrado se guarda con aviso (R6)', async () => {
    const s = crearStubFetchMarca({ esCuadrado: () => false });
    const r = await put(s, form({ icono: file(10) }));
    expect(r.status).toBe(200);
    const b = RespuestaPutSchema.parse(await r.json());
    expect(b.avisos).toContainEqual({ campo: 'icono', aviso: 'no-cuadrado' });
    expect(b.fuentes.icono).toBe('base');
  });
  it('logo jpeg: 400 y nada cambia (R8)', async () => {
    const s = crearStubFetchMarca();
    const antes = await get(s);
    const r = await put(s, form({ logo: file(10, 'image/jpeg') }));
    expect(r.status).toBe(400);
    const e = ErrorValidacionSchema.parse(await r.json());
    expect(e.campos.logo).toBe('tipo');
    expect(await get(s)).toEqual(antes);
  });
  it('color válido con nombre largo: 400 y el color no cambia', async () => {
    const s = crearStubFetchMarca();
    const antes = await get(s);
    const r = await put(s, form({ color: '#111111', nombre: 'a'.repeat(61) }));
    expect(r.status).toBe(400);
    const e = ErrorValidacionSchema.parse(await r.json());
    expect(e.campos.nombre).toBe('muy-largo');
    expect((await get(s)).marca.color).toBe(antes.marca.color);
  });
  it('logo pesado: 400 con motivo, no 413', async () => {
    const s = crearStubFetchMarca();
    const r = await put(s, form({ logo: file(LOGO_MAX_BYTES + 1) }));
    expect(r.status).toBe(400);
    expect(ErrorValidacionSchema.parse(await r.json()).campos.logo).toBe(
      'muy-pesado'
    );
  });
  it('restaurar el logo vuelve a config o a defecto', async () => {
    const s = crearStubFetchMarca();
    await put(s, form({ logo: file(10) }));
    const m = MarcaApiSchema.parse(
      await (
        await s.fetch(`${RUTA_API_MARCA}?campo=logo`, { method: 'DELETE' })
      ).json()
    );
    expect(m.fuentes.logo).toBe('config');
    expect(m.marca.logoUrl).toBe(CONFIG_STUB.logoUrl);

    const sin = crearStubFetchMarca({ estado: { config: {} } });
    await put(sin, form({ logo: file(10) }));
    const d = MarcaApiSchema.parse(
      await (
        await sin.fetch(`${RUTA_API_MARCA}?campo=logo`, { method: 'DELETE' })
      ).json()
    );
    expect(d.fuentes.logo).toBe('defecto');
    expect(d.marca.iconoUrl).toBe(d.marca.logoUrl);
  });
  it('el PUT trae las URL nuevas para refrescar sidebar y favicon', async () => {
    const s = crearStubFetchMarca();
    const antes = await get(s);
    const b = RespuestaPutSchema.parse(
      await (await put(s, form({ logo: file(10), icono: file(10) }))).json()
    );
    expect(b.marca.logoUrl).not.toBe(antes.marca.logoUrl);
    expect(b.marca.iconoUrl).not.toBe(antes.marca.iconoUrl);
  });
  it('admin: GET da 403 sin-permiso', async () => {
    const r = await crearStubFetchMarca({ rol: 'admin' }).fetch(RUTA_API_MARCA);
    expect(r.status).toBe(403);
    expect(ErrorSimpleSchema.parse(await r.json()).error).toBe('sin-permiso');
  });
});
