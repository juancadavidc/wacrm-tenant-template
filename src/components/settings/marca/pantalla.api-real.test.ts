/**
 * La misma suite de la pantalla contra la API real (`/api/marca`).
 *
 * Pendiente: MRC.2 (`src/app/api/marca/route.ts`) y MRC.1 (`leerMarca()`
 * asíncrona) aún no están en `main`. Quien mergee el último de los dos
 * reemplaza este `it.todo` por `suiteCdcPantalla('api real', …)` armando un
 * `fetch` que llame a GET/PUT/DELETE del route handler con los mismos mocks
 * de sesión y storage que usa `src/app/api/marca/route.test.ts`.
 */
import { describe, it } from 'vitest';

describe('CDC PNL.1 · pantalla de marca (api real)', () => {
  it.todo(
    'la suite de la pantalla pasa contra /api/marca (se activa con MRC.1 y MRC.2 en main)'
  );
});
