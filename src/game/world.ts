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
import { DIFFICULTIES, type Difficulty, type DifficultyDef } from '../data/difficulty';
import { WAVES, type WaveDef } from '../data/waves';
import { createArena, type Arena } from './arena';
import { createDirector, type DirectorState } from './director';
import { EventQueue, GameEvent } from './events';
import { createEnemySlot, type Enemy } from './enemies/types';
import { NavField } from './nav';
import { createPickupSlot, type Pickup } from './pickups';
import { createPlayer, type PlayerState } from './player';
import { createProjectileSlot, type Projectile } from './projectiles';
import { createScore, type ScoreState } from './score';
import { createTuning, type Tuning } from './tuning';
import { createWeaponState, type WeaponState } from './weapon';
import { updateDirectorSystem } from './systems/director-system';
import { rebuildEnemyHash, separateEnemies, updateEnemySystem } from './systems/enemy-system';
import { updateHazardSystem } from './systems/hazard-system';
import { updatePickupSystem } from './systems/pickup-system';
import { updatePlayerSystem } from './systems/player-system';
import { updateProjectileSystem } from './systems/projectile-system';
import { setupStress, updateStressSystem } from './systems/stress-system';
import { updateWeaponSystem } from './systems/weapon-system';

export interface World {
  readonly seed: number;
  readonly dt: number;
  tick: number;
  time: number;
  readonly arena: Arena;
  readonly waves: readonly WaveDef[];
  readonly difficulty: Difficulty;
  readonly diff: DifficultyDef;
  readonly player: PlayerState;
  readonly weapon: WeaponState;
  readonly projectiles: Pool<Projectile>;
  readonly enemies: Pool<Enemy>;
  readonly pickups: Pool<Pickup>;
  readonly enemyHash: SpatialHash;
  /** Mapas de distancias para cuerpos pequeños y grandes. */
  readonly navSmall: NavField;
  readonly navLarge: NavField;
  readonly director: DirectorState;
  readonly score: ScoreState;
  readonly rng: RngStreams;
  readonly events: EventQueue;
  readonly tuning: Tuning;
  /** Fase anterior de cada peligro (para detectar la activación). */
  readonly hazardPhases: Uint8Array;
  /** Espera entre avisos visuales de daño por peligro (el daño es continuo). */
  hazardHitCooldown: number;
  pickupTimer: number;
  god: boolean;
  /** Modo de prueba de rendimiento (?stress). */
  readonly stress: boolean;
  /** La partida terminó por derrota. */
  defeated: boolean;
  /** Se superaron todas las oleadas. */
  victory: boolean;
  /** Buffer reutilizable para consultas al hash de enemigos. */
  readonly scratch: number[];
}

export interface WorldOptions {
  seed: number;
  arena: ArenaDef;
  difficulty?: Difficulty;
  god?: boolean;
  tuning?: Tuning;
  /** Oleada inicial (depuración). */
  startWave?: number;
  stress?: boolean;
}

export function createWorld(opts: WorldOptions): World {
  const tuning = opts.tuning ?? createTuning();
  const arena = createArena(opts.arena);
  const spawn = opts.arena.playerSpawn;
  const b = arena.bounds;
  const enemyCap = BALANCE.pools.enemies;
  const difficulty = opts.difficulty ?? 'normal';
  const waves = WAVES[opts.arena.id] ?? [];
  const startWave = Math.min(
    Math.max(1, Math.floor(opts.startWave ?? 1)),
    Math.max(1, waves.length),
  );
  const stress = opts.stress ?? false;
  const world: World = {
    seed: opts.seed >>> 0,
    dt: 1 / BALANCE.sim.stepHz,
    tick: 0,
    time: 0,
    arena,
    waves,
    difficulty,
    diff: DIFFICULTIES[difficulty],
    player: createPlayer(spawn.x, spawn.z, spawn.yaw, tuning.player),
    weapon: createWeaponState(),
    projectiles: new Pool(BALANCE.pools.projectiles, createProjectileSlot),
    enemies: new Pool(enemyCap, createEnemySlot),
    pickups: new Pool(BALANCE.pickups.capacity, createPickupSlot),
    enemyHash: new SpatialHash(b.minX, b.minZ, b.maxX - b.minX, b.maxZ - b.minZ, 2, enemyCap),
    navSmall: new NavField(arena, BALANCE.nav.cellSize, BALANCE.nav.smallRadius),
    navLarge: new NavField(arena, BALANCE.nav.cellSize, BALANCE.nav.largeRadius),
    director: createDirector(BALANCE.director.firstRestSeconds, startWave),
    score: createScore(),
    rng: createStreams(opts.seed),
    events: new EventQueue(BALANCE.pools.events),
    tuning,
    hazardPhases: new Uint8Array(opts.arena.hazards.length),
    hazardHitCooldown: 0,
    pickupTimer: BALANCE.pickups.periodicSeconds,
    god: (opts.god ?? false) || stress,
    stress,
    defeated: false,
    victory: false,
    scratch: new Array<number>(enemyCap).fill(0),
  };
  world.navSmall.recompute(spawn.x, spawn.z);
  world.navLarge.recompute(spawn.x, spawn.z);
  if (stress) setupStress(world);
  return world;
}

/**
 * Un paso fijo de simulación. Este es el único lugar donde se declara el orden de los sistemas:
 * 1. jugador → 2. arma → 3. mapas de distancias → 4. IA de enemigos → 5. separación y hash
 * → 6. proyectiles (daño y desactivaciones) → 7. peligros → 8. objetos → 9. director de oleadas
 * → 10. prueba de rendimiento (solo con ?stress) → 11. derrota.
 */
export function stepWorld(world: World, cmd: PlayerCommand): void {
  if (world.victory) return;
  const dt = world.dt;
  world.tick++;
  world.time += dt;

  updatePlayerSystem(world, cmd, dt);
  updateWeaponSystem(world, cmd, dt);
  // Los dos mapas se recalculan en pasos distintos para repartir el trabajo.
  const every = BALANCE.nav.recomputeEverySteps;
  if (world.tick % every === 1) world.navSmall.recompute(world.player.pos.x, world.player.pos.z);
  if (world.tick % every === (every >> 1) + 1) {
    world.navLarge.recompute(world.player.pos.x, world.player.pos.z);
  }
  updateEnemySystem(world, dt);
  rebuildEnemyHash(world);
  separateEnemies(world, dt);
  rebuildEnemyHash(world);
  updateProjectileSystem(world, dt);
  updateHazardSystem(world, dt);
  updatePickupSystem(world, dt);
  updateDirectorSystem(world, dt);
  if (world.stress) updateStressSystem(world);

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
    world.director.wave,
    world.director.phase,
    world.projectiles.activeCount,
    world.enemies.activeCount,
    world.pickups.activeCount,
  ];
  for (const e of world.enemies.items) {
    if (!e.active) continue;
    parts.push(e.index, e.kind, e.state, e.pos.x, e.pos.z, e.health);
  }
  parts.push(...world.rng.waves.getState(), ...world.rng.combat.getState());
  return parts.map((n) => (Number.isInteger(n) ? String(n) : n.toFixed(9))).join('|');
}
