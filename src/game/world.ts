/**
 * Mundo de juego (lógica pura) y orden fijo de los sistemas en cada paso.
 * Misma semilla + mismas órdenes = mismo estado.
 */
import type { PlayerCommand } from '../core/input';
import { vec2 } from '../core/math';
import { Pool } from '../core/pool';
import { createStreams, type RngStreams } from '../core/rng';
import { SpatialHash } from '../core/spatial-hash';
import type { ArenaDef } from '../data/arenas';
import type { AbilityId } from '../data/abilities';
import { BALANCE } from '../data/balance';
import { DIFFICULTIES, type Difficulty, type DifficultyDef } from '../data/difficulty';
import { WAVES, type WaveDef } from '../data/waves';
import { WEAPON_ORDER, type WeaponDef, type WeaponId } from '../data/weapons';
import { createAbilityState, type AbilityState } from './abilities';
import { createZoneSlot, type BossZone } from './boss-zones';
import { createArena, type Arena } from './arena';
import { createDirector, DirectorPhase, type DirectorState } from './director';
import { EventQueue, GameEvent } from './events';
import type { AiTarget } from './enemies/common';
import { createEnemySlot, type Enemy } from './enemies/types';
import { createModifiers, effectivePlayer, effectiveWeapon, type Modifiers } from './modifiers';
import { choosePerk, computeModifiers, createPerkState, type PerkState } from './perks';
import { NavField } from './nav';
import { createPickupSlot, type Pickup } from './pickups';
import { createPlayer, type PlayerState } from './player';
import { createProjectileSlot, type Projectile } from './projectiles';
import { createScore, type ScoreState } from './score';
import { createTuning, type PlayerTuning, type Tuning } from './tuning';
import { createWeaponState, type WeaponState } from './weapon';
import { syncTarget, updateAbilitySystem } from './systems/ability-system';
import { updateDirectorSystem } from './systems/director-system';
import { rebuildEnemyHash, separateEnemies, updateEnemySystem } from './systems/enemy-system';
import { updateBossZoneSystem } from './systems/boss-zone-system';
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
  /** Estado de calor de cada arma, en el orden de las ranuras (1, 2, 3). */
  readonly weapons: readonly WeaponState[];
  /** Armas efectivas (datos base + mejoras), recalculadas en cada paso. */
  readonly weaponDefs: readonly WeaponDef[];
  /** Ranura del arma en la mano (0, 1 o 2). */
  activeWeapon: number;
  /** Ranuras desbloqueadas. */
  readonly unlockedWeapons: readonly boolean[];
  /** Modificadores de las mejoras de esta partida. */
  readonly mods: Modifiers;
  /** Valores efectivos del jugador (datos base + mejoras), recalculados en cada paso. */
  readonly playerStats: PlayerTuning;
  readonly ability: AbilityState;
  /** Mejoras elegidas y oferta actual. */
  readonly perks: PerkState;
  /** Hay elección de mejoras entre oleadas. */
  readonly perksEnabled: boolean;
  /** Objetivo de la IA: copia de la posición del jugador o del señuelo. */
  readonly aiTarget: AiTarget;
  readonly projectiles: Pool<Projectile>;
  readonly enemies: Pool<Enemy>;
  readonly pickups: Pool<Pickup>;
  /** Orbes del Coloso (zonas de peligro con aviso). */
  readonly bossZones: Pool<BossZone>;
  /** Espera entre avisos visuales del daño continuo de esas zonas. */
  bossZoneHitCooldown: number;
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
  /** Armas desbloqueadas (el Pulsador siempre). */
  weapons?: readonly WeaponId[];
  /** Habilidad elegida para la partida. */
  ability?: AbilityId;
  /** Elección de mejoras entre oleadas (por defecto sí). */
  perks?: boolean;
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
  const unlocked = WEAPON_ORDER.map((id) => id === 'pulsador' || (opts.weapons ?? []).includes(id));
  const mods = createModifiers();
  // Copias propias (se sobrescriben en cada paso con los valores efectivos).
  const weaponDefs = WEAPON_ORDER.map((id) => ({ ...tuning.weapons[id] }));
  const playerStats = JSON.parse(JSON.stringify(tuning.player)) as PlayerTuning;
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
    weapons: WEAPON_ORDER.map(() => createWeaponState()),
    weaponDefs,
    activeWeapon: 0,
    unlockedWeapons: unlocked,
    mods,
    playerStats,
    ability: createAbilityState(opts.ability ?? 'onda'),
    perks: createPerkState(),
    perksEnabled: opts.perks ?? true,
    aiTarget: { pos: vec2(spawn.x, spawn.z), radius: tuning.player.radius, alive: true },
    projectiles: new Pool(BALANCE.pools.projectiles, createProjectileSlot),
    enemies: new Pool(enemyCap, createEnemySlot),
    pickups: new Pool(BALANCE.pickups.capacity, createPickupSlot),
    bossZones: new Pool(BALANCE.boss.zoneCapacity, createZoneSlot),
    bossZoneHitCooldown: 0,
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
  refreshStats(world);
  syncTarget(world);
  world.navSmall.recompute(spawn.x, spawn.z);
  world.navLarge.recompute(spawn.x, spawn.z);
  if (stress) setupStress(world);
  return world;
}

/**
 * Un paso fijo de simulación. Este es el único lugar donde se declara el orden de los sistemas:
 * 0. valores efectivos (datos + mejoras) → 1. jugador → 2. habilidad (y objetivo de la IA) → 3. armas
 * → 4. mapas de distancias → 5. IA de enemigos → 6. separación y hash → 7. proyectiles (daño y desactivaciones)
 * → 8. peligros de la arena → 9. zonas del Coloso → 10. objetos → 11. director de oleadas
 * → 12. prueba de rendimiento (solo con ?stress) → 13. derrota.
 */
export function stepWorld(world: World, cmd: PlayerCommand): void {
  if (world.victory) return;
  // Elección de mejora: nada avanza hasta que llega una opción válida.
  if (world.director.phase === DirectorPhase.PerkChoice) {
    handlePerkChoice(world, cmd.perk);
    return;
  }
  const dt = world.dt;
  world.tick++;
  world.time += dt;

  refreshStats(world);
  updatePlayerSystem(world, cmd, dt);
  updateAbilitySystem(world, cmd, dt);
  updateWeaponSystem(world, cmd, dt);
  // Los dos mapas se recalculan en pasos distintos para repartir el trabajo. Apuntan al objetivo de la IA.
  const every = BALANCE.nav.recomputeEverySteps;
  const target = world.aiTarget.pos;
  if (world.tick % every === 1) world.navSmall.recompute(target.x, target.z);
  if (world.tick % every === (every >> 1) + 1) world.navLarge.recompute(target.x, target.z);
  updateEnemySystem(world, dt);
  rebuildEnemyHash(world);
  separateEnemies(world, dt);
  rebuildEnemyHash(world);
  updateProjectileSystem(world, dt);
  updateHazardSystem(world, dt);
  updateBossZoneSystem(world, dt);
  updatePickupSystem(world, dt);
  updateDirectorSystem(world, dt);
  if (world.stress) updateStressSystem(world);

  if (!world.player.alive && !world.defeated) {
    world.defeated = true;
    world.events.emit(GameEvent.PlayerDefeated, world.player.pos.x, world.player.pos.z);
  }
}

/** Aplica la mejora elegida (1, 2 o 3) y pasa al descanso antes de la siguiente oleada. */
function handlePerkChoice(world: World, choice: number): void {
  const index = choosePerk(world.perks, choice - 1);
  if (index < 0) return;
  applyPerks(world);
  world.director.phase = DirectorPhase.Rest;
  world.director.timer = BALANCE.director.restSeconds;
  world.events.emit(GameEvent.PerkChosen, world.player.pos.x, world.player.pos.z, index);
}

/**
 * Recalcula los modificadores desde las mejoras elegidas. Si sube la vida o el escudo máximos,
 * Chispa recupera esa diferencia.
 */
export function applyPerks(world: World): void {
  computeModifiers(world.perks, world.mods);
  refreshStats(world);
  const p = world.player;
  const s = world.playerStats;
  if (s.maxHealth > p.maxHealth) p.health += s.maxHealth - p.maxHealth;
  if (s.maxShield > p.maxShield) p.shield += s.maxShield - p.maxShield;
  p.maxHealth = s.maxHealth;
  p.maxShield = s.maxShield;
  p.health = Math.min(p.health, p.maxHealth);
  p.shield = Math.min(p.shield, p.maxShield);
}

/** Recalcula las armas y los valores del jugador efectivos (datos editables + mejoras). No crea objetos. */
export function refreshStats(world: World): void {
  const t = world.tuning;
  WEAPON_ORDER.forEach((id, i) => {
    const out = world.weaponDefs[i];
    if (out !== undefined) effectiveWeapon(out, t.weapons[id], world.mods);
  });
  effectivePlayer(world.playerStats, t.player, world.mods);
}

/** Arma en la mano y su estado. */
export function activeWeaponDef(world: World): WeaponDef {
  return world.weaponDefs[world.activeWeapon] ?? (world.weaponDefs[0] as WeaponDef);
}

export function activeWeaponState(world: World): WeaponState {
  return world.weapons[world.activeWeapon] ?? (world.weapons[0] as WeaponState);
}

/** Huella compacta del estado, para comprobar el determinismo en los tests. */
export function worldFingerprint(world: World): string {
  const parts: number[] = [
    world.tick,
    world.player.pos.x,
    world.player.pos.z,
    world.player.health,
    world.player.shield,
    world.activeWeapon,
    ...world.weapons.map((w) => w.heat),
    world.ability.cooldown,
    ...world.perks.levels,
    world.score.points,
    world.score.kills,
    world.director.wave,
    world.director.phase,
    world.projectiles.activeCount,
    world.enemies.activeCount,
    world.pickups.activeCount,
    world.bossZones.activeCount,
  ];
  for (const e of world.enemies.items) {
    if (!e.active) continue;
    parts.push(e.index, e.kind, e.state, e.pos.x, e.pos.z, e.health, e.phase);
  }
  parts.push(...world.rng.waves.getState(), ...world.rng.combat.getState());
  return parts.map((n) => (Number.isInteger(n) ? String(n) : n.toFixed(9))).join('|');
}
