// Verificación del publicador de I1 (wacrm-marca-ui). La cierra MRC.2: cada
// `it.todo` se convierte en prueba real contra `src/app/api/marca/route.ts`.
import { describe, it } from 'vitest';

describe('verificación del publicador de I1 (MRC.2)', () => {
  it.todo('GET devuelve un cuerpo que pasa MarcaApiSchema');
  it.todo(
    'PUT como owner y como superadmin responde 200 con RespuestaPutSchema; como admin y usuario, 403 sin-permiso (R5)'
  );
  it.todo(
    'PUT rechaza lo mismo que validarPut, con el mismo cuerpo 400, y la marca guardada no cambia (R6, R7, R8)'
  );
  it.todo('un ícono no cuadrado se guarda y responde el aviso no-cuadrado');
  it.todo(
    'un cuerpo de más de LIMITE_CUERPO_BYTES responde 413 cuerpo-muy-pesado'
  );
  it.todo(
    'DELETE ?campo= restaura un campo a config o a defecto; un campo inválido responde 400 campo-invalido (R9)'
  );
  it.todo('después de un PUT, GET devuelve el valor nuevo con fuente base');
});
