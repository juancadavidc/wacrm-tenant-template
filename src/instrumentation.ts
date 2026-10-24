// Arranque del servidor Next: carga y valida los módulos del fork (MOD.1).
// Una config de módulo inválida rechaza register() y tumba el arranque (R18).
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { obtenerFlujoEntrada } = await import('@/modulos/arranque');
  const flujo = obtenerFlujoEntrada();
  const encendidos = flujo.cargados
    .filter((m) => m.activo)
    .map((m) => m.nombre);
  console.log(`[modulos] encendidos: ${encendidos.join(', ') || '(ninguno)'}`);
}
