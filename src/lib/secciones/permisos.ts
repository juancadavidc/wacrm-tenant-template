import type { ObtenerPermisosEfectivos } from '@contracts/usr/effective-permissions';
import { crearObtenerPermisosEfectivos } from '@/lib/permisos/efectivos';
import { fuenteSecciones } from './fuente';

let registrado: ObtenerPermisosEfectivos | null = null;

/**
 * I2 vigente: el registrado o, por defecto, el publicador de USR.1 conectado a
 * la fuente de secciones vigente. Se crea en cada llamada (respeta la fuente
 * registrada) y sin caché (R3, R13).
 */
export function obtenerPermisos(): ObtenerPermisosEfectivos {
  return (
    registrado ?? crearObtenerPermisosEfectivos({ fuente: fuenteSecciones() })
  );
}

/** Solo pruebas: registra un I2; `null` restaura el de por defecto. */
export function usarObtenerPermisos(
  o: ObtenerPermisosEfectivos | null
): void {
  registrado = o;
}
