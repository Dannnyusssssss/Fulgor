/**
 * Sistema de proyectiles: movimiento con colisión continua contra la arena, los enemigos y el jugador.
 * El escudo frontal del Blindado detiene los disparos que le llegan por delante.
 */
import { segmentCircleT } from '../../core/math';
import { sweepObstacles } from '../collision';
import { inFrontArc } from '../enemies/blindado';
import { EnemyKind, isDamageable, type Enemy } from '../enemies/types';
import { GameEvent } from '../events';
import { projectileDamage, Team } from '../projectiles';
import type { World } from '../world';
import { damageEnemy, hurtPlayer } from './damage';

/** Radio máximo de un enemigo, para la fase amplia de la consulta al hash. */
export const MAX_ENEMY_RADIUS = 2;

export function updateProjectileSystem(world: World, dt: number): void {
  const items = world.enemies.items;
  const out = world.scratch;
  for (const p of world.projectiles.items) {
    if (!p.active) continue;
    p.prevX = p.x;
    p.prevZ = p.z;
    // Segmento de este paso, recortado al alcance que le queda.
    const speed = Math.sqrt(p.vx * p.vx + p.vz * p.vz);
    const travel = Math.min(speed * dt, p.remaining);
    const scale = speed > 0 ? travel / speed : 0;
    const ax = p.x;
    const az = p.z;
    const bx = ax + p.vx * scale;
    const bz = az + p.vz * scale;

    let bestT = sweepObstacles(world.arena, ax, az, bx, bz, p.radius);
    let hitEnemy: Enemy | null = null;
    let hitPlayer = false;

    if (p.team === Team.Player) {
      const n = world.enemyHash.query(
        (ax + bx) / 2,
        (az + bz) / 2,
        travel / 2 + p.radius + MAX_ENEMY_RADIUS,
        out,
      );
      for (let i = 0; i < n; i++) {
        const e = items[out[i] ?? 0];
        if (e === undefined || !isDamageable(e)) continue;
        const t = segmentCircleT(ax, az, bx, bz, e.pos.x, e.pos.z, e.radius + p.radius);
        // Ante empate gana el primero encontrado (orden estable del hash).
        if (t >= 0 && (bestT < 0 || t < bestT)) {
          bestT = t;
          hitEnemy = e;
        }
      }
    } else if (world.player.alive) {
      const pl = world.player;
      const t = segmentCircleT(ax, az, bx, bz, pl.pos.x, pl.pos.z, pl.radius + p.radius);
      if (t >= 0 && (bestT < 0 || t < bestT)) {
        bestT = t;
        hitPlayer = true;
      }
    }

    if (bestT < 0) {
      p.x = bx;
      p.z = bz;
      p.remaining -= travel;
      if (p.remaining <= 1e-6) world.projectiles.release(p);
      continue;
    }

    // Impacto: el proyectil se queda en el punto de contacto y se apaga.
    p.x = ax + (bx - ax) * bestT;
    p.z = az + (bz - az) * bestT;
    if (hitEnemy !== null) {
      if (isShieldBlock(world, hitEnemy, p.x, p.z)) {
        hitEnemy.sinceBlocked = 0;
        world.events.emit(GameEvent.ProjectileBlocked, p.x, p.z, hitEnemy.index);
      } else {
        damageEnemy(world, hitEnemy, projectileDamage(p));
        world.events.emit(GameEvent.ProjectileHitEnemy, p.x, p.z, hitEnemy.index);
      }
    } else if (hitPlayer) {
      if (p.damage > 0) hurtPlayer(world, p.damage, -1);
    } else {
      world.events.emit(GameEvent.ProjectileHitWall, p.x, p.z, p.team);
    }
    world.projectiles.release(p);
  }
}

/** ¿El impacto en (x, z) llega por el frente protegido de un Blindado? */
export function isShieldBlock(world: World, e: Enemy, x: number, z: number): boolean {
  if (e.kind !== EnemyKind.Blindado) return false;
  return inFrontArc(e, x, z, world.tuning.blindado.shieldHalfAngle);
}
