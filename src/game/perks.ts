/**
 * Mejoras de la partida: niveles por mejora, ofertas de 3 opciones sin repetir (flujo de mejoras del RNG)
 * y cálculo de los modificadores con topes.
 */
import type { Rng } from '../core/rng';
import type { AbilityId } from '../data/abilities';
import { PERK_CAPS, PERK_OFFER_SIZE, PERKS, type PerkDef, type PerkStat } from '../data/perks';
import { WEAPON_ORDER } from '../data/weapons';
import { resetModifiers, type Modifiers } from './modifiers';

export interface PerkState {
  /** Nivel de cada mejora, en el orden de PERKS. */
  readonly levels: Uint8Array;
  /** Oferta actual: índices en PERKS. */
  readonly offer: Int16Array;
  offerCount: number;
  /** Mejoras elegidas en la partida (para los resultados). */
  picks: number;
}

export function createPerkState(): PerkState {
  return {
    levels: new Uint8Array(PERKS.length),
    offer: new Int16Array(PERK_OFFER_SIZE).fill(-1),
    offerCount: 0,
    picks: 0,
  };
}

/** Lo que decide si una mejora tiene sentido en esta partida. */
export interface PerkContext {
  unlockedWeapons: readonly boolean[];
  ability: AbilityId;
}

function hasPerk(state: PerkState, id: string): boolean {
  const i = PERKS.findIndex((p) => p.id === id);
  return i >= 0 && (state.levels[i] ?? 0) > 0;
}

/** ¿Se puede ofrecer la mejora `i`? No si está al máximo, si es incompatible con una que ya se tiene o si no aplica. */
export function isEligible(state: PerkState, i: number, ctx: PerkContext): boolean {
  const def = PERKS[i];
  if (def === undefined) return false;
  if ((state.levels[i] ?? 0) >= def.maxLevel) return false;
  if (def.excludes?.some((id) => hasPerk(state, id))) return false;
  // La incompatibilidad vale en los dos sentidos.
  for (let j = 0; j < PERKS.length; j++) {
    if ((state.levels[j] ?? 0) > 0 && PERKS[j]?.excludes?.includes(def.id)) return false;
  }
  if (def.requiresWeapon !== undefined) {
    const slot = WEAPON_ORDER.indexOf(def.requiresWeapon);
    if (ctx.unlockedWeapons[slot] !== true) return false;
  }
  if (def.requiresAbility !== undefined && def.requiresAbility !== ctx.ability) return false;
  return true;
}

/** Índices reutilizables para elegir la oferta sin crear arreglos. */
const candidates = new Int16Array(PERKS.length);

/**
 * Prepara una oferta de hasta 3 mejoras distintas, elegidas al azar entre las que se pueden ofrecer.
 * Solo usa el flujo de mejoras del RNG. Devuelve cuántas opciones hay (0 si ya no queda ninguna).
 */
export function makeOffer(state: PerkState, rng: Rng, ctx: PerkContext): number {
  let n = 0;
  for (let i = 0; i < PERKS.length; i++) if (isEligible(state, i, ctx)) candidates[n++] = i;
  const count = Math.min(PERK_OFFER_SIZE, n);
  // Fisher-Yates parcial: las primeras `count` posiciones quedan barajadas y sin repetir.
  for (let k = 0; k < count; k++) {
    const j = k + Math.floor(rng.next() * (n - k));
    const tmp = candidates[k] ?? 0;
    candidates[k] = candidates[j] ?? 0;
    candidates[j] = tmp;
    state.offer[k] = candidates[k] ?? -1;
  }
  for (let k = count; k < PERK_OFFER_SIZE; k++) state.offer[k] = -1;
  state.offerCount = count;
  return count;
}

/** Definición de la opción `choice` (0, 1 o 2) de la oferta actual. */
export function offeredPerk(state: PerkState, choice: number): PerkDef | undefined {
  if (choice < 0 || choice >= state.offerCount) return undefined;
  return PERKS[state.offer[choice] ?? -1];
}

/** Sube un nivel la opción elegida y vacía la oferta. Devuelve el índice en PERKS, o -1 si no era válida. */
export function choosePerk(state: PerkState, choice: number): number {
  if (choice < 0 || choice >= state.offerCount) return -1;
  const i = state.offer[choice] ?? -1;
  const def = PERKS[i];
  if (def === undefined) return -1;
  state.levels[i] = Math.min(def.maxLevel, (state.levels[i] ?? 0) + 1);
  state.offerCount = 0;
  state.offer.fill(-1);
  state.picks++;
  return i;
}

/** Recalcula los modificadores desde los niveles y aplica los topes. */
export function computeModifiers(state: PerkState, out: Modifiers): Modifiers {
  resetModifiers(out);
  PERKS.forEach((def, i) => {
    const level = state.levels[i] ?? 0;
    if (level === 0) return;
    for (const fx of def.effects) out[fx.stat] += fx.perLevel * level;
  });
  for (const stat of Object.keys(PERK_CAPS) as PerkStat[]) {
    const cap = PERK_CAPS[stat];
    out[stat] = Math.min(cap.max, Math.max(cap.min, out[stat]));
  }
  return out;
}
