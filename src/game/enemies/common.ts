/**
 * Piezas comunes de la IA de enemigos: contexto, banderas de resultado, persecución y giro limitado.
 */
import { damp, normalizeInto, wrapAngle, type Vec2 } from '../../core/math';
import type { Rng } from '../../core/rng';
import { BALANCE } from '../../data/balance';
import type { Arena } from '../arena';
import { hasLineOfSight, moveCircle } from '../collision';
import type { NavField } from '../nav';
import type { PlayerState } from '../player';
import type { Tuning } from '../tuning';
import type { Enemy } from './types';

/** Lo que la IA necesita del mundo (así se puede probar sin crear un mundo completo). */
export interface EnemyContext {
  arena: Arena;
  /** Mapas de distancias para cuerpos pequeños y para cuerpos grandes. */
  navSmall: NavField;
  navLarge: NavField;
  player: PlayerState;
  combat: Rng;
  tuning: Tuning;
  /** Todos los enemigos (para el Reparador). */
  enemies: readonly Enemy[];
}

/** Resultado de un paso de IA, como banderas de bits (quien llama aplica los efectos). */
export const EnemyFlag = {
  TelegraphStarted: 1,
  /** Una embestida tocó al jugador. */
  HitPlayer: 2,
  /** Disparar un proyectil en `dir`. */
  Fire: 4,
  /** Onda frontal en `dir`. */
  Shockwave: 8,
  /** Rayo instantáneo en `dir`. */
  Beam: 16,
} as const;

/** Hasta esta distancia, con línea de visión, se persigue directo en vez de seguir el mapa de distancias. */
const DIRECT_CHASE_RANGE = 10;

/** Duración de un aviso: nunca menor que el mínimo global. */
export function telegraphDuration(seconds: number): number {
  return Math.max(BALANCE.telegraph.minSeconds, seconds);
}

export function navFor(ctx: EnemyContext, radius: number): NavField {
  return radius > BALANCE.nav.smallRadius ? ctx.navLarge : ctx.navSmall;
}

export function seesPlayer(e: Enemy, ctx: EnemyContext): boolean {
  const p = ctx.player;
  return p.alive && hasLineOfSight(ctx.arena, e.pos.x, e.pos.z, p.pos.x, p.pos.z, e.radius * 0.5);
}

/** Dirección para acercarse al jugador: directa si lo ve de cerca, si no por el mapa de distancias. */
export function chaseDirection(
  e: Enemy,
  ctx: EnemyContext,
  los: boolean,
  d2: number,
  out: Vec2,
): boolean {
  const p = ctx.player;
  if (!p.alive) return false;
  if (los && d2 <= DIRECT_CHASE_RANGE * DIRECT_CHASE_RANGE) {
    normalizeInto(out, p.pos.x - e.pos.x, p.pos.z - e.pos.z);
    return out.x !== 0 || out.z !== 0;
  }
  return navFor(ctx, e.radius).direction(e.pos.x, e.pos.z, out);
}

/** Acerca la velocidad a la deseada y mueve con colisión. Devuelve true si tocó un obstáculo. */
export function steer(
  e: Enemy,
  ctx: EnemyContext,
  vx: number,
  vz: number,
  sharpness: number,
  dt: number,
): boolean {
  e.vel.x = damp(e.vel.x, vx, sharpness, dt);
  e.vel.z = damp(e.vel.z, vz, sharpness, dt);
  return moveCircle(ctx.arena, e.pos, e.radius, e.vel.x * dt, e.vel.z * dt);
}

/** Gira `current` hacia `target` como mucho `maxStep` radianes. */
export function turnTowards(current: number, target: number, maxStep: number): number {
  const diff = wrapAngle(target - current);
  if (Math.abs(diff) <= maxStep) return wrapAngle(target);
  return wrapAngle(current + Math.sign(diff) * maxStep);
}

/** Pone en `out` la dirección unitaria del enemigo al jugador. */
export function dirToPlayer(e: Enemy, ctx: EnemyContext, out: Vec2): Vec2 {
  normalizeInto(out, ctx.player.pos.x - e.pos.x, ctx.player.pos.z - e.pos.z);
  if (out.x === 0 && out.z === 0) out.z = -1;
  return out;
}

/** Avanza los temporizadores comunes al principio de cada paso. */
export function beginStep(e: Enemy, dt: number): void {
  e.prev.x = e.pos.x;
  e.prev.z = e.pos.z;
  e.sinceHurt += dt;
  e.sinceBlocked += dt;
  e.stateTimer -= dt;
  e.attackCooldown = Math.max(0, e.attackCooldown - dt);
}
