/**
 * Progreso: mejores marcas por arena y dificultad, arenas completadas y desbloqueo de la siguiente arena.
 */
import { ARENAS } from '../data/arenas';
import type { Difficulty } from '../data/difficulty';
import { resultKey, type SaveData } from './schema';

export interface RunResult {
  /** La puntuación supera la mejor marca anterior. */
  newRecord: boolean;
  /** Mejor marca tras esta partida. */
  best: number;
  /** Arena desbloqueada por esta victoria, si la hay. */
  unlocked: string | null;
}

export function bestFor(save: SaveData, arena: string, difficulty: Difficulty): number {
  return save.best[resultKey(arena, difficulty)] ?? 0;
}

export function isUnlocked(save: SaveData, arena: string): boolean {
  return save.progress.unlockedArenas.includes(arena);
}

/** Registra el resultado de una partida (modifica `save`). */
export function recordRun(
  save: SaveData,
  arena: string,
  difficulty: Difficulty,
  points: number,
  victory: boolean,
): RunResult {
  const key = resultKey(arena, difficulty);
  const prev = save.best[key] ?? 0;
  const score = Math.max(0, Math.floor(points));
  const newRecord = score > prev;
  if (newRecord) save.best[key] = score;
  let unlocked: string | null = null;
  if (victory) {
    if (!save.progress.completed.includes(key)) save.progress.completed.push(key);
    // Completar una arena en cualquier dificultad desbloquea la siguiente.
    const i = ARENAS.findIndex((a) => a.id === arena);
    const next = i >= 0 ? ARENAS[i + 1] : undefined;
    if (next !== undefined && !save.progress.unlockedArenas.includes(next.id)) {
      save.progress.unlockedArenas.push(next.id);
      unlocked = next.id;
    }
  }
  return { newRecord, best: Math.max(prev, score), unlocked };
}
