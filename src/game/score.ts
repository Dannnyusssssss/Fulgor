/**
 * Puntuación: puntos por enemigo con multiplicador de combo (racha de desactivaciones sin recibir daño),
 * bonificación por oleada limpia y multiplicador por dificultad.
 */
import { BALANCE } from '../data/balance';

export interface ScoreState {
  points: number;
  kills: number;
  /** Desactivaciones seguidas sin recibir daño. */
  combo: number;
  bestCombo: number;
  /** Se recibió daño durante la oleada actual. */
  waveDamaged: boolean;
}

export function createScore(): ScoreState {
  return { points: 0, kills: 0, combo: 0, bestCombo: 0, waveDamaged: false };
}

/** Multiplicador actual: 1 + paso × combo, con tope. */
export function comboMultiplier(combo: number): number {
  const s = BALANCE.score;
  return Math.min(s.comboMax, 1 + s.comboStep * Math.max(0, combo));
}

/** Suma los puntos de una desactivación. Devuelve los puntos sumados. */
export function addKill(
  score: ScoreState,
  basePoints: number,
  difficultyMultiplier: number,
): number {
  const gained = Math.round(basePoints * comboMultiplier(score.combo) * difficultyMultiplier);
  score.points += gained;
  score.kills++;
  score.combo++;
  if (score.combo > score.bestCombo) score.bestCombo = score.combo;
  return gained;
}

/** Recibir daño corta el combo y la oleada deja de ser limpia. */
export function onPlayerDamaged(score: ScoreState): void {
  score.combo = 0;
  score.waveDamaged = true;
}

export function onWaveStart(score: ScoreState): void {
  score.waveDamaged = false;
}

/** Al superar una oleada: bonificación si fue limpia. Devuelve la bonificación (0 si no). */
export function onWaveCleared(
  score: ScoreState,
  wave: number,
  difficultyMultiplier: number,
): number {
  if (score.waveDamaged) return 0;
  const bonus = Math.round(BALANCE.score.cleanWaveBonus * wave * difficultyMultiplier);
  score.points += bonus;
  return bonus;
}
