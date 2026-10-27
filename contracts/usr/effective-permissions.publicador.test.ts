/**
 * Verificación del publicador de I2 (wacrm-permisos-granulares). La cierra
 * USR.1: cada `it.todo` se convierte en prueba real contra la implementación
 * de `ObtenerPermisosEfectivos`.
 */

import { describe, it } from 'vitest';

describe('verificación del publicador de I2 (USR.1)', () => {
  it.todo('devuelve permisos que pasan PermisosEfectivosSchema');
  it.todo(
    'owner y admin reciben todo lo contratado y perfil null (R9, R11, R17)'
  );
  it.todo(
    'un usuario recibe su perfil recortado por lo contratado, igual que recortarSecciones (R7, R12)'
  );
  it.todo(
    'con Agentes de IA apagada, un usuario con perfil Marketing no recibe agents'
  );
  it.todo('un invitado con rol usuario no tiene perfil ni secciones (R8)');
  it.todo(
    'tras la migración, un agente tiene perfil Asesor y un observador no tiene perfil'
  );
  it.todo('un usuario que no es miembro de la cuenta devuelve null');
});
