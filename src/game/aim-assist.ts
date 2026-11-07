/**
 * Apuntado asistido (opcional): si hay un enemigo a tiro dentro de un cono pequeño alrededor de la puntería,
 * acerca el giro hacia él con una velocidad máxima baja. Nunca salta de golpe, nunca da la vuelta y nunca
 * apunta a quien está detrás de una cobertura. La puntería final sigue siendo del jugador.
 */
import { wrapAngle, yawFromDir } from '../core/math';
import { hasLineOfSight } from './collision';
import { isDamageable } from './enemies/types';
import { activeWeaponDef, type World } from './world';

/**
 * Corrección de yaw para este frame (radianes, con signo), o 0 si no hay a quién ayudar a apuntar.
 * `cone`: mitad del ángulo del cono; `maxRate`: radianes por segundo como máximo.
 */
export function aimAssistDelta(
  world: World,
  yaw: number,
  cone: number,
  maxRate: number,
  dt: number,
): number {
  const p = world.player;
  if (!p.alive || cone <= 0 || maxRate <= 0 || dt <= 0) return 0;
  const range = activeWeaponDef(world).range;
  let best = Infinity;
  let bestDiff = 0;
  for (const e of world.enemies.items) {
    if (!isDamageable(e)) continue;
    const dx = e.pos.x - p.pos.x;
    const dz = e.pos.z - p.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > range + e.radius || dist < 1e-6) continue;
    const diff = wrapAngle(yawFromDir(dx, dz) - yaw);
    // El cono se ensancha un poco con el tamaño aparente del enemigo.
    const limit = cone + Math.atan2(e.radius, dist);
    if (Math.abs(diff) > limit || Math.abs(diff) >= best) continue;
    if (!hasLineOfSight(world.arena, p.pos.x, p.pos.z, e.pos.x, e.pos.z, 0.05)) continue;
    best = Math.abs(diff);
    bestDiff = diff;
  }
  if (best === Infinity) return 0;
  const step = maxRate * dt;
  return Math.abs(bestDiff) <= step ? bestDiff : Math.sign(bestDiff) * step;
}
