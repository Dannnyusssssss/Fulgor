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
}

export const DIFFICULTY_ORDER: readonly Difficulty[] = ['easy', 'normal', 'hard'];

export const DIFFICULTIES: Readonly<Record<Difficulty, DifficultyDef>> = {
  easy: {
    budgetMultiplier: 0.75,
    damageTakenMultiplier: 0.7,
    maxAlive: 14,
    scoreMultiplier: 0.75,
    dropMultiplier: 1.3,
  },
  normal: {
    budgetMultiplier: 1,
    damageTakenMultiplier: 1,
    maxAlive: 18,
    scoreMultiplier: 1,
    dropMultiplier: 1,
  },
  hard: {
    budgetMultiplier: 1.3,
    damageTakenMultiplier: 1.25,
    maxAlive: 24,
    scoreMultiplier: 1.5,
    dropMultiplier: 0.8,
  },
};

export function isDifficulty(v: unknown): v is Difficulty {
  return v === 'easy' || v === 'normal' || v === 'hard';
}
