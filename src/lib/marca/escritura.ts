import { createHash } from 'node:crypto';
import {
  ICONO_MAX_BYTES,
  LOGO_MAX_BYTES,
  MarcaApiSchema,
  validarPut,
  type Campo,
  type ErrorValidacion,
  type MarcaApi,
} from '@contracts/marca/api';
import type { Marca } from '@contracts/marca/marca';
import {
  BUCKET_MARCA,
  clienteMarca,
  invalidarCacheMarca,
  leerFilaMarca,
  TABLA_MARCA,
  type FilaMarca,
} from './base';
import {
  coincideTipo,
  dimensiones,
  extensionDe,
  type TipoImagen,
} from './imagen';
import { leerMarca } from './marca';
import { limpiarSvg } from './svg';

/**
 * Guardar y restaurar la marca (MRC.2): valida, sube al bucket, escribe la
 * fila, borra el archivo anterior e invalida la caché del proceso.
 */

export type ArchivoSubido = {
  type: string;
  size: number;
  bytes: () => Promise<Uint8Array>;
};
export type EntradaGuardar = {
  nombre?: string;
  color?: string;
  logo?: ArchivoSubido;
  icono?: ArchivoSubido;
};
type Cambios = Partial<
  Pick<FilaMarca, 'nombre' | 'color' | 'logo_ruta' | 'icono_ruta'>
>;

export type DepsEscritura = {
  leerFila: () => Promise<FilaMarca | null>;
  guardarFila: (cambios: Cambios, userId: string) => Promise<void>;
  subir: (ruta: string, bytes: Uint8Array, tipo: string) => Promise<void>;
  borrar: (rutas: string[]) => Promise<void>;
  invalidar: () => void;
  leerMarca: () => Promise<Marca>;
};

export type ResultadoGuardar =
  | {
      ok: true;
      marca: MarcaApi;
      avisos: { campo: 'icono'; aviso: 'no-cuadrado' }[];
    }
  | { ok: false; error: 'sin-campos' }
  | { ok: false; error: 'validacion'; campos: ErrorValidacion['campos'] };

const COLUMNA = {
  nombre: 'nombre',
  color: 'color',
  logo: 'logo_ruta',
  icono: 'icono_ruta',
} as const satisfies Record<Campo, keyof Cambios>;

/** La marca efectiva ya cumple `MarcaApiSchema` (R1 la resuelve `I2`). */
export function aMarcaApi(m: Marca): MarcaApi {
  return {
    marca: {
      nombre: m.nombre,
      color: m.color,
      logoUrl: m.logoUrl,
      iconoUrl: m.iconoUrl,
    },
    fuentes: { ...m.fuentes },
  };
}

type Preparado = { ruta: string; bytes: Uint8Array; tipo: TipoImagen };

async function prepararArchivo(
  campo: 'logo' | 'icono',
  archivo: ArchivoSubido
): Promise<
  { ok: true; valor: Preparado } | { ok: false; motivo: 'tipo' | 'muy-pesado' }
> {
  const tipo = archivo.type as TipoImagen;
  const tope = campo === 'logo' ? LOGO_MAX_BYTES : ICONO_MAX_BYTES;
  let bytes = await archivo.bytes();
  if (bytes.length > tope) return { ok: false, motivo: 'muy-pesado' };
  if (!coincideTipo(bytes, tipo)) return { ok: false, motivo: 'tipo' };
  if (tipo === 'image/svg+xml') {
    const limpio = limpiarSvg(new TextDecoder().decode(bytes));
    if (limpio === null) return { ok: false, motivo: 'tipo' };
    bytes = new TextEncoder().encode(limpio);
  }
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
  return {
    ok: true,
    valor: { ruta: `${campo}/${hash}.${extensionDe(tipo)}`, bytes, tipo },
  };
}

export function crearEscrituraMarca(d: DepsEscritura) {
  const leer = async (): Promise<MarcaApi> =>
    MarcaApiSchema.parse(aMarcaApi(await d.leerMarca()));

  async function borrarAnteriores(rutas: (string | null)[]) {
    const lista = rutas.filter((r): r is string => !!r);
    if (lista.length === 0) return;
    try {
      await d.borrar(lista);
    } catch (e) {
      console.warn(
        'marca: no se pudo borrar el archivo anterior:',
        e instanceof Error ? e.message : e
      );
    }
  }

  return {
    leer,

    async guardar(
      e: EntradaGuardar,
      userId: string
    ): Promise<ResultadoGuardar> {
      const v = validarPut(e);
      if (!v.ok) return v;

      // Los bytes tienen que coincidir con lo declarado; se juntan todos los
      // motivos antes de tocar nada (R8).
      const campos: ErrorValidacion['campos'] = {};
      const archivos: Partial<Record<'logo' | 'icono', Preparado>> = {};
      for (const campo of ['logo', 'icono'] as const) {
        const archivo = e[campo];
        if (!archivo) continue;
        const r = await prepararArchivo(campo, archivo);
        if (r.ok) archivos[campo] = r.valor;
        else campos[campo] = r.motivo;
      }
      if (Object.keys(campos).length > 0) {
        return { ok: false, error: 'validacion', campos };
      }

      const anterior = await d.leerFila();
      const cambios: Cambios = { ...v.valores };
      const subidas: string[] = [];
      const reemplazadas: (string | null)[] = [];
      const avisos: { campo: 'icono'; aviso: 'no-cuadrado' }[] = [];

      try {
        for (const campo of ['logo', 'icono'] as const) {
          const a = archivos[campo];
          if (!a) continue;
          const col = COLUMNA[campo];
          const vieja = anterior?.[col] ?? null;
          await d.subir(a.ruta, a.bytes, a.tipo);
          if (a.ruta !== vieja) subidas.push(a.ruta);
          cambios[col] = a.ruta;
          if (vieja !== a.ruta) reemplazadas.push(vieja);
          if (campo === 'icono') {
            const medida = dimensiones(a.bytes, a.tipo);
            if (medida && medida.ancho !== medida.alto) {
              avisos.push({ campo: 'icono', aviso: 'no-cuadrado' });
            }
          }
        }
        await d.guardarFila(cambios, userId);
      } catch (err) {
        await borrarAnteriores(subidas);
        throw err;
      }

      await borrarAnteriores(reemplazadas);
      d.invalidar();
      return { ok: true, marca: await leer(), avisos };
    },

    async restaurar(campo: Campo, userId: string): Promise<MarcaApi> {
      const fila = await d.leerFila();
      const col = COLUMNA[campo];
      const valor = fila?.[col] ?? null;
      if (valor === null) return leer();
      await d.guardarFila({ [col]: null }, userId);
      if (campo === 'logo' || campo === 'icono') {
        await borrarAnteriores([valor]);
      }
      d.invalidar();
      return leer();
    },
  };
}

/** Instancia real sobre el cliente de service role de MRC.1. */
export function escrituraMarca() {
  const cliente = () => clienteMarca({ timeoutMs: 15_000 });
  return crearEscrituraMarca({
    leerFila: () => leerFilaMarca(cliente()),
    async guardarFila(cambios, userId) {
      const { error } = await cliente()
        .from(TABLA_MARCA)
        .upsert(
          {
            id: true,
            ...cambios,
            actualizado_en: new Date().toISOString(),
            actualizado_por: userId,
          },
          { onConflict: 'id' }
        );
      if (error) throw new Error(error.message);
    },
    async subir(ruta, bytes, tipo) {
      const { error } = await cliente()
        .storage.from(BUCKET_MARCA)
        .upload(ruta, bytes, { contentType: tipo, upsert: true });
      if (error) throw new Error(error.message);
    },
    async borrar(rutas) {
      const { error } = await cliente()
        .storage.from(BUCKET_MARCA)
        .remove(rutas);
      if (error) throw new Error(error.message);
    },
    invalidar: invalidarCacheMarca,
    leerMarca,
  });
}
