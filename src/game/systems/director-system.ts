/**
 * Sistema del director de oleadas: descanso → composición → apariciones en portales → combate → siguiente oleada.
 * Los portales se eligen lejos del jugador y, si se puede, fuera de su campo de visión.
 */
import { distSq, wrapAngle, yawFromDir } from '../../core/math';
import { BALANCE } from '../../data/balance';
import { isCircleFree } from '../collision';
import { composeWave, DirectorPhase } from '../director';
import { GameEvent } from '../events';
import { EnemyKind, type EnemyKindId } from '../enemies/types';
import { makeOffer } from '../perks';
import { onWaveCleared, onWaveStart } from '../score';
import type { World } from '../world';
import { spawnEnemy } from './spawn';

export function updateDirectorSystem(world: World, dt: number): void {
  const d = world.director;
  if (d.disabled || world.defeated || !world.player.alive) return;
  const cfg = BALANCE.director;
  d.timer -= dt;

  switch (d.phase) {
    case DirectorPhase.Rest:
      if (d.timer <= 0) startNextWave(world);
      break;

    case DirectorPhase.Spawning:
      if (d.timer <= 0 && world.enemies.activeCount < world.diff.maxAlive) {
        const kind = (d.queue[d.queueIndex] ?? 1) as EnemyKindId;
        if (spawnAtPortal(world, kind)) d.queueIndex++;
        d.timer = cfg.intervalSeconds;
      }
      if (d.queueIndex >= d.queueLength) d.phase = DirectorPhase.Fighting;
      break;

    case DirectorPhase.Fighting:
      if (world.enemies.activeCount === 0) {
        const bonus = onWaveCleared(world.score, d.wave, world.diff.scoreMultiplier);
        world.events.emit(GameEvent.WaveCleared, 0, 0, d.wave, bonus);
        if (d.wave >= world.waves.length) {
          d.phase = DirectorPhase.Victory;
          world.victory = true;
          world.events.emit(GameEvent.Victory, world.player.pos.x, world.player.pos.z);
        } else if (
          world.perksEnabled &&
          makeOffer(world.perks, world.rng.perks, {
            unlockedWeapons: world.unlockedWeapons,
            ability: world.ability.id,
          }) > 0
        ) {
          // Elegir mejora: la simulación se detiene hasta que llegue la elección (ver stepWorld).
          d.phase = DirectorPhase.PerkChoice;
          world.events.emit(GameEvent.PerkOffer, 0, 0, world.perks.offerCount);
        } else {
          d.phase = DirectorPhase.Rest;
          d.timer = cfg.restSeconds;
        }
      }
      break;

    default:
      break;
  }
}

function startNextWave(world: World): void {
  const d = world.director;
  const def = world.waves[d.wave];
  if (def === undefined) {
    d.phase = DirectorPhase.Victory;
    world.victory = true;
    return;
  }
  d.wave++;
  d.queueLength = composeWave(
    def,
    world.diff.budgetMultiplier,
    world.tuning,
    world.rng.waves,
    d.queue,
  );
  d.queueIndex = 0;
  d.phase = DirectorPhase.Spawning;
  d.timer = 0;
  onWaveStart(world.score);
  world.events.emit(GameEvent.WaveStart, 0, 0, d.wave, d.queueLength);
}

/** El Coloso aparece en el punto de jefe de la arena más lejano al jugador. */
function spawnBoss(world: World): boolean {
  const p = world.player;
  let best = world.arena.def.bossSpawns[0];
  let bestD = -1;
  for (const sp of world.arena.def.bossSpawns) {
    const d = distSq(sp.x, sp.z, p.pos.x, p.pos.z);
    if (d > bestD) {
      bestD = d;
      best = sp;
    }
  }
  if (best === undefined) return false;
  const yaw = yawFromDir(p.pos.x - best.x, p.pos.z - best.z);
  return spawnEnemy(world, EnemyKind.Coloso, best.x, best.z, yaw);
}

/**
 * Elige el portal: primero los puntos lejanos fuera del campo de visión, si no los lejanos, si no cualquiera.
 * Siempre hace dos tiradas del flujo de oleadas (punto y desplazamiento) para no desincronizar las oleadas siguientes.
 */
export function spawnAtPortal(world: World, kind: EnemyKindId): boolean {
  if (kind === EnemyKind.Coloso) return spawnBoss(world);
  const cfg = BALANCE.director;
  const points = world.arena.def.enemySpawns;
  const roll = world.rng.waves.next();
  const jitterRoll = world.rng.waves.next();
  if (points.length === 0) return false;
  const p = world.player;
  const minD2 = cfg.minDistanceFromPlayer * cfg.minDistanceFromPlayer;
  const isFar = (x: number, z: number): boolean => distSq(x, z, p.pos.x, p.pos.z) >= minD2;
  const isHidden = (x: number, z: number): boolean =>
    Math.abs(wrapAngle(yawFromDir(x - p.pos.x, z - p.pos.z) - p.yaw)) > cfg.viewHalfAngle;

  let tier = 0;
  let count = 0;
  for (const sp of points) if (isFar(sp.x, sp.z) && isHidden(sp.x, sp.z)) count++;
  if (count === 0) {
    tier = 1;
    for (const sp of points) if (isFar(sp.x, sp.z)) count++;
  }
  if (count === 0) {
    tier = 2;
    count = points.length;
  }
  let k = Math.floor(roll * count);
  let chosen = points[0];
  for (const sp of points) {
    const ok =
      tier === 0
        ? isFar(sp.x, sp.z) && isHidden(sp.x, sp.z)
        : tier === 1
          ? isFar(sp.x, sp.z)
          : true;
    if (!ok) continue;
    if (k-- === 0) {
      chosen = sp;
      break;
    }
  }
  if (chosen === undefined) return false;

  // Desplazamiento alrededor del punto para que no aparezcan todos en el mismo sitio.
  const a = jitterRoll * Math.PI * 2;
  let x = chosen.x + Math.cos(a) * cfg.spawnJitter;
  let z = chosen.z + Math.sin(a) * cfg.spawnJitter;
  if (!isCircleFree(world.arena, x, z, 1)) {
    x = chosen.x;
    z = chosen.z;
  }
  return spawnEnemy(world, kind, x, z, yawFromDir(p.pos.x - x, p.pos.z - z));
}
