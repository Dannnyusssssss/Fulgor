/**
 * Reparador: no ataca. Busca al aliado más dañado a su alcance (con línea de visión) y lo cura con un haz estable.
 * Se queda detrás de sus aliados, lejos del jugador: es un objetivo prioritario.
 */
import { distSq, normalizeInto, vec2, yawFromDir } from '../../core/math';
import { hasLineOfSight } from '../collision';
import { beginStep, chaseDirection, seesPlayer, steer, type EnemyContext } from './common';
import { EnemyState, isDamageable, setState, type Enemy } from './types';

const away = vec2();
const steerDir = vec2();

/** Elige el aliado a curar: el de menor fracción de vida dentro del alcance (empate: índice más bajo). */
export function pickHealTarget(e: Enemy, ctx: EnemyContext): number {
  const def = ctx.tuning.reparador;
  const r2 = def.healRange * def.healRange;
  let best = -1;
  let bestFrac = 1;
  for (const o of ctx.enemies) {
    if (o === e || !isDamageable(o) || o.health >= o.maxHealth) continue;
    if (distSq(e.pos.x, e.pos.z, o.pos.x, o.pos.z) > r2) continue;
    if (!hasLineOfSight(ctx.arena, e.pos.x, e.pos.z, o.pos.x, o.pos.z, 0.1)) continue;
    const frac = o.health / o.maxHealth;
    if (frac < bestFrac) {
      bestFrac = frac;
      best = o.index;
    }
  }
  return best;
}

export function updateReparador(e: Enemy, ctx: EnemyContext, dt: number): number {
  const def = ctx.tuning.reparador;
  // Objetivo actual: el jugador o, si está activo, el señuelo.
  const p = ctx.target;
  beginStep(e, dt);

  if (e.state === EnemyState.Materializing) {
    if (e.stateTimer <= 0) setState(e, EnemyState.Chase, 0);
    e.targetIndex = -1;
    return 0;
  }
  if (e.state !== EnemyState.Chase) setState(e, EnemyState.Chase, 0);

  // Curación al aliado elegido (nunca por encima de su vida máxima).
  e.targetIndex = pickHealTarget(e, ctx);
  const target = e.targetIndex >= 0 ? ctx.enemies[e.targetIndex] : undefined;
  if (target !== undefined) {
    target.health = Math.min(target.maxHealth, target.health + def.healRate * dt);
  }

  // Movimiento: lejos del jugador y, si cura, cerca del aliado pero del lado opuesto al jugador.
  const d2 = distSq(e.pos.x, e.pos.z, p.pos.x, p.pos.z);
  normalizeInto(away, e.pos.x - p.pos.x, e.pos.z - p.pos.z);
  let vx = 0;
  let vz = 0;
  if (target !== undefined) {
    const gx = target.pos.x + away.x * def.allyDistance;
    const gz = target.pos.z + away.z * def.allyDistance;
    const dx = gx - e.pos.x;
    const dz = gz - e.pos.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len > 0.5) {
      vx = (dx / len) * def.speed;
      vz = (dz / len) * def.speed;
    }
  } else if (p.alive && d2 < def.keepAway * def.keepAway) {
    vx = away.x * def.speed;
    vz = away.z * def.speed;
  } else if (p.alive && d2 > (def.keepAway + 5) * (def.keepAway + 5)) {
    // Muy lejos: se acerca un poco para no quedarse fuera de la pelea.
    if (chaseDirection(e, ctx, seesPlayer(e, ctx), d2, steerDir)) {
      vx = steerDir.x * def.speed * 0.6;
      vz = steerDir.z * def.speed * 0.6;
    }
  }
  steer(e, ctx, vx, vz, 6, dt);
  if (vx !== 0 || vz !== 0) e.yaw = yawFromDir(vx, vz);
  return 0;
}
