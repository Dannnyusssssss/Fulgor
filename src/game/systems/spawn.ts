/**
 * Creación de enemigos en su portal de entrada (estado de materialización).
 */
import { BALANCE } from '../../data/balance';
import { GameEvent } from '../events';
import { EnemyState, kindDef, setState, type EnemyKindId } from '../enemies/types';
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
  e.health = def.health;
  e.maxHealth = def.health;
  e.dashHit = false;
  e.attackCooldown = 0;
  e.sinceHurt = 999;
  e.sinceBlocked = 999;
  e.strafe = 1;
  e.strafeTimer = 0;
  e.targetIndex = -1;
  setState(e, EnemyState.Materializing, BALANCE.director.materializeSeconds);
  world.events.emit(GameEvent.EnemySpawn, x, z, e.index, kind);
  return true;
}
