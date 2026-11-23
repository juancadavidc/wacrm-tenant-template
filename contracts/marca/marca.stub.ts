/**
 * Stub de I2 (marca efectiva), derivado del contrato. Lo usan las CDC de PNL.
 */
import {
  armarMarca,
  MarcaSchema,
  verificarRespuestaArchivo,
  type CandidatoMarca,
  type LeerMarca,
  type Marca,
  type TipoArchivoMarca,
} from './marca';

type Candidatos = { base?: CandidatoMarca; config?: CandidatoMarca };

const SOLO_CONFIG: Candidatos = {
  config: { nombre: 'Barú', color: '#0a7d5a', logo: { version: 'cfg1' } },
};

export const CANDIDATOS_STUB = {
  stackless: {},
  soloConfig: SOLO_CONFIG,
  colorEnBase: { ...SOLO_CONFIG, base: { color: '#112233' } },
  iconoEnBase: { ...SOLO_CONFIG, base: { icono: { version: 'ico1' } } },
  iconoCambiado: { ...SOLO_CONFIG, base: { icono: { version: 'ico2' } } },
} satisfies Record<string, Candidatos>;

export function stubMarca(nombre: keyof typeof CANDIDATOS_STUB): Marca {
  return armarMarca(CANDIDATOS_STUB[nombre]);
}

export function stubLeerMarca(m: Marca): LeerMarca {
  return async () => MarcaSchema.parse(structuredClone(m));
}

const CSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

/** Ruta de archivo: 200 con los headers del contrato, o 404 sin archivo. */
export function stubRutaArchivo(
  archivo: { tipo: TipoArchivoMarca; cuerpo: string } | null
): () => Promise<Response> {
  return async () => {
    if (!archivo) return new Response(null, { status: 404 });
    const res = new Response(archivo.cuerpo, {
      status: 200,
      headers: {
        'Content-Type': archivo.tipo,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': CSP,
      },
    });
    if (verificarRespuestaArchivo(res).length > 0) {
      throw new Error('el stub no cumple el contrato');
    }
    return res;
  };
}
