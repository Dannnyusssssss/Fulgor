import { describe, expect, it } from 'vitest';
import { emptyCommand, type PlayerCommand } from '../src/core/input';
import { HANGAR_COBALTO } from '../src/data/arenas';
import { BALANCE } from '../src/data/balance';
import { EventQueue, GameEvent } from '../src/game/events';
import { EnemyState } from '../src/game/enemies/types';
import { damageEnemy } from '../src/game/systems/projectile-system';
import { spawnPlayerProjectile } from '../src/game/systems/weapon-system';
import { SpawnPhase, waveSize } from '../src/game/spawner';
import { createWorld, stepWorld, worldFingerprint, type World } from '../src/game/world';

function placeEnemy(world: World, x: number, z: number) {
  const e = world.enemies.acquire();
  if (!e) throw new Error('pool lleno');
  const def = world.tuning.zumbador;
  e.pos.x = x;
  e.pos.z = z;
  e.prev.x = x;
  e.prev.z = z;
  e.radius = def.radius;
  e.health = def.health;
  e.maxHealth = def.health;
  e.state = EnemyState.Recover;
  e.stateTimer = 100;
  return e;
}

/**
 * Entradas guionizadas: gira despacio, dispara a ráfagas (con pausas para no sobrecalentar),
 * se mueve en círculos, esquiva y ventila de vez en cuando.
 */
function scripted(tick: number, out: PlayerCommand): PlayerCommand {
  out.yaw = Math.sin(tick / 90) * 2.5;
  out.moveX = Math.sin(tick / 47) > 0 ? 1 : -1;
  out.moveZ = Math.cos(tick / 61) > 0.3 ? 1 : 0;
  out.fire = tick % 120 < 80;
  out.aim = tick % 600 > 500;
  out.dodge = tick % 150 === 0;
  out.vent = tick % 400 === 399;
  return out;
}

function simulate(seed: number, steps: number, script = scripted): World {
  const world = createWorld({ seed, arena: HANGAR_COBALTO });
  const cmd = emptyCommand();
  for (let i = 0; i < steps; i++) {
    stepWorld(world, script(world.tick, cmd));
    world.events.clear();
  }
  return world;
}

describe('simulación con semilla fija', () => {
  it('la misma semilla y las mismas entradas terminan siempre en el mismo estado', () => {
    const a = simulate(12345, 60 * 45);
    const b = simulate(12345, 60 * 45);
    expect(worldFingerprint(a)).toBe(worldFingerprint(b));
    // La partida tuvo combate de verdad.
    expect(a.spawner.wave).toBeGreaterThanOrEqual(1);
    expect(a.score.kills).toBeGreaterThan(0);
  });

  it('otra semilla da otra partida', () => {
    const a = simulate(1, 60 * 20);
    const b = simulate(2, 60 * 20);
    expect(worldFingerprint(a)).not.toBe(worldFingerprint(b));
  });

  it('el tamaño de las oleadas no depende de lo que haga el jugador', () => {
    const idle = (_t: number, out: PlayerCommand) => {
      out.fire = false;
      out.moveX = 0;
      out.moveZ = 0;
      return out;
    };
    const w1 = createWorld({ seed: 7, arena: HANGAR_COBALTO, god: true });
    const w2 = createWorld({ seed: 7, arena: HANGAR_COBALTO, god: true });
    const c = emptyCommand();
    for (let i = 0; i < 60 * 5; i++) {
      stepWorld(w1, idle(i, c));
      stepWorld(w2, scripted(i, c));
    }
    expect(w1.spawner.wave).toBe(1);
    expect(w2.spawner.wave).toBe(1);
    expect(waveSize(1, BALANCE.spawn.firstWaveCount, BALANCE.spawn.perWaveIncrement)).toBe(4);
    // Mismo número de tiradas del flujo de oleadas.
    expect(w1.rng.waves.getState()).toEqual(w2.rng.waves.getState());
  });

  it('ningún estado se vuelve NaN tras una partida larga', () => {
    const w = simulate(99, 60 * 60);
    const fp = worldFingerprint(w);
    expect(fp.includes('NaN')).toBe(false);
  });
});

describe('oleadas provisionales', () => {
  it('empieza con un descanso, luego aparece la primera oleada lejos del jugador', () => {
    const w = createWorld({ seed: 3, arena: HANGAR_COBALTO, god: true });
    const c = emptyCommand();
    let spawnEvents = 0;
    for (let i = 0; i < 60 * 6; i++) {
      stepWorld(w, c);
      w.events.drain((e) => {
        if (e.type === GameEvent.EnemySpawn) {
          spawnEvents++;
          const d = Math.hypot(e.x - w.player.pos.x, e.z - w.player.pos.z);
          expect(d).toBeGreaterThanOrEqual(BALANCE.spawn.minDistanceFromPlayer);
        }
      });
    }
    expect(spawnEvents).toBe(BALANCE.spawn.firstWaveCount);
  });

  it('al desactivar a todos empieza el descanso y después la siguiente oleada, más grande', () => {
    const w = createWorld({ seed: 3, arena: HANGAR_COBALTO, god: true });
    const c = emptyCommand();
    while (w.spawner.phase !== SpawnPhase.Fighting) stepWorld(w, c);
    for (const e of w.enemies.items) {
      if (!e.active) continue;
      e.state = EnemyState.Chase;
      damageEnemy(w, e, 9999);
    }
    expect(w.score.kills).toBe(4);
    expect(w.score.points).toBe(4 * w.tuning.zumbador.score);
    stepWorld(w, c);
    expect(w.spawner.phase).toBe(SpawnPhase.Rest);
    for (let i = 0; i < 60 * (BALANCE.spawn.restSeconds + 0.5); i++) stepWorld(w, c);
    expect(w.spawner.wave).toBe(2);
  });

  it('respeta el tope de enemigos vivos', () => {
    const w = createWorld({ seed: 5, arena: HANGAR_COBALTO, god: true });
    const c = emptyCommand();
    for (let i = 0; i < 60 * 120; i++) {
      stepWorld(w, c);
      w.events.clear();
      expect(w.enemies.activeCount).toBeLessThanOrEqual(BALANCE.spawn.maxAlive);
    }
  });
});

describe('proyectiles y daño', () => {
  it('un disparo daña a un enemigo en la línea de tiro', () => {
    const w = createWorld({ seed: 1, arena: HANGAR_COBALTO });
    const e = placeEnemy(w, 0, -2);
    const c = emptyCommand();
    c.fire = true;
    stepWorld(w, c);
    c.fire = false;
    for (let i = 0; i < 10; i++) stepWorld(w, c);
    expect(e.health).toBe(w.tuning.zumbador.health - w.tuning.weapon.damage);
  });

  it('un proyectil rápido no atraviesa enemigos ni coberturas', () => {
    const w = createWorld({ seed: 1, arena: HANGAR_COBALTO });
    w.tuning.weapon.projectileSpeed = 300; // 5 m por paso
    w.player.pos.x = -8;
    w.player.pos.z = -3;
    const e = placeEnemy(w, -8, -12); // detrás de la caja (-8, -8)
    spawnPlayerProjectile(w);
    let hitWall = false;
    for (let i = 0; i < 20; i++) {
      stepWorld(w, emptyCommand());
      w.events.drain((ev) => {
        if (ev.type === GameEvent.ProjectileHitWall) {
          hitWall = true;
          expect(ev.z).toBeGreaterThan(-7.5);
        }
      });
    }
    expect(hitWall).toBe(true);
    expect(e.health).toBe(w.tuning.zumbador.health);
  });

  it('un proyectil muy rápido impacta a un enemigo delgado que cruzaría en un paso', () => {
    const w = createWorld({ seed: 1, arena: HANGAR_COBALTO });
    w.tuning.weapon.projectileSpeed = 600; // 10 m por paso, el enemigo mide 1 m
    const e = placeEnemy(w, 0, -3);
    spawnPlayerProjectile(w);
    stepWorld(w, emptyCommand());
    expect(e.health).toBeLessThan(w.tuning.zumbador.health);
  });

  it('el proyectil se apaga al agotar su alcance', () => {
    const w = createWorld({ seed: 1, arena: HANGAR_COBALTO });
    w.tuning.weapon.range = 2;
    spawnPlayerProjectile(w);
    for (let i = 0; i < 10; i++) stepWorld(w, emptyCommand());
    expect(w.projectiles.activeCount).toBe(0);
  });

  it('los enemigos materializándose no reciben daño', () => {
    const w = createWorld({ seed: 1, arena: HANGAR_COBALTO });
    const e = placeEnemy(w, 0, -2);
    e.state = EnemyState.Materializing;
    e.stateTimer = 10;
    damageEnemy(w, e, 50);
    expect(e.health).toBe(w.tuning.zumbador.health);
  });

  it('al quedarse sin vida la partida termina en derrota con su evento', () => {
    const w = createWorld({ seed: 1, arena: HANGAR_COBALTO });
    w.player.health = 0;
    w.player.alive = false;
    stepWorld(w, emptyCommand());
    expect(w.defeated).toBe(true);
    let defeatedEvents = 0;
    w.events.drain((e) => {
      if (e.type === GameEvent.PlayerDefeated) defeatedEvents++;
    });
    expect(defeatedEvents).toBe(1);
  });

  it('los enemigos no se apilan ni se meten dentro de Chispa', () => {
    const w = createWorld({ seed: 1, arena: HANGAR_COBALTO, god: true });
    const a = placeEnemy(w, 0, -3);
    const b = placeEnemy(w, 0.01, -3);
    const c = placeEnemy(w, 0, 4.2);
    for (let i = 0; i < 60; i++) stepWorld(w, emptyCommand());
    expect(Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z)).toBeGreaterThan(0.5);
    expect(Math.hypot(c.pos.x - w.player.pos.x, c.pos.z - w.player.pos.z)).toBeGreaterThanOrEqual(
      c.radius + w.player.radius - 1e-6,
    );
  });
});

describe('EventQueue', () => {
  it('guarda, recorre, vacía y descarta si se llena', () => {
    const q = new EventQueue(2);
    q.emit(GameEvent.Shot, 1, 2);
    q.emit(GameEvent.Vent, 3, 4);
    q.emit(GameEvent.Overheat, 5, 6);
    expect(q.length).toBe(2);
    expect(q.dropped).toBe(1);
    const seen: number[] = [];
    q.drain((e) => seen.push(e.type));
    expect(seen).toEqual([GameEvent.Shot, GameEvent.Vent]);
    expect(q.length).toBe(0);
  });
});
