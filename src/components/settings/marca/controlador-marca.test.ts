import { describe, expect, it, vi } from 'vitest';
import {
  ICONO_MAX_BYTES,
  LOGO_MAX_BYTES,
  type RolMarca,
} from '@contracts/marca/api';
import {
  CONFIG_STUB,
  MARCA_DEFECTO_STUB,
  crearStubFetchMarca,
  type OpcionesStub,
} from '@contracts/marca/api.stub';
import {
  crearControladorMarca,
  type DepsControlador,
} from './controlador-marca';

const png = (nombre: string, bytes = 100) =>
  new File([new Uint8Array(bytes)], nombre, { type: 'image/png' });
const jpg = () =>
  new File([new Uint8Array(10)], 'f.jpg', { type: 'image/jpeg' });

function armar(
  o: OpcionesStub & { medida?: { ancho: number; alto: number } | null } = {},
  fetchFalso?: DepsControlador['fetch']
) {
  const stub = crearStubFetchMarca(o);
  const base = fetchFalso ?? stub.fetch;
  const llamadas: { metodo: string; cuerpo: unknown }[] = [];
  const fetch: DepsControlador['fetch'] = (i, init) => {
    llamadas.push({ metodo: init?.method ?? 'GET', cuerpo: init?.body });
    return base(i, init);
  };
  const alAplicar = vi.fn();
  const revocarUrl = vi.fn();
  const c = crearControladorMarca({
    fetch,
    crearUrl: (f) => `blob:${f.name}`,
    revocarUrl,
    medir: async () => (o.medida === undefined ? null : o.medida),
    alAplicar,
  });
  return { c, stub, llamadas, alAplicar, revocarUrl };
}

async function como(rol: RolMarca) {
  const t = armar({ rol });
  await t.c.cargar();
  return t;
}

describe('controlador de la pantalla de marca', () => {
  it('cargar como owner deja la pantalla lista con las fuentes', async () => {
    const { c } = await como('owner');
    expect(c.estado().fase).toBe('lista');
    expect(c.estado().actual?.fuentes.logo).toBe('config');
  });

  it('cargar como admin da sin-permiso', async () => {
    const { c } = await como('admin');
    expect(c.estado().fase).toBe('sin-permiso');
  });

  it('un ícono válido se ve en la vista previa antes de guardar', async () => {
    const { c, alAplicar } = await como('owner');
    await c.elegirArchivo('icono', png('icono.png'));
    expect(c.vistaPrevia().iconoUrl).toBe('blob:icono.png');
    expect(c.vistaPrevia().logoUrl).toBe(CONFIG_STUB.logoUrl);
    expect(alAplicar).not.toHaveBeenCalled();
  });

  it('un .jpg deja el motivo junto al campo y no cambia nada', async () => {
    const { c, llamadas } = await como('owner');
    const antes = c.vistaPrevia();
    await c.elegirArchivo('logo', jpg());
    expect(c.estado().errores.logo).toBe('tipo');
    expect(c.estado().borrador.logo).toBeUndefined();
    expect(c.vistaPrevia()).toEqual(antes);
    expect(llamadas.map((l) => l.metodo)).toEqual(['GET']);
  });

  it('un .jpg después de un PNG válido deja el PNG', async () => {
    const { c } = await como('owner');
    await c.elegirArchivo('logo', png('a.png'));
    await c.elegirArchivo('logo', jpg());
    expect(c.estado().borrador.logo?.name).toBe('a.png');
    expect(c.vistaPrevia().logoUrl).toBe('blob:a.png');
    expect(c.estado().errores.logo).toBe('tipo');
  });

  it('rechaza logo e ícono demasiado pesados', async () => {
    const { c } = await como('owner');
    await c.elegirArchivo('logo', png('l.png', LOGO_MAX_BYTES + 1));
    await c.elegirArchivo('icono', png('i.png', ICONO_MAX_BYTES + 1));
    expect(c.estado().errores).toEqual({
      logo: 'muy-pesado',
      icono: 'muy-pesado',
    });
  });

  it('un ícono no cuadrado avisa antes y después de guardar, y se guarda', async () => {
    const t = armar({
      medida: { ancho: 200, alto: 100 },
      esCuadrado: () => false,
    });
    await t.c.cargar();
    await t.c.elegirArchivo('icono', png('i.png'));
    expect(t.c.estado().iconoNoCuadrado).toBe(true);
    await t.c.guardar();
    expect(t.c.estado().iconoNoCuadrado).toBe(true);
    expect(t.c.estado().actual?.fuentes.icono).toBe('base');
    expect(t.alAplicar).toHaveBeenCalledTimes(1);
    expect(t.alAplicar.mock.calls[0][0].marca.iconoUrl).toMatch(
      /^\/marca\/icono\?v=/
    );
  });

  it('si no se puede medir el ícono, no avisa antes de guardar', async () => {
    const { c } = await como('owner');
    await c.elegirArchivo('icono', png('i.png'));
    expect(c.estado().iconoNoCuadrado).toBe(false);
  });

  it('un color inválido no llega al servidor', async () => {
    const { c, stub, llamadas } = await como('owner');
    c.cambiarTexto('nombre', 'Nueva');
    c.cambiarTexto('color', 'red');
    await c.guardar();
    expect(c.estado().errores.color).toBe('formato');
    expect(stub.estado().base).toEqual({});
    expect(llamadas.some((l) => l.metodo === 'PUT')).toBe(false);
  });

  it('un 400 del servidor se muestra por campo y no cambia la marca', async () => {
    const stub = crearStubFetchMarca();
    const t = armar({}, async (i, init) =>
      init?.method === 'PUT'
        ? Response.json(
            { error: 'validacion', campos: { nombre: 'muy-largo' } },
            { status: 400 }
          )
        : stub.fetch(i, init)
    );
    await t.c.cargar();
    t.c.cambiarTexto('nombre', 'x');
    await t.c.guardar();
    expect(t.c.estado().errores.nombre).toBe('muy-largo');
    expect(t.alAplicar).not.toHaveBeenCalled();
  });

  it('el PUT solo manda lo elegido y nunca un archivo vacío', async () => {
    const { c, llamadas } = await como('owner');
    c.cambiarTexto('nombre', 'Nueva');
    await c.elegirArchivo('icono', png('i.png'));
    await c.guardar();
    const put = llamadas.find((l) => l.metodo === 'PUT');
    const cuerpo = put?.cuerpo as FormData;
    expect([...cuerpo.keys()].sort()).toEqual(['icono', 'nombre']);
    for (const [, v] of cuerpo.entries()) {
      if (typeof v !== 'string') {
        expect(v.size).toBeGreaterThan(0);
        expect(v.name).not.toBe('');
      }
    }
    expect(cuerpo.has('logo')).toBe(false);
    expect(cuerpo.has('color')).toBe(false);
  });

  it('un archivo vacío (0 bytes, sin tipo) no entra al borrador ni al PUT', async () => {
    // I1 responde 400 `tipo` ante un archivo de 0 bytes: no se envía.
    const { c, llamadas } = await como('owner');
    await c.elegirArchivo('logo', new File([], '', { type: '' }));
    expect(c.estado().errores.logo).toBe('tipo');
    expect(c.estado().borrador.logo).toBeUndefined();
    c.cambiarTexto('color', '#112233');
    await c.guardar();
    const cuerpo = llamadas.find((l) => l.metodo === 'PUT')?.cuerpo as FormData;
    expect([...cuerpo.keys()]).toEqual(['color']);
  });

  it('restaurar el logo vuelve a config/ o a Stackless según la fuente', async () => {
    const { c, alAplicar } = await como('owner');
    await c.elegirArchivo('logo', png('l.png'));
    await c.guardar();
    await c.restaurar('logo');
    expect(c.estado().restaurado).toEqual({ campo: 'logo', fuente: 'config' });
    expect(c.estado().actual?.marca.logoUrl).toBe(CONFIG_STUB.logoUrl);
    expect(alAplicar).toHaveBeenCalledTimes(2);

    const t = armar({ estado: { config: {} } });
    await t.c.cargar();
    await t.c.restaurar('logo');
    expect(t.c.estado().restaurado).toEqual({
      campo: 'logo',
      fuente: 'defecto',
    });
    expect(t.c.estado().actual?.marca.logoUrl).toBe(MARCA_DEFECTO_STUB.logoUrl);
  });

  it('hayCambios sigue al borrador', async () => {
    const { c } = await como('owner');
    expect(c.hayCambios()).toBe(false);
    c.cambiarTexto('nombre', 'Otra');
    expect(c.hayCambios()).toBe(true);
    await c.guardar();
    expect(c.hayCambios()).toBe(false);
  });

  it('desmontar revoca las URLs de la vista previa', async () => {
    const { c, revocarUrl } = await como('owner');
    await c.elegirArchivo('logo', png('l.png'));
    await c.elegirArchivo('icono', png('i.png'));
    c.desmontar();
    expect(revocarUrl).toHaveBeenCalledWith('blob:l.png');
    expect(revocarUrl).toHaveBeenCalledWith('blob:i.png');
  });
});
