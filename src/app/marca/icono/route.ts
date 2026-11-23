import { responderArchivoMarca } from '@/lib/marca/marca';

// Config de la empresa montada en runtime: se lee en cada request, nunca en el build.
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  return responderArchivoMarca('icono');
}
