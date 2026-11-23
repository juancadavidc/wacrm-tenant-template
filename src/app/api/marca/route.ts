import { leerSesionMarca } from '@/lib/marca/editor';
import { escrituraMarca } from '@/lib/marca/escritura';
import { crearHandlersMarca } from '@/lib/marca/handlers';

// Ver el contrato I1 en contracts/marca/api.ts.
export const dynamic = 'force-dynamic';

const handlers = crearHandlersMarca({
  sesion: leerSesionMarca,
  escritura: escrituraMarca,
});

export const GET = handlers.GET;
export const PUT = handlers.PUT;
export const DELETE = handlers.DELETE;
