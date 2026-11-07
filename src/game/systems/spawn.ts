/**
 * Creación de enemigos en su portal de entrada (estado de materialización).
 */
import { BALANCE } from '../../data/balance';
import { GameEvent } from '../events';
import { COLOSO_VARIANTS } from '../../data/enemies';
import { EnemyKind, EnemyState, kindDef, setState, type EnemyKindId } from '../enemies/types';
import { endlessBossHealth } from '../endless';
import type { World } from '../world';

export function spawnEnemy(
  world: World,
  kind: EnemyKindId,
  x: number,
  z: number,
  yaw: number,
): boolean {
  const e = world.enemies.acquire();
  if (e === null) return false;
  const def = kindDef(world.tuning, kind);
  e.kind = kind;
  e.pos.x = x;
  e.pos.z = z;
  e.prev.x = x;
  e.prev.z = z;
  e.vel.x = 0;
  e.vel.z = 0;
  e.yaw = yaw;
  e.radius = def.radius;
  // El Coloso tiene más o menos vida según la arena y la dificultad; en Resistencia, además, sube en cada aparición.
  const variant = COLOSO_VARIANTS[world.arena.def.id];
  const cycle = world.mode === 'endless' ? endlessBossHealth(world.director.wave) : 1;
  const health =
    kind === EnemyKind.Coloso
      ? def.health * (variant?.healthMultiplier ?? 1) * world.diff.bossHealthMultiplier * cycle
      : def.health;
  e.health = health;
  e.maxHealth = health;
  e.dashHit = false;
  e.attackCooldown = 0;
  e.sinceHurt = 999;
  e.sinceBlocked = 999;
  e.strafe = 1;
  e.strafeTimer = 0;
  e.targetIndex = -1;
  e.pushX = 0;
  e.pushZ = 0;
  e.pushTimer = 0;
  e.phase = 1;
  e.attack = 0;
  e.summonCooldown = 0;
  setState(e, EnemyState.Materializing, BALANCE.director.materializeSeconds);
  world.events.emit(GameEvent.EnemySpawn, x, z, e.index, kind);
  return true;
}
