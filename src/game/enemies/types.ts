/**
 * Estado común de los enemigos (todos viven en un mismo pool de tamaño fijo).
 */
import { vec2, type Vec2 } from '../../core/math';
import type { Poolable } from '../../core/pool';

export const EnemyKind = {
  Zumbador: 1,
} as const;
export type EnemyKindId = (typeof EnemyKind)[keyof typeof EnemyKind];

export const EnemyState = {
  /** Apareciendo: no se mueve, no ataca y no recibe daño. */
  Materializing: 0,
  Chase: 1,
  /** Avisando el ataque (línea en el suelo). */
  Windup: 2,
  Dash: 3,
  Recover: 4,
} as const;
export type EnemyStateId = (typeof EnemyState)[keyof typeof EnemyState];

export interface Enemy extends Poolable {
  kind: EnemyKindId;
  pos: Vec2;
  prev: Vec2;
  vel: Vec2;
  yaw: number;
  radius: number;
  health: number;
  maxHealth: number;
  state: EnemyStateId;
  stateTimer: number;
  /** Duración total del estado actual (para mostrar el progreso del aviso). */
  stateDuration: number;
  /** Dirección fijada del ataque (se decide al empezar el aviso y no cambia). */
  dir: Vec2;
  /** Ya dañó al jugador en esta embestida. */
  dashHit: boolean;
  chargeCooldown: number;
  /** Tiempo desde el último impacto recibido (para el efecto visual). */
  sinceHurt: number;
}

export function createEnemySlot(index: number): Enemy {
  return {
    active: false,
    index,
    kind: EnemyKind.Zumbador,
    pos: vec2(),
    prev: vec2(),
    vel: vec2(),
    yaw: 0,
    radius: 0.5,
    health: 1,
    maxHealth: 1,
    state: EnemyState.Materializing,
    stateTimer: 0,
    stateDuration: 0,
    dir: vec2(0, -1),
    dashHit: false,
    chargeCooldown: 0,
    sinceHurt: 999,
  };
}

/** ¿Puede recibir daño? */
export function isDamageable(e: Enemy): boolean {
  return e.active && e.state !== EnemyState.Materializing && e.health > 0;
}
