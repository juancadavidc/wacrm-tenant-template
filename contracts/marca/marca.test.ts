import { describe, expect, it } from 'vitest';
import { MarcaApiSchema } from './api';
import {
  armarMarca,
  MarcaSchema,
  tieneLogoPropio,
  urlConVersion,
  verificarRespuestaArchivo,
  type Marca,
} from './marca';

const stackless = armarMarca({});
const soloConfig = armarMarca({
  base: { color: '#112233' },
  config: { nombre: 'Barú', logo: { version: 'c1' } },
});
const iconoBase = armarMarca({
  config: { logo: { version: 'c1' } },
  base: { icono: { version: 'b7' } },
});
const logoBase = armarMarca({ base: { logo: { version: 'b1' } } });
const invalidos = armarMarca({
  base: { color: 'red', nombre: '   ' },
  config: { color: '#abcdef', nombre: '  Barú ' },
});
const todos = {
  stackless,
  soloConfig,
  iconoBase,
  logoBase,
  invalidos,
  soloConfigCompleto: armarMarca({
    config: {
      nombre: 'Barú',
      logo: { version: 'c1' },
      icono: { version: 'c2' },
    },
  }),
};

describe('armarMarca', () => {
  it('sin nada devuelve Stackless', () => {
    expect(stackless).toEqual({
      nombre: 'Stackless',
      color: '#2f7bf5',
      logoUrl: '/marca/logo?v=defecto',
      iconoUrl: '/marca/logo?v=defecto',
      marcaUrl: '/marca/logo?v=defecto',
      fuentes: {
        nombre: 'defecto',
        logo: 'defecto',
        icono: 'defecto',
        color: 'defecto',
      },
    });
  });

  it('toma cada campo de su primera fuente válida', () => {
    expect(soloConfig.color).toBe('#112233');
    expect(soloConfig.fuentes.color).toBe('base');
    expect(soloConfig.nombre).toBe('Barú');
    expect(soloConfig.fuentes.nombre).toBe('config');
    expect(soloConfig.logoUrl).toBe('/marca/logo?v=c1');
    expect(soloConfig.fuentes.logo).toBe('config');
  });

  it('R2: sin ícono, el ícono es el logo', () => {
    expect(soloConfig.iconoUrl).toBe('/marca/logo?v=c1');
    expect(soloConfig.marcaUrl).toBe(soloConfig.iconoUrl);
    expect(soloConfig.fuentes.icono).toBe('config');
    expect(logoBase.fuentes.icono).toBe('base');
  });

  it('con ícono propio usa /marca/icono', () => {
    expect(iconoBase.iconoUrl).toBe('/marca/icono?v=b7');
    expect(iconoBase.fuentes.icono).toBe('base');
  });

  it('R7: un nombre de más de 60 caracteres cae a la siguiente fuente', () => {
    const largo = 'a'.repeat(61);
    const m = armarMarca({
      base: { nombre: largo },
      config: { nombre: 'Barú' },
    });
    expect(m.nombre).toBe('Barú');
    expect(m.fuentes.nombre).toBe('config');
    expect(armarMarca({ base: { nombre: largo } }).nombre).toBe('Stackless');
    expect(
      armarMarca({ base: { nombre: 'a'.repeat(60) } }).nombre
    ).toHaveLength(60);
  });
  it('MarcaSchema rechaza un nombre de 61 caracteres', () => {
    const ok = armarMarca({});
    expect(
      MarcaSchema.safeParse({ ...ok, nombre: 'a'.repeat(61) }).success
    ).toBe(false);
    expect(
      MarcaSchema.safeParse({ ...ok, nombre: 'a'.repeat(60) }).success
    ).toBe(true);
  });

  it('R1: un valor inválido pasa a la siguiente fuente', () => {
    expect(invalidos.color).toBe('#abcdef');
    expect(invalidos.fuentes.color).toBe('config');
    expect(invalidos.nombre).toBe('Barú');
    const sinNombre = armarMarca({ base: { nombre: '   ' } });
    expect(sinNombre.nombre).toBe('Stackless');
    expect(sinNombre.fuentes.nombre).toBe('defecto');
  });

  it('una versión inválida o reservada se trata como ausente', () => {
    for (const version of ['a b', 'defecto', '']) {
      const m = armarMarca({ base: { logo: { version } } });
      expect(m.fuentes.logo).toBe('defecto');
    }
  });

  it('toda salida pasa MarcaSchema', () => {
    for (const m of Object.values(todos)) MarcaSchema.parse(m);
  });
});

describe('MarcaSchema rechaza', () => {
  const casos: [string, Marca][] = [
    [
      'marcaUrl distinto de iconoUrl',
      { ...iconoBase, marcaUrl: '/marca/logo?v=c1' },
    ],
    [
      'logo base con URL de defecto',
      { ...logoBase, logoUrl: '/marca/logo?v=defecto' },
    ],
    [
      'logo defecto con versión propia',
      { ...stackless, logoUrl: '/marca/logo?v=x' },
    ],
    ['logoUrl sin v', { ...soloConfig, logoUrl: '/marca/logo' }],
    [
      'logoUrl fuera de /marca',
      { ...stackless, logoUrl: '/stackless/logo.png' },
    ],
    [
      'icono defecto con logo propio',
      { ...soloConfig, fuentes: { ...soloConfig.fuentes, icono: 'defecto' } },
    ],
    [
      'iconoUrl distinto de logoUrl sin ícono propio',
      {
        ...soloConfig,
        iconoUrl: '/marca/logo?v=otro',
        marcaUrl: '/marca/logo?v=otro',
      },
    ],
    [
      'fuente base de ícono sin ícono propio y logo de config',
      { ...soloConfig, fuentes: { ...soloConfig.fuentes, icono: 'base' } },
    ],
    ['color corto', { ...stackless, color: '#fff' }],
    [
      'versión de ícono inválida',
      {
        ...iconoBase,
        iconoUrl: '/marca/icono?v=a b',
        marcaUrl: '/marca/icono?v=a b',
      },
    ],
  ];
  it.each(casos)('%s', (_n, m) => {
    expect(MarcaSchema.safeParse(m).success).toBe(false);
  });

  it('llave extra logoPropio', () => {
    expect(
      MarcaSchema.safeParse({ ...stackless, logoPropio: false }).success
    ).toBe(false);
  });
});

describe('coherencia con I1', () => {
  const aMarcaApi = (m: Marca, fuentes = m.fuentes) => ({
    marca: {
      nombre: m.nombre,
      color: m.color,
      logoUrl: m.logoUrl,
      iconoUrl: m.iconoUrl,
    },
    fuentes,
  });

  it('cada salida pasa MarcaApiSchema', () => {
    for (const m of Object.values(todos)) {
      MarcaApiSchema.parse(aMarcaApi(m));
    }
  });

  it('defecto y soloConfig coinciden con los stubs de CT.1', () => {
    expect(stackless.fuentes.icono).toBe('defecto');
    expect(stackless.iconoUrl).toBe(stackless.logoUrl);
    expect(stackless.logoUrl).toBe('/marca/logo?v=defecto');
    const c = armarMarca({
      config: { nombre: 'Barú', color: '#0a7d5a', logo: { version: 'config' } },
    });
    expect(c.fuentes.icono).toBe('config');
  });
});

describe('urlConVersion', () => {
  it('arma la URL con versión', () => {
    expect(urlConVersion('icono', 'v1')).toBe('/marca/icono?v=v1');
  });
  it('lanza con versión inválida o reservada', () => {
    expect(() => urlConVersion('logo', '')).toThrow();
    expect(() => urlConVersion('logo', 'defecto')).toThrow();
  });
});

describe('tieneLogoPropio', () => {
  it('es falso solo con el logo de Stackless', () => {
    expect(tieneLogoPropio(stackless)).toBe(false);
    expect(tieneLogoPropio(soloConfig)).toBe(true);
  });
});

describe('verificarRespuestaArchivo', () => {
  const buenos = {
    'Content-Type': 'image/svg+xml',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy':
      "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  };
  const con = (h: Record<string, string>) => new Response('x', { headers: h });

  it('cumple con los headers del contrato', () => {
    expect(verificarRespuestaArchivo(con(buenos))).toEqual([]);
  });
  it('falla sin nosniff', () => {
    const h: Record<string, string> = { ...buenos };
    delete h['X-Content-Type-Options'];
    expect(verificarRespuestaArchivo(con(h))).toHaveLength(1);
  });
  it('falla sin sandbox en la CSP (no vale como substring)', () => {
    expect(
      verificarRespuestaArchivo(
        con({ ...buenos, 'Content-Security-Policy': "default-src 'none'" })
      )
    ).toHaveLength(1);
    expect(
      verificarRespuestaArchivo(
        con({ ...buenos, 'Content-Security-Policy': "img-src 'sandbox'" })
      )
    ).toHaveLength(1);
  });
  it('falla con un tipo no aceptado', () => {
    expect(
      verificarRespuestaArchivo(
        con({ ...buenos, 'Content-Type': 'image/jpeg' })
      )
    ).toHaveLength(1);
  });
  it('un status distinto de 200 y 404 incumple', () => {
    for (const status of [500, 302, 403]) {
      expect(
        verificarRespuestaArchivo(new Response(null, { status })).length
      ).toBeGreaterThan(0);
    }
  });
  it('el Content-Type no distingue mayúsculas', () => {
    expect(
      verificarRespuestaArchivo(
        con({ ...buenos, 'Content-Type': 'IMAGE/SVG+XML' })
      )
    ).toEqual([]);
  });
  it('un 404 no exige nada', () => {
    expect(
      verificarRespuestaArchivo(new Response(null, { status: 404 }))
    ).toEqual([]);
  });
});
