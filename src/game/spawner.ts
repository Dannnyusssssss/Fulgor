/**
 * Aparición provisional de enemigos por oleadas de tamaño creciente.
 * El director de oleadas con presupuesto de puntos lo reemplaza en el Hito 2.
 */
export const SpawnPhase = {
  Rest: 0,
  Spawning: 1,
  Fighting: 2,
} as const;
export type SpawnPhaseId = (typeof SpawnPhase)[keyof typeof SpawnPhase];

export interface SpawnerState {
  wave: number;
  phase: SpawnPhaseId;
  /** Enemigos que faltan por aparecer en la oleada actual. */
  toSpawn: number;
  timer: number;
}

/** Descanso antes de la primera oleada. */
export const FIRST_REST_SECONDS = 2;

export function createSpawner(): SpawnerState {
  return { wave: 0, phase: SpawnPhase.Rest, toSpawn: 0, timer: FIRST_REST_SECONDS };
}

export function waveSize(wave: number, first: number, increment: number): number {
  return first + Math.max(0, wave - 1) * increment;
}
