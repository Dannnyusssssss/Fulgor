/**
 * Modo Resistencia: genera la oleada n (desde 1) a partir de los valores de `BALANCE.endless`.
 * Es una función pura: la misma oleada siempre da la misma definición. La composición concreta la decide
 * después el director con el flujo de oleadas del RNG, igual que en el modo Oleadas.
 */
import { BALANCE } from '../data/balance';
import type { RegularKindName } from '../data/enemies';
import type { KindCounts, WaveDef } from '../data/waves';

const E = BALANCE.endless;
const REGULAR: readonly RegularKindName[] = [
  'zumbador',
  'centinela',
  'blindado',
  'reparador',
  'vigia',
];

/** Oleada de jefe: cada `bossEvery` oleadas (10, 20, 30…). */
export function isEndlessBossWave(wave: number): boolean {
  return wave >= 1 && wave % E.bossEvery === 0;
}

/** Ciclo de jefe al que pertenece la oleada (1 para las oleadas 1–10, 2 para 11–20…). */
function cycleOf(wave: number): number {
  return Math.max(1, Math.ceil(wave / E.bossEvery));
}

/** Presupuesto de una oleada normal: crece de forma lineal y se detiene en el tope. */
export function endlessBudget(wave: number): number {
  const n = Math.max(1, Math.floor(wave));
  return Math.min(E.maxBudget, Math.round(E.baseBudget + E.budgetPerWave * (n - 1)));
}

/** Multiplicador de vida del Coloso en la oleada dada (1 en la primera aparición, sube con tope). */
export function endlessBossHealth(wave: number): number {
  return Math.min(E.bossHealthMax, 1 + E.bossHealthPerCycle * (cycleOf(wave) - 1));
}

/** Máximo de un tipo limitado en la oleada dada. */
function limitFor(limit: { base: number; perWaves: number; cap: number }, wave: number): number {
  return Math.min(limit.cap, limit.base + Math.floor(wave / limit.perWaves));
}

/** Definición de la oleada n del modo Resistencia. Crea un objeto nuevo (se llama una vez por oleada). */
export function endlessWaveDef(wave: number): WaveDef {
  const n = Math.max(1, Math.floor(wave));
  // Solo entran los tipos ya presentados en esta oleada.
  const weights: KindCounts = {};
  for (const kind of REGULAR) {
    if (n >= E.introWave[kind]) weights[kind] = E.weights[kind];
  }
  const max: KindCounts = {
    blindado: limitFor(E.limits.blindado, n),
    reparador: limitFor(E.limits.reparador, n),
    vigia: limitFor(E.limits.vigia, n),
  };
  if (isEndlessBossWave(n)) {
    // Oleada de jefe: el Coloso y una escolta pequeña que crece con cada ciclo.
    const escort = Math.min(
      E.bossEscortMax,
      E.bossEscortBase + E.bossEscortPerCycle * (cycleOf(n) - 1),
    );
    return {
      budget: escort,
      weights: { zumbador: 1, centinela: 0.6, vigia: 0.3 },
      required: { coloso: 1 },
      max: { centinela: 3, vigia: 2 },
      boss: true,
    };
  }
  return { budget: endlessBudget(n), weights, max };
}
