import { describe, expect, it, vi } from 'vitest';
import { MarcaSchema } from '@contracts/marca/marca';
import { stubMarca } from '@contracts/marca/marca.stub';
import type { RolMarca } from '@contracts/marca/api';
import { fusionarMarca } from '@/components/marca/aplicar-marca';
import {
  crearControladorMarca,
  type DepsControlador,
} from './controlador-marca';

export type OpcionesCdc = {
  rol: RolMarca;
  sinConfig?: boolean;
  esCuadrado?: boolean;
};
export type CrearFetch = (o: OpcionesCdc) => DepsControlador['fetch'];

const archivo = (nombre: string, tipo = 'image/png') =>
  new File([new Uint8Array(64)], nombre, { type: tipo });

function pantalla(
  crear: CrearFetch,
  o: OpcionesCdc,
  medida: { ancho: number; alto: number } | null = null
) {
  const alAplicar = vi.fn();
  const c = crearControladorMarca({
    fetch: crear(o),
    crearUrl: (f) => `blob:${f.name}`,
    revocarUrl: () => {},
    medir: async () => medida,
    alAplicar,
  });
  return { c, alAplicar };
}

/**
 * Casos de la pantalla de Marca (PNL.1) que no saben contra qué corren: el
 * stub de CT.1 o la API real de MRC.2.
 */
export function suiteCdcPantalla(nombre: string, crear: CrearFetch) {
  describe(`CDC PNL.1 · pantalla de marca (${nombre})`, () => {
    it('el owner ve la fuente de los cuatro campos; un admin, sin permiso', async () => {
      const { c } = pantalla(crear, { rol: 'owner' });
      await c.cargar();
      expect(c.estado().fase).toBe('lista');
      expect(Object.keys(c.estado().actual?.fuentes ?? {}).sort()).toEqual([
        'color',
        'icono',
        'logo',
        'nombre',
      ]);
      const admin = pantalla(crear, { rol: 'admin' });
      await admin.c.cargar();
      expect(admin.c.estado().fase).toBe('sin-permiso');
    });

    it('elegir un ícono muestra la vista previa y guardar cambia el sidebar y el favicon', async () => {
      const { c, alAplicar } = pantalla(crear, { rol: 'owner' });
      await c.cargar();
      await c.elegirArchivo('icono', archivo('icono.png'));
      expect(c.vistaPrevia().iconoUrl).toBe('blob:icono.png');
      expect(alAplicar).not.toHaveBeenCalled();
      await c.guardar();
      expect(alAplicar).toHaveBeenCalledTimes(1);
      const recibido = alAplicar.mock.calls[0][0];
      const fusionada = fusionarMarca(stubMarca('soloConfig'), recibido);
      expect(MarcaSchema.safeParse(fusionada).success).toBe(true);
      expect(fusionada.iconoUrl).toBe(recibido.marca.iconoUrl);
      expect(fusionada.marcaUrl).toBe(recibido.marca.iconoUrl);
    });

    it('un .jpg en el logo deja el motivo `tipo` y no cambia nada', async () => {
      const { c, alAplicar } = pantalla(crear, { rol: 'owner' });
      await c.cargar();
      const antes = c.estado().actual;
      await c.elegirArchivo('logo', archivo('f.jpg', 'image/jpeg'));
      expect(c.estado().errores.logo).toBe('tipo');
      await c.guardar();
      expect(alAplicar).not.toHaveBeenCalled();
      const otra = pantalla(crear, { rol: 'owner' });
      await otra.c.cargar();
      expect(otra.c.estado().actual).toEqual(antes);
    });

    it('un ícono no cuadrado se guarda con el aviso', async () => {
      const { c } = pantalla(
        crear,
        { rol: 'owner', esCuadrado: false },
        { ancho: 200, alto: 100 }
      );
      await c.cargar();
      await c.elegirArchivo('icono', archivo('i.png'));
      expect(c.estado().iconoNoCuadrado).toBe(true);
      await c.guardar();
      expect(c.estado().iconoNoCuadrado).toBe(true);
      expect(c.estado().actual?.fuentes.icono).toBe('base');
    });

    it('restaurar el logo vuelve a config/ o a Stackless', async () => {
      const conConfig = pantalla(crear, { rol: 'owner' });
      await conConfig.c.cargar();
      await conConfig.c.elegirArchivo('logo', archivo('l.png'));
      await conConfig.c.guardar();
      await conConfig.c.restaurar('logo');
      expect(conConfig.c.estado().restaurado).toEqual({
        campo: 'logo',
        fuente: 'config',
      });

      const sinConfig = pantalla(crear, { rol: 'owner', sinConfig: true });
      await sinConfig.c.cargar();
      await sinConfig.c.elegirArchivo('logo', archivo('l.png'));
      await sinConfig.c.guardar();
      await sinConfig.c.restaurar('logo');
      expect(sinConfig.c.estado().restaurado).toEqual({
        campo: 'logo',
        fuente: 'defecto',
      });
    });
  });
}
