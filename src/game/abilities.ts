/**
 * Estado de la habilidad elegida para la partida (Onda, Barrera o Señuelo) y del señuelo.
 * La barrera vive en el jugador (absorbe el daño en `damagePlayer`).
 */
import { vec2 } from '../core/math';
import type { AbilityId } from '../data/abilities';
import type { AiTarget } from './enemies/common';

export interface Decoy extends AiTarget {
  /** Segundos que le quedan (0 = inactivo). */
  timer: number;
  duration: number;
}

export interface AbilityState {
  readonly id: AbilityId;
  /** Recarga que queda (0 = lista). */
  cooldown: number;
  /** Recarga total de la última activación (para la barra del HUD). */
  cooldownMax: number;
  readonly decoy: Decoy;
}

export function createAbilityState(id: AbilityId): AbilityState {
  return {
    id,
    cooldown: 0,
    cooldownMax: 1,
    decoy: { pos: vec2(), radius: 0.45, alive: false, timer: 0, duration: 1 },
  };
}
