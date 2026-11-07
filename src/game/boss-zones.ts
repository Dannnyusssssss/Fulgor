/**
 * Zonas de peligro del Coloso (orbes): un círculo en el suelo avisa durante un tiempo fijo y estable;
 * al terminar el aviso cae el golpe (daña si el jugador está dentro). En la fase 3 la zona sigue activa
 * unos segundos con daño continuo. Pool de tamaño fijo.
 */
import type { Poolable } from '../core/pool';

export const ZoneState = {
  Warn: 0,
  Active: 1,
} as const;
export type ZoneStateId = (typeof ZoneState)[keyof typeof ZoneState];

export interface BossZone extends Poolable {
  x: number;
  z: number;
  radius: number;
  state: ZoneStateId;
  /** Tiempo que queda del estado actual y duración total del aviso (para dibujar el progreso). */
  timer: number;
  warnDuration: number;
  /** Daño al caer. */
  impactDamage: number;
  /** Segundos que sigue activa tras caer (0 = ninguno) y su daño por segundo. */
  lingerSeconds: number;
  lingerDps: number;
}

export function createZoneSlot(index: number): BossZone {
  return {
    active: false,
    index,
    x: 0,
    z: 0,
    radius: 1,
    state: ZoneState.Warn,
    timer: 0,
    warnDuration: 1,
    impactDamage: 0,
    lingerSeconds: 0,
    lingerDps: 0,
  };
}

/** ¿El círculo (x, z, r) toca la zona? */
export function insideZone(zone: BossZone, x: number, z: number, r: number): boolean {
  const dx = x - zone.x;
  const dz = z - zone.z;
  const reach = zone.radius + r;
  return dx * dx + dz * dz <= reach * reach;
}
