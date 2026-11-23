import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  archivoDeRuta,
  candidatoBase,
  clienteMarca,
  crearCacheFila,
  filaMarcaCacheada,
  leerFilaMarca,
  versionDeRuta,
  type FilaMarca,
} from './base';

const fila = (extra: Partial<FilaMarca> = {}): FilaMarca => ({
  nombre: null,
  color: null,
  logo_ruta: null,
  icono_ruta: null,
  actualizado_en: '2026-11-23T00:00:00Z',
  actualizado_por: null,
  ...extra,
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('versionDeRuta', () => {
  it('son 16 hex, estable y distinta por ruta', () => {
    expect(versionDeRuta('icono/a.png')).toMatch(/^[0-9a-f]{16}$/);
    expect(versionDeRuta('icono/a.png')).toBe(versionDeRuta('icono/a.png'));
    expect(versionDeRuta('icono/a.png')).not.toBe(versionDeRuta('icono/b.png'));
  });
});

describe('archivoDeRuta', () => {
  it('resuelve el tipo por extensión', () => {
    expect(archivoDeRuta('logo/x.SVG')).toEqual({
      ruta: 'logo/x.SVG',
      tipo: 'image/svg+xml',
      version: versionDeRuta('logo/x.SVG'),
    });
  });
  it('extensión desconocida o vacía es null', () => {
    expect(archivoDeRuta('logo/x.gif')).toBeNull();
    expect(archivoDeRuta(null)).toBeNull();
  });
});

describe('candidatoBase', () => {
  it('sin fila es vacío', () => {
    expect(candidatoBase(null)).toEqual({});
  });
  it('solo trae los campos presentes', () => {
    expect(
      candidatoBase(
        fila({ nombre: 'Barú', color: '#112233', logo_ruta: 'logo/a.png' })
      )
    ).toEqual({
      nombre: 'Barú',
      color: '#112233',
      logo: { version: versionDeRuta('logo/a.png') },
    });
  });
  it('una ruta con extensión desconocida invalida el campo', () => {
    expect(candidatoBase(fila({ logo_ruta: 'logo/abc.gif' }))).toEqual({});
  });
});

describe('crearCacheFila', () => {
  it('reutiliza 60 s, relee después e invalida', async () => {
    let t = 0;
    const leer = vi.fn().mockResolvedValue(fila({ color: '#112233' }));
    const c = crearCacheFila({ leer, ahora: () => t });
    await c.obtener();
    t = 60_000;
    await c.obtener();
    expect(leer).toHaveBeenCalledTimes(1);
    t = 60_001;
    await c.obtener();
    expect(leer).toHaveBeenCalledTimes(2);
    c.invalidar();
    await c.obtener();
    expect(leer).toHaveBeenCalledTimes(3);
  });

  it('llamadas simultáneas comparten una lectura', async () => {
    const leer = vi.fn().mockResolvedValue(null);
    const c = crearCacheFila({ leer, ahora: () => 0 });
    await Promise.all([c.obtener(), c.obtener()]);
    expect(leer).toHaveBeenCalledTimes(1);
  });

  it('un fallo devuelve null, avisa y se recuerda 5 s', async () => {
    let t = 0;
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const leer = vi.fn().mockRejectedValue(new Error('caída'));
    const c = crearCacheFila({ leer, ahora: () => t });
    expect(await c.obtener()).toBeNull();
    expect(aviso).toHaveBeenCalled();
    t = 5_000;
    await c.obtener();
    expect(leer).toHaveBeenCalledTimes(1);
    t = 5_001;
    await c.obtener();
    expect(leer).toHaveBeenCalledTimes(2);
  });
});

describe('clienteMarca', () => {
  it('lanza sin llave de service role', () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    expect(() => clienteMarca()).toThrow();
  });

  it('corta una base que no responde al vencer el timeout', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:1');
    vi.stubEnv('SUPABASE_INTERNAL_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'k');
    // fetch que nunca responde, pero respeta la señal de aborto
    vi.stubGlobal(
      'fetch',
      (_u: unknown, init?: RequestInit) =>
        new Promise((_res, rej) => {
          init?.signal?.addEventListener('abort', () =>
            rej(new Error('abortado'))
          );
        })
    );
    const t0 = Date.now();
    await expect(
      leerFilaMarca(clienteMarca({ timeoutMs: 50 }))
    ).rejects.toThrow();
    expect(Date.now() - t0).toBeLessThan(1_500);
  });
});

describe('filaMarcaCacheada', () => {
  it('sin llave de service role resuelve null', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await filaMarcaCacheada()).toBeNull();
  });
});
