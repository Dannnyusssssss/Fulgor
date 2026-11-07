/**
 * Director de oleadas: compone cada oleada gastando su presupuesto de puntos y la reparte en apariciones.
 * La composición solo usa el flujo de oleadas del RNG, así que no depende de lo que haga el jugador.
 */
import type { Rng } from '../core/rng';
import type { EnemyKindName } from '../data/enemies';
import type { KindCounts, WaveDef } from '../data/waves';
import { ENEMY_KIND_IDS, EnemyKind, kindDef, kindName, type EnemyKindId } from './enemies/types';
import type { Tuning } from './tuning';

export const DirectorPhase = {
  Rest: 0,
  Spawning: 1,
  Fighting: 2,
  /** Todas las oleadas superadas. */
  Victory: 3,
  /** Entre oleadas: la simulación espera a que se elija una mejora. */
  PerkChoice: 4,
} as const;
export type DirectorPhaseId = (typeof DirectorPhase)[keyof typeof DirectorPhase];

/** Tope de enemigos que puede tener una oleada (tamaño de la cola, fijo). */
export const MAX_WAVE_SIZE = 64;

export interface DirectorState {
  wave: number;
  phase: DirectorPhaseId;
  timer: number;
  /** Cola de apariciones de la oleada actual (tipos de enemigo). */
  readonly queue: Uint8Array;
  queueLength: number;
  queueIndex: number;
  /** Desactivado (modo de prueba de rendimiento). */
  disabled: boolean;
}

export function createDirector(firstRest: number, startWave = 1): DirectorState {
  return {
    wave: Math.max(0, startWave - 1),
    phase: DirectorPhase.Rest,
    timer: firstRest,
    queue: new Uint8Array(MAX_WAVE_SIZE),
    queueLength: 0,
    queueIndex: 0,
    disabled: false,
  };
}

function count(counts: KindCounts | undefined, name: EnemyKindName): number {
  return counts?.[name] ?? 0;
}

/**
 * Compone una oleada: primero los obligatorios, después gasta el resto del presupuesto eligiendo tipos por peso
 * (solo los que caben y no superan su máximo) y al final baraja el orden. Escribe los tipos en `out` y devuelve
 * cuántos son. Siempre hace las mismas tiradas para la misma oleada, semilla y dificultad.
 */
export function composeWave(
  def: WaveDef,
  budgetMultiplier: number,
  tuning: Tuning,
  rng: Rng,
  out: Uint8Array,
): number {
  let budget = Math.round(def.budget * budgetMultiplier);
  const per = new Map<EnemyKindId, number>();
  let n = 0;
  const push = (kind: EnemyKindId): void => {
    if (n >= out.length) return;
    out[n++] = kind;
    per.set(kind, (per.get(kind) ?? 0) + 1);
    budget -= kindDef(tuning, kind).cost;
  };

  // 1) Obligatorios (aunque superen el presupuesto: dan carácter a la oleada).
  for (const id of ENEMY_KIND_IDS) {
    const req = count(def.required, kindName(id));
    for (let i = 0; i < req; i++) push(id);
  }

  // 2) Resto del presupuesto por pesos.
  for (let guard = 0; guard < MAX_WAVE_SIZE && n < out.length; guard++) {
    let total = 0;
    for (const id of ENEMY_KIND_IDS) {
      const name = kindName(id);
      const w = count(def.weights, name);
      const maxN = def.max?.[name];
      if (w <= 0 || kindDef(tuning, id).cost > budget) continue;
      if (maxN !== undefined && (per.get(id) ?? 0) >= maxN) continue;
      total += w;
    }
    if (total <= 0) break;
    let r = rng.next() * total;
    let chosen: EnemyKindId | null = null;
    for (const id of ENEMY_KIND_IDS) {
      const name = kindName(id);
      const w = count(def.weights, name);
      const maxN = def.max?.[name];
      if (w <= 0 || kindDef(tuning, id).cost > budget) continue;
      if (maxN !== undefined && (per.get(id) ?? 0) >= maxN) continue;
      chosen = id;
      if (r < w) break;
      r -= w;
    }
    if (chosen === null) break;
    push(chosen);
  }

  // 3) Barajar (Fisher-Yates) para mezclar el orden de aparición.
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const tmp = out[i] ?? 0;
    out[i] = out[j] ?? 0;
    out[j] = tmp;
  }
  // 4) En la oleada del jefe, el Coloso aparece el primero.
  if (def.boss === true) {
    let k = -1;
    for (let i = 0; i < n && k < 0; i++) if (out[i] === EnemyKind.Coloso) k = i;
    if (k > 0) {
      out[k] = out[0] ?? 0;
      out[0] = EnemyKind.Coloso;
    }
  }
  return n;
}

/** Coste total de una composición (para los tests). */
export function compositionCost(kinds: ArrayLike<number>, length: number, tuning: Tuning): number {
  let c = 0;
  for (let i = 0; i < length; i++) c += kindDef(tuning, (kinds[i] ?? 1) as EnemyKindId).cost;
  return c;
}
