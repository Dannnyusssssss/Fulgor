/**
 * Sistema de aparición (provisional del Hito 1): oleadas de Zumbadores de tamaño creciente,
 * en puntos de aparición alejados del jugador. Usa solo el flujo de oleadas del RNG.
 */
import { distSq } from '../../core/math';
import { BALANCE } from '../../data/balance';
import { GameEvent } from '../events';
import { EnemyKind, EnemyState } from '../enemies/types';
import { SpawnPhase, waveSize } from '../spawner';
import type { World } from '../world';

export function updateSpawnSystem(world: World, dt: number): void {
  const s = world.spawner;
  const cfg = BALANCE.spawn;
  if (world.defeated || !world.player.alive) return;
  s.timer -= dt;

  switch (s.phase) {
    case SpawnPhase.Rest:
      if (s.timer <= 0) {
        s.wave++;
        s.toSpawn = waveSize(s.wave, cfg.firstWaveCount, cfg.perWaveIncrement);
        s.phase = SpawnPhase.Spawning;
        s.timer = 0;
        world.events.emit(GameEvent.WaveStart, 0, 0, s.wave);
      }
      break;

    case SpawnPhase.Spawning:
      if (s.timer <= 0 && world.enemies.activeCount < cfg.maxAlive) {
        if (spawnEnemy(world)) s.toSpawn--;
        s.timer = cfg.intervalSeconds;
        if (s.toSpawn <= 0) s.phase = SpawnPhase.Fighting;
      }
      break;

    case SpawnPhase.Fighting:
      if (world.enemies.activeCount === 0) {
        s.phase = SpawnPhase.Rest;
        s.timer = cfg.restSeconds;
      }
      break;
  }
}

/** Elige un punto de aparición lejos del jugador y crea un Zumbador materializándose. */
function spawnEnemy(world: World): boolean {
  const points = world.arena.def.enemySpawns;
  if (points.length === 0) return false;
  // Una sola tirada por aparición, ocurra lo que ocurra: así el flujo de oleadas no depende del jugador.
  const roll = world.rng.waves.next();
  const minD2 = BALANCE.spawn.minDistanceFromPlayer ** 2;
  const px = world.player.pos.x;
  const pz = world.player.pos.z;
  let farCount = 0;
  for (const sp of points) if (distSq(sp.x, sp.z, px, pz) >= minD2) farCount++;
  let chosen = points[0];
  if (farCount > 0) {
    let k = Math.floor(roll * farCount);
    for (const sp of points) {
      if (distSq(sp.x, sp.z, px, pz) < minD2) continue;
      if (k-- === 0) {
        chosen = sp;
        break;
      }
    }
  } else {
    chosen = points[Math.floor(roll * points.length)];
  }
  if (chosen === undefined) return false;

  const e = world.enemies.acquire();
  if (e === null) return false;
  const def = world.tuning.zumbador;
  e.kind = EnemyKind.Zumbador;
  e.pos.x = chosen.x;
  e.pos.z = chosen.z;
  e.prev.x = chosen.x;
  e.prev.z = chosen.z;
  e.vel.x = 0;
  e.vel.z = 0;
  e.radius = def.radius;
  e.health = def.health;
  e.maxHealth = def.health;
  e.state = EnemyState.Materializing;
  e.stateTimer = BALANCE.spawn.materializeSeconds;
  e.stateDuration = BALANCE.spawn.materializeSeconds;
  e.dashHit = false;
  e.chargeCooldown = 0;
  e.sinceHurt = 999;
  e.yaw = Math.atan2(chosen.x - px, chosen.z - pz);
  world.events.emit(GameEvent.EnemySpawn, e.pos.x, e.pos.z, e.index);
  return true;
}
