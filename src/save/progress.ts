/**
 * Progreso: mejores marcas por arena y dificultad, arenas completadas y desbloqueo de la siguiente arena.
 */
import { ARENAS } from '../data/arenas';
import type { Difficulty } from '../data/difficulty';
import { WEAPON_ORDER, WEAPON_UNLOCKS, type WeaponId } from '../data/weapons';
import { resultKey, type SaveData } from './schema';

export interface RunResult {
  /** La puntuación supera la mejor marca anterior. */
  newRecord: boolean;
  /** Mejor marca tras esta partida. */
  best: number;
  /** Arena desbloqueada por esta victoria, si la hay. */
  unlocked: string | null;
  /** Armas desbloqueadas por esta partida. */
  unlockedWeapons: WeaponId[];
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
  /** Oleada alcanzada (para los desbloqueos de armas). */
  waveReached = 0,
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
  const unlockedWeapons = unlockWeapons(save, arena, waveReached, victory);
  return { newRecord, best: Math.max(prev, score), unlocked, unlockedWeapons };
}

/** Desbloquea las armas cuya condición se cumple con esta partida (en cualquier dificultad). Modifica `save`. */
export function unlockWeapons(
  save: SaveData,
  arena: string,
  waveReached: number,
  victory: boolean,
): WeaponId[] {
  const gained: WeaponId[] = [];
  for (const id of WEAPON_ORDER) {
    if (save.progress.unlockedWeapons.includes(id)) continue;
    const rule = WEAPON_UNLOCKS[id];
    const ok =
      rule.kind === 'start' ||
      (rule.kind === 'reachWave' &&
        rule.arena === arena &&
        (waveReached >= rule.wave || victory)) ||
      (rule.kind === 'completeArena' && rule.arena === arena && victory);
    if (ok) {
      save.progress.unlockedWeapons.push(id);
      gained.push(id);
    }
  }
  save.progress.unlockedWeapons.sort((a, b) => WEAPON_ORDER.indexOf(a) - WEAPON_ORDER.indexOf(b));
  return gained;
}
