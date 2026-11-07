/**
 * Estado común de los enemigos (todos viven en un mismo pool de tamaño fijo).
 */
import { vec2, type Vec2 } from '../../core/math';
import type { Poolable } from '../../core/pool';
import type { EnemyBaseDef, EnemyKindName } from '../../data/enemies';
import type { Tuning } from '../tuning';

export const EnemyKind = {
  Zumbador: 1,
  Centinela: 2,
  Blindado: 3,
  Reparador: 4,
  Vigia: 5,
  /** Jefe. */
  Coloso: 6,
} as const;
export type EnemyKindId = (typeof EnemyKind)[keyof typeof EnemyKind];

export const ENEMY_KIND_IDS: readonly EnemyKindId[] = [1, 2, 3, 4, 5, 6];

/** Tipos normales (sin el jefe). */
export const REGULAR_KIND_IDS: readonly EnemyKindId[] = [1, 2, 3, 4, 5];

const KIND_NAMES: Readonly<Record<EnemyKindId, EnemyKindName>> = {
  1: 'zumbador',
  2: 'centinela',
  3: 'blindado',
  4: 'reparador',
  5: 'vigia',
  6: 'coloso',
};

export function kindName(kind: EnemyKindId): EnemyKindName {
  return KIND_NAMES[kind];
}

export function kindFromName(name: EnemyKindName): EnemyKindId {
  for (const id of ENEMY_KIND_IDS) if (KIND_NAMES[id] === name) return id;
  return EnemyKind.Zumbador;
}

/** Datos (editables) de un tipo de enemigo. */
export function kindDef(tuning: Tuning, kind: EnemyKindId): EnemyBaseDef {
  return tuning[KIND_NAMES[kind]];
}

export const EnemyState = {
  /** En el portal de entrada: no se mueve, no ataca y no recibe daño. */
  Materializing: 0,
  /** Moviéndose (persiguiendo, manteniendo distancia o huyendo según el tipo). */
  Chase: 1,
  /** Aviso del ataque con la dirección ya fijada. */
  Windup: 2,
  Dash: 3,
  Recover: 4,
  /** Vigía: la línea láser sigue al jugador (también es aviso visible). */
  Track: 5,
  /** Coloso: pausa estable al cambiar de fase (no recibe daño ni ataca). */
  Shift: 6,
} as const;
export type EnemyStateId = (typeof EnemyState)[keyof typeof EnemyState];

export interface Enemy extends Poolable {
  kind: EnemyKindId;
  pos: Vec2;
  prev: Vec2;
  vel: Vec2;
  /** Hacia dónde mira (el escudo del Blindado cubre este frente). */
  yaw: number;
  radius: number;
  health: number;
  maxHealth: number;
  state: EnemyStateId;
  stateTimer: number;
  /** Duración total del estado actual (para mostrar el progreso del aviso). */
  stateDuration: number;
  /** Dirección del ataque (se fija al empezar el aviso y no cambia después). */
  dir: Vec2;
  /** Ya dañó al jugador en esta embestida. */
  dashHit: boolean;
  /** Espera antes de poder volver a atacar. */
  attackCooldown: number;
  /** Tiempo desde el último impacto recibido (para el efecto visual). */
  sinceHurt: number;
  /** Sentido del movimiento lateral (+1 o -1). */
  strafe: number;
  strafeTimer: number;
  /** Reparador: índice del aliado que está curando, o -1. */
  targetIndex: number;
  /** Último impacto bloqueado por el escudo (para el efecto visual). */
  sinceBlocked: number;
  /** Empuje de la Onda: velocidad y tiempo que le queda (se aplica con colisión, sin atravesar paredes). */
  pushX: number;
  pushZ: number;
  pushTimer: number;
  /** Coloso: fase (1, 2 o 3), ataque en curso, ángulos del barrido y espera de la llamada de apoyo. */
  phase: number;
  attack: number;
  sweepFrom: number;
  sweepTo: number;
  sweepAngle: number;
  sweepPrev: number;
  summonCooldown: number;
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
    attackCooldown: 0,
    sinceHurt: 999,
    strafe: 1,
    strafeTimer: 0,
    targetIndex: -1,
    sinceBlocked: 999,
    pushX: 0,
    pushZ: 0,
    pushTimer: 0,
    phase: 1,
    attack: 0,
    sweepFrom: 0,
    sweepTo: 0,
    sweepAngle: 0,
    sweepPrev: 0,
    summonCooldown: 0,
  };
}

/** ¿Puede recibir daño? */
export function isDamageable(e: Enemy): boolean {
  return (
    e.active && e.state !== EnemyState.Materializing && e.state !== EnemyState.Shift && e.health > 0
  );
}

export function setState(e: Enemy, state: EnemyStateId, duration: number): void {
  e.state = state;
  e.stateTimer = duration;
  e.stateDuration = duration;
}
