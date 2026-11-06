/**
 * Prueba de rendimiento (solo con ?stress): 60 enemigos de todos los tipos y unos 200 proyectiles enemigos vivos.
 * El director se desactiva y el jugador es invulnerable.
 */
import { isCircleFree } from '../collision';
import { ENEMY_KIND_IDS, EnemyState, setState } from '../enemies/types';
import { Team } from '../projectiles';
import type { World } from '../world';
import { spawnEnemy } from './spawn';

export const STRESS_ENEMIES = 60;
export const STRESS_PROJECTILES = 200;

export function setupStress(world: World): void {
  world.director.disabled = true;
  const inner = world.arena.inner;
  const rng = world.rng.combat;
  let placed = 0;
  for (let attempt = 0; attempt < 2000 && placed < STRESS_ENEMIES; attempt++) {
    const x = inner.minX + 1 + rng.next() * (inner.maxX - inner.minX - 2);
    const z = inner.minZ + 1 + rng.next() * (inner.maxZ - inner.minZ - 2);
    if (!isCircleFree(world.arena, x, z, 1)) continue;
    const kind = ENEMY_KIND_IDS[placed % ENEMY_KIND_IDS.length] ?? 1;
    if (spawnEnemy(world, kind, x, z, 0)) placed++;
  }
  // Sin espera de portal: la prueba empieza de inmediato.
  for (const e of world.enemies.items) if (e.active) setState(e, EnemyState.Chase, 0);
}

/** Mantiene unos 200 proyectiles enemigos lentos en vuelo desde enemigos al azar. */
export function updateStressSystem(world: World): void {
  const rng = world.rng.combat;
  const enemies = world.enemies.items;
  let guard = 0;
  while (world.projectiles.activeCount < STRESS_PROJECTILES && guard++ < 40) {
    const e = enemies[Math.floor(rng.next() * enemies.length)];
    const a = rng.next() * Math.PI * 2;
    if (e === undefined || !e.active) continue;
    const p = world.projectiles.acquire();
    if (p === null) break;
    p.team = Team.Enemy;
    p.x = e.pos.x;
    p.z = e.pos.z;
    p.prevX = p.x;
    p.prevZ = p.z;
    p.vx = Math.cos(a) * 6;
    p.vz = Math.sin(a) * 6;
    p.radius = 0.2;
    p.damage = 0;
    p.remaining = 30;
  }
}
