/**
 * Utilidades compartidas por los tests: contexto de IA y colocación de enemigos.
 */
import { Rng } from '../src/core/rng';
import type { ArenaDef } from '../src/data/arenas';
import { BALANCE } from '../src/data/balance';
import { createArena, type Arena } from '../src/game/arena';
import type { EnemyContext } from '../src/game/enemies/common';
import {
  createEnemySlot,
  EnemyState,
  kindDef,
  type Enemy,
  type EnemyKindId,
  type EnemyStateId,
} from '../src/game/enemies/types';
import { NavField } from '../src/game/nav';
import { createPlayer } from '../src/game/player';
import { createTuning } from '../src/game/tuning';
import type { World } from '../src/game/world';

const arenaCache = new Map<string, Arena>();

export function arenaFor(def: ArenaDef): Arena {
  let a = arenaCache.get(def.id);
  if (!a) {
    a = createArena(def);
    arenaCache.set(def.id, a);
  }
  return a;
}

/** Contexto de IA sin mundo completo, con el jugador en (px, pz). */
export function makeContext(
  def: ArenaDef,
  px: number,
  pz: number,
  enemies: Enemy[] = [],
): EnemyContext {
  const tuning = createTuning();
  const arena = arenaFor(def);
  const navSmall = new NavField(arena, BALANCE.nav.cellSize, BALANCE.nav.smallRadius);
  const navLarge = new NavField(arena, BALANCE.nav.cellSize, BALANCE.nav.largeRadius);
  navSmall.recompute(px, pz);
  navLarge.recompute(px, pz);
  return {
    arena,
    navSmall,
    navLarge,
    player: createPlayer(px, pz, 0, tuning.player),
    combat: new Rng(1),
    tuning,
    enemies,
  };
}

/** Crea un enemigo suelto (fuera de cualquier pool) ya activo. */
export function makeEnemy(
  ctx: EnemyContext,
  kind: EnemyKindId,
  x: number,
  z: number,
  index = 0,
  state: EnemyStateId = EnemyState.Chase,
): Enemy {
  const e = createEnemySlot(index);
  const def = kindDef(ctx.tuning, kind);
  e.active = true;
  e.kind = kind;
  e.pos.x = x;
  e.pos.z = z;
  e.prev.x = x;
  e.prev.z = z;
  e.radius = def.radius;
  e.health = def.health;
  e.maxHealth = def.health;
  e.state = state;
  return e;
}

/** Coloca un enemigo en el pool del mundo, fuera del portal. */
export function placeEnemy(
  world: World,
  kind: EnemyKindId,
  x: number,
  z: number,
  state: EnemyStateId = EnemyState.Recover,
  timer = 100,
): Enemy {
  const e = world.enemies.acquire();
  if (!e) throw new Error('pool lleno');
  const def = kindDef(world.tuning, kind);
  e.kind = kind;
  e.pos.x = x;
  e.pos.z = z;
  e.prev.x = x;
  e.prev.z = z;
  e.radius = def.radius;
  e.health = def.health;
  e.maxHealth = def.health;
  e.state = state;
  e.stateTimer = timer;
  e.stateDuration = timer;
  e.attackCooldown = 0;
  e.targetIndex = -1;
  return e;
}
