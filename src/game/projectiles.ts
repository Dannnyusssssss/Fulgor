/**
 * Proyectiles con colisión continua: en cada paso se lanza el segmento recorrido contra paredes,
 * coberturas y enemigos, y gana el primer contacto. Así no se atraviesa nada aunque vayan muy rápido.
 */
import type { Poolable } from '../core/pool';

export const Team = {
  Player: 0,
  Enemy: 1,
} as const;
export type TeamId = (typeof Team)[keyof typeof Team];

export interface Projectile extends Poolable {
  team: TeamId;
  x: number;
  z: number;
  prevX: number;
  prevZ: number;
  vx: number;
  vz: number;
  radius: number;
  damage: number;
  /** Metros que le quedan antes de apagarse. */
  remaining: number;
}

export function createProjectileSlot(index: number): Projectile {
  return {
    active: false,
    index,
    team: Team.Player,
    x: 0,
    z: 0,
    prevX: 0,
    prevZ: 0,
    vx: 0,
    vz: 0,
    radius: 0.1,
    damage: 0,
    remaining: 0,
  };
}
