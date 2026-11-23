import { describe, expect, it } from 'vitest';
import {
  RUTAS_MARCA,
  tieneLogoPropio,
  URL_LOGO_DEFECTO,
  verificarRespuestaArchivo,
} from './marca';
import { stubLeerMarca, stubMarca, stubRutaArchivo } from './marca.stub';

describe('CDC PNL.1 · marca efectiva', () => {
  it('muestra la fuente de cada campo', () => {
    expect(stubMarca('colorEnBase').fuentes).toEqual({
      nombre: 'config',
      logo: 'config',
      icono: 'config',
      color: 'base',
    });
  });

  it('sin nada, todo es Stackless', () => {
    const m = stubMarca('stackless');
    expect(Object.values(m.fuentes).every((f) => f === 'defecto')).toBe(true);
    expect(m.logoUrl).toBe(URL_LOGO_DEFECTO);
    expect(m.iconoUrl).toBe(URL_LOGO_DEFECTO);
    expect(tieneLogoPropio(m)).toBe(false);
  });

  it('la vista previa del login usa el logo completo', () => {
    expect(stubMarca('soloConfig').logoUrl).toMatch(
      new RegExp(`^${RUTAS_MARCA.logo}\\?v=`)
    );
  });

  it('sin ícono, sidebar y pestaña usan el logo completo (R2)', () => {
    const m = stubMarca('soloConfig');
    expect(m.iconoUrl).toBe(m.logoUrl);
    expect(m.marcaUrl).toBe(m.iconoUrl);
  });

  it('con ícono, sidebar y pestaña usan /marca/icono', () => {
    const m = stubMarca('iconoEnBase');
    expect(m.iconoUrl.startsWith(`${RUTAS_MARCA.icono}?v=`)).toBe(true);
    expect(m.fuentes.icono).toBe('base');
  });

  it('al cambiar el ícono, la URL cambia', () => {
    expect(stubMarca('iconoEnBase').iconoUrl).not.toBe(
      stubMarca('iconoCambiado').iconoUrl
    );
  });

  it('restaurar el ícono vuelve al logo de config/', () => {
    const antes = stubMarca('iconoEnBase');
    const despues = stubMarca('soloConfig');
    expect(antes.fuentes.icono).toBe('base');
    expect(despues.fuentes.icono).toBe('config');
    expect(despues.iconoUrl).toBe(despues.logoUrl);
  });

  it('leerMarca del stub entrega lo que verá la pantalla', async () => {
    const m = stubMarca('iconoEnBase');
    expect(await stubLeerMarca(m)()).toEqual(m);
  });

  it('las rutas sirven con sandbox y nosniff, y 404 sin archivo', async () => {
    const ok = await stubRutaArchivo({ tipo: 'image/png', cuerpo: 'PNG' })();
    expect(verificarRespuestaArchivo(ok)).toEqual([]);
    expect((await stubRutaArchivo(null)()).status).toBe(404);
  });
});
