/**
 * Modos de juego: Oleadas (10 oleadas por arena con jefe en la última) y Resistencia (oleadas sin fin).
 */
export type GameMode = 'waves' | 'endless';

export const MODE_ORDER: readonly GameMode[] = ['waves', 'endless'];

export function isGameMode(v: unknown): v is GameMode {
  return v === 'waves' || v === 'endless';
}
