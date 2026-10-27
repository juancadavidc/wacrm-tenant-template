// Verificación del publicador de I1 (PRD wacrm-permisos-granulares). La cierra EMP.1:
// cada it.todo se convierte en prueba real contra la implementación
// (prds/wacrm-permisos-granulares/slices/EMP.1-secciones-contratadas-por-empresa.md).
import { describe, it } from 'vitest';

describe('verificación del publicador de I1 · secciones (EMP.1)', () => {
  it.todo(
    'la fuente real implementa FuenteSecciones y su catálogo es igual a CATALOGO_V1'
  );
  it.todo(
    'contratadas() devuelve un valor que pasa SeccionesContratadasSchema'
  );
  it.todo(
    'tras la migración en una base con datos, la empresa tiene las 10 secciones prendidas (R20)'
  );
  it.todo(
    'una sección agregada al catálogo después de la migración queda apagada (R5)'
  );
  it.todo(
    'apagar y prender una sección cambia contratadas() sin reiniciar el servidor (R3)'
  );
  it.todo(
    'las migraciones de EMP.1 llevan prefijo propio y no tocan las de wacrm'
  );
});
