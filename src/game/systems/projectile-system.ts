/**
 * Sistema de proyectiles: movimiento con colisión continua contra la arena y los enemigos,
 * daño y desactivación de enemigos (con su puntuación).
 */
import { segmentCircleT } from '../../core/math';
import { sweepObstacles } from '../collision';
import { GameEvent } from '../events';
import { isDamageable, type Enemy } from '../enemies/types';
import { damagePlayer } from '../player';
import { Team } from '../projectiles';
import type { World } from '../world';

/** Radio máximo de un enemigo, para la fase amplia de la consulta al hash. */
const MAX_ENEMY_RADIUS = 1.5;

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
        // Ante empate gana el índice más bajo (orden de recorrido estable).
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
      damageEnemy(world, hitEnemy, p.damage);
      world.events.emit(GameEvent.ProjectileHitEnemy, p.x, p.z, hitEnemy.index);
    } else if (hitPlayer) {
      if (damagePlayer(world.player, p.damage, world.god) > 0) {
        world.events.emit(
          GameEvent.PlayerHit,
          world.player.pos.x,
          world.player.pos.z,
          p.damage,
          -1,
        );
      }
    } else {
      world.events.emit(GameEvent.ProjectileHitWall, p.x, p.z);
    }
    world.projectiles.release(p);
  }
}

export function damageEnemy(world: World, e: Enemy, amount: number): void {
  if (!isDamageable(e)) return;
  e.health -= amount;
  e.sinceHurt = 0;
  if (e.health <= 0) {
    world.score.points += world.tuning.zumbador.score;
    world.score.kills++;
    world.events.emit(GameEvent.EnemyDestroyed, e.pos.x, e.pos.z, e.kind, e.index);
    world.enemies.release(e);
  }
}
