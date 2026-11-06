/**
 * Objetos recogibles: vida, escudo y enfriador instantáneo. Duran un tiempo limitado.
 */
import type { Poolable } from '../core/pool';

export const PickupType = {
  Health: 1,
  Shield: 2,
  Coolant: 3,
} as const;
export type PickupTypeId = (typeof PickupType)[keyof typeof PickupType];

export interface Pickup extends Poolable {
  type: PickupTypeId;
  x: number;
  z: number;
  /** Segundos que le quedan. */
  life: number;
}

export function createPickupSlot(index: number): Pickup {
  return { active: false, index, type: PickupType.Health, x: 0, z: 0, life: 0 };
}

/** Elige el tipo de objeto a partir de un número en [0, 1) y los pesos de los datos. */
export function pickupTypeFromRoll(
  roll: number,
  weights: { health: number; shield: number; coolant: number },
): PickupTypeId {
  const total = weights.health + weights.shield + weights.coolant;
  if (total <= 0) return PickupType.Health;
  const r = roll * total;
  if (r < weights.health) return PickupType.Health;
  if (r < weights.health + weights.shield) return PickupType.Shield;
  return PickupType.Coolant;
}
