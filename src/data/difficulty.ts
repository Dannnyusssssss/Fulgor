/**
 * Dificultades: cambian el presupuesto de las oleadas, el daño recibido, el tope de enemigos vivos,
 * la puntuación y la probabilidad de soltar objetos.
 */
export type Difficulty = 'easy' | 'normal' | 'hard';

export interface DifficultyDef {
  budgetMultiplier: number;
  damageTakenMultiplier: number;
  maxAlive: number;
  scoreMultiplier: number;
  dropMultiplier: number;
  /** Vida del Coloso. */
  bossHealthMultiplier: number;
  /** Apuntado asistido (si está activado): mitad del cono (rad) y giro máximo (rad/s). */
  aimAssistCone: number;
  aimAssistRate: number;
}

export const DIFFICULTY_ORDER: readonly Difficulty[] = ['easy', 'normal', 'hard'];

export const DIFFICULTIES: Readonly<Record<Difficulty, DifficultyDef>> = {
  easy: {
    budgetMultiplier: 0.75,
    damageTakenMultiplier: 0.7,
    maxAlive: 14,
    scoreMultiplier: 0.75,
    dropMultiplier: 1.3,
    bossHealthMultiplier: 0.8,
    aimAssistCone: (8 * Math.PI) / 180,
    aimAssistRate: 0.8,
  },
  normal: {
    budgetMultiplier: 1,
    damageTakenMultiplier: 1,
    maxAlive: 18,
    scoreMultiplier: 1,
    dropMultiplier: 1,
    bossHealthMultiplier: 1,
    aimAssistCone: (6 * Math.PI) / 180,
    aimAssistRate: 0.6,
  },
  hard: {
    budgetMultiplier: 1.3,
    damageTakenMultiplier: 1.25,
    maxAlive: 24,
    scoreMultiplier: 1.5,
    dropMultiplier: 0.8,
    bossHealthMultiplier: 1.2,
    aimAssistCone: (4 * Math.PI) / 180,
    aimAssistRate: 0.4,
  },
};

export function isDifficulty(v: unknown): v is Difficulty {
  return v === 'easy' || v === 'normal' || v === 'hard';
}
