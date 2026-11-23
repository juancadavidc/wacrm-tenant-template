// La cierra MRC.1: cada `it.todo` se convierte en prueba real contra
// `leerMarca()` y las rutas `/marca/logo` y `/marca/icono`.
import { describe, it } from 'vitest';

describe('verificación del publicador de I2 (MRC.1)', () => {
  it.todo('leerMarca() devuelve una marca que pasa MarcaSchema');
  it.todo(
    'con color en la base y logo y nombre en config/, toma el color de la base y el resto de config/'
  );
  it.todo('sin base ni config/, devuelve la marca de Stackless');
  it.todo('con la base caída, devuelve la marca de config/');
  it.todo('al cambiar el archivo en la base, cambia la versión de iconoUrl');
  it.todo(
    '/marca/logo y /marca/icono responden 200 desde la base y desde config/ y cumplen verificarRespuestaArchivo'
  );
  it.todo(
    '/marca/logo sin logo propio responde 200 con el logo de Stackless; /marca/icono sin ícono propio responde 404'
  );
  it.todo(
    'config/marca.yaml de hoy (solo logo y color) sigue valiendo sin cambios'
  );
});
