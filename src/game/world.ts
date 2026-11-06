/**
 * Mundo de juego (lógica pura) y orden fijo de los sistemas en cada paso.
 * Misma semilla + mismas órdenes = mismo estado.
 */
import type { PlayerCommand } from '../core/input';
import { Pool } from '../core/pool';
import { createStreams, type RngStreams } from '../core/rng';
import { SpatialHash } from '../core/spatial-hash';
import type { ArenaDef } from '../data/arenas';
import { BALANCE } from '../data/balance';
import { createArena, type Arena } from './arena';
import { EventQueue, GameEvent } from './events';
import { createEnemySlot, type Enemy } from './enemies/types';
import { NavField } from './nav';
import { createPlayer, type PlayerState } from './player';
import { createProjectileSlot, type Projectile } from './projectiles';
import { createSpawner, type SpawnerState } from './spawner';
import { createTuning, type Tuning } from './tuning';
import { createWeaponState, type WeaponState } from './weapon';
import { updatePlayerSystem } from './systems/player-system';
import { updateWeaponSystem } from './systems/weapon-system';
import { updateEnemySystem, rebuildEnemyHash, separateEnemies } from './systems/enemy-system';
import { updateProjectileSystem } from './systems/projectile-system';
import { updateSpawnSystem } from './systems/spawn-system';

export interface ScoreState {
  points: number;
  kills: number;
}

export interface World {
  readonly seed: number;
  readonly dt: number;
  tick: number;
  time: number;
  readonly arena: Arena;
  readonly player: PlayerState;
  readonly weapon: WeaponState;
  readonly projectiles: Pool<Projectile>;
  readonly enemies: Pool<Enemy>;
  readonly enemyHash: SpatialHash;
  readonly nav: NavField;
  readonly spawner: SpawnerState;
  readonly score: ScoreState;
  readonly rng: RngStreams;
  readonly events: EventQueue;
  readonly tuning: Tuning;
  god: boolean;
  /** La partida terminó por derrota. */
  defeated: boolean;
  /** Buffer reutilizable para consultas al hash de enemigos. */
  readonly scratch: number[];
}

export interface WorldOptions {
  seed: number;
  arena: ArenaDef;
  god?: boolean;
  tuning?: Tuning;
}

export function createWorld(opts: WorldOptions): World {
  const tuning = opts.tuning ?? createTuning();
  const arena = createArena(opts.arena);
  const spawn = opts.arena.playerSpawn;
  const b = arena.bounds;
  const enemyCap = BALANCE.pools.enemies;
  return {
    seed: opts.seed >>> 0,
    dt: 1 / BALANCE.sim.stepHz,
    tick: 0,
    time: 0,
    arena,
    player: createPlayer(spawn.x, spawn.z, spawn.yaw, tuning.player),
    weapon: createWeaponState(),
    projectiles: new Pool(BALANCE.pools.projectiles, createProjectileSlot),
    enemies: new Pool(enemyCap, createEnemySlot),
    enemyHash: new SpatialHash(b.minX, b.minZ, b.maxX - b.minX, b.maxZ - b.minZ, 2, enemyCap),
    nav: new NavField(arena, BALANCE.nav.cellSize, tuning.zumbador.radius),
    spawner: createSpawner(),
    score: { points: 0, kills: 0 },
    rng: createStreams(opts.seed),
    events: new EventQueue(BALANCE.pools.events),
    tuning,
    god: opts.god ?? false,
    defeated: false,
    scratch: new Array<number>(enemyCap).fill(0),
  };
}

/**
 * Un paso fijo de simulación. Este es el único lugar donde se declara el orden de los sistemas:
 * 1. jugador → 2. arma → 3. mapa de distancias → 4. IA de enemigos → 5. separación y hash
 * → 6. proyectiles (daño y desactivaciones) → 7. aparición de oleadas → 8. derrota.
 */
export function stepWorld(world: World, cmd: PlayerCommand): void {
  const dt = world.dt;
  world.tick++;
  world.time += dt;

  updatePlayerSystem(world, cmd, dt);
  updateWeaponSystem(world, cmd, dt);
  if (world.tick % BALANCE.nav.recomputeEverySteps === 1) {
    world.nav.recompute(world.player.pos.x, world.player.pos.z);
  }
  updateEnemySystem(world, dt);
  rebuildEnemyHash(world);
  separateEnemies(world, dt);
  rebuildEnemyHash(world);
  updateProjectileSystem(world, dt);
  updateSpawnSystem(world, dt);

  if (!world.player.alive && !world.defeated) {
    world.defeated = true;
    world.events.emit(GameEvent.PlayerDefeated, world.player.pos.x, world.player.pos.z);
  }
}

/** Huella compacta del estado, para comprobar el determinismo en los tests. */
export function worldFingerprint(world: World): string {
  const parts: number[] = [
    world.tick,
    world.player.pos.x,
    world.player.pos.z,
    world.player.health,
    world.player.shield,
    world.weapon.heat,
    world.score.points,
    world.score.kills,
    world.spawner.wave,
    world.projectiles.activeCount,
    world.enemies.activeCount,
  ];
  for (const e of world.enemies.items) {
    if (!e.active) continue;
    parts.push(e.index, e.state, e.pos.x, e.pos.z, e.health);
  }
  parts.push(...world.rng.waves.getState(), ...world.rng.combat.getState());
  return parts.map((n) => (Number.isInteger(n) ? String(n) : n.toFixed(9))).join('|');
}
