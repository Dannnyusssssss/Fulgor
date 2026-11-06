import { describe, expect, it } from 'vitest';
import { emptyCommand, type PlayerCommand } from '../src/core/input';
import { Rng } from '../src/core/rng';
import { ARENAS, FUNDICION_AMBAR, HANGAR_COBALTO } from '../src/data/arenas';
import { BALANCE } from '../src/data/balance';
import { DIFFICULTIES, DIFFICULTY_ORDER } from '../src/data/difficulty';
import { WAVES } from '../src/data/waves';
import { composeWave, compositionCost, DirectorPhase, MAX_WAVE_SIZE } from '../src/game/director';
import { EventQueue, GameEvent } from '../src/game/events';
import type { EnemyKindName } from '../src/data/enemies';
import {
  EnemyKind,
  EnemyState,
  kindDef,
  kindFromName,
  kindName,
  type EnemyKindId,
} from '../src/game/enemies/types';
import { HazardPhase, hazardCycle, hazardPhaseAt, insideHazard } from '../src/game/hazards';
import { PickupType, pickupTypeFromRoll } from '../src/game/pickups';
import {
  addKill,
  comboMultiplier,
  createScore,
  onPlayerDamaged,
  onWaveCleared,
} from '../src/game/score';
import { damageEnemy, hurtPlayer } from '../src/game/systems/damage';
import { spawnPickup } from '../src/game/systems/pickup-system';
import { spawnPlayerProjectile } from '../src/game/systems/weapon-system';
import { STRESS_ENEMIES } from '../src/game/systems/stress-system';
import { createTuning } from '../src/game/tuning';
import { createWorld, stepWorld, worldFingerprint, type World } from '../src/game/world';
import { placeEnemy } from './helpers';

/** Entradas guionizadas: gira, dispara a ráfagas, se mueve, esquiva y ventila de vez en cuando. */
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

function simulate(seed: number, steps: number, arena = HANGAR_COBALTO): World {
  const world = createWorld({ seed, arena });
  const cmd = emptyCommand();
  for (let i = 0; i < steps; i++) {
    stepWorld(world, scripted(world.tick, cmd));
    world.events.clear();
  }
  return world;
}

function stepN(w: World, n: number): void {
  const c = emptyCommand();
  for (let i = 0; i < n; i++) {
    stepWorld(w, c);
    w.events.clear();
  }
}

describe('simulación con semilla fija', () => {
  it('la misma semilla y las mismas entradas terminan siempre en el mismo estado (las 3 arenas)', () => {
    for (const arena of ARENAS) {
      const a = simulate(12345, 60 * 30, arena);
      const b = simulate(12345, 60 * 30, arena);
      expect(worldFingerprint(a)).toBe(worldFingerprint(b));
      expect(a.director.wave).toBeGreaterThanOrEqual(1);
    }
  });

  it('otra semilla da otra partida', () => {
    expect(worldFingerprint(simulate(1, 60 * 20))).not.toBe(worldFingerprint(simulate(2, 60 * 20)));
  });

  it('ningún estado se vuelve NaN tras una partida larga', () => {
    expect(worldFingerprint(simulate(99, 60 * 60, FUNDICION_AMBAR)).includes('NaN')).toBe(false);
  });
});

describe('composición de oleadas', () => {
  const tuning = createTuning();
  const out = new Uint8Array(MAX_WAVE_SIZE);

  it('cada arena tiene 10 oleadas', () => {
    for (const a of ARENAS) expect(WAVES[a.id]?.length).toBe(BALANCE.director.wavesPerArena);
  });

  it('respeta el presupuesto (salvo los obligatorios), los obligatorios y los máximos', () => {
    for (const a of ARENAS) {
      for (const def of WAVES[a.id] ?? []) {
        for (const d of DIFFICULTY_ORDER) {
          for (let seed = 1; seed <= 20; seed++) {
            const n = composeWave(
              def,
              DIFFICULTIES[d].budgetMultiplier,
              tuning,
              new Rng(seed),
              out,
            );
            const budget = Math.round(def.budget * DIFFICULTIES[d].budgetMultiplier);
            const counts = new Map<string, number>();
            for (let i = 0; i < n; i++) {
              const name = kindName((out[i] ?? 1) as EnemyKindId);
              counts.set(name, (counts.get(name) ?? 0) + 1);
            }
            let requiredCost = 0;
            for (const [name, req] of Object.entries(def.required ?? {})) {
              expect(counts.get(name) ?? 0).toBeGreaterThanOrEqual(req);
              requiredCost += req * kindDef(tuning, kindFromName(name as EnemyKindName)).cost;
            }
            expect(compositionCost(out, n, tuning)).toBeLessThanOrEqual(
              Math.max(budget, requiredCost),
            );
            for (const [name, max] of Object.entries(def.max ?? {})) {
              const req = def.required?.[name as keyof typeof def.required] ?? 0;
              expect(counts.get(name) ?? 0).toBeLessThanOrEqual(Math.max(max, req));
            }
            expect(n).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('es reproducible con la misma semilla y la dificultad cambia el tamaño', () => {
    const def = WAVES['hangar-cobalto']?.[5];
    expect(def).toBeDefined();
    if (!def) return;
    const a = new Uint8Array(MAX_WAVE_SIZE);
    const b = new Uint8Array(MAX_WAVE_SIZE);
    const na = composeWave(def, 1, tuning, new Rng(7), a);
    const nb = composeWave(def, 1, tuning, new Rng(7), b);
    expect(nb).toBe(na);
    expect([...b.slice(0, nb)]).toEqual([...a.slice(0, na)]);
    const easy = composeWave(def, DIFFICULTIES.easy.budgetMultiplier, tuning, new Rng(7), b);
    const hard = composeWave(def, DIFFICULTIES.hard.budgetMultiplier, tuning, new Rng(7), b);
    expect(compositionCost(b, hard, tuning)).toBeGreaterThan(0);
    expect(hard).toBeGreaterThan(easy);
  });

  it('lo que hace el jugador no cambia la composición de las oleadas', () => {
    const w1 = createWorld({ seed: 7, arena: HANGAR_COBALTO, god: true });
    const w2 = createWorld({ seed: 7, arena: HANGAR_COBALTO, god: true });
    const c = emptyCommand();
    const queues: string[][] = [[], []];
    [w1, w2].forEach((w, k) => {
      for (let i = 0; i < 60 * 4; i++) {
        stepWorld(w, k === 0 ? c : scripted(i, emptyCommand()));
        w.events.drain((e) => {
          if (e.type === GameEvent.WaveStart)
            queues[k]?.push([...w.director.queue.slice(0, w.director.queueLength)].join(','));
        });
      }
    });
    expect(queues[0]).toEqual(queues[1]);
    expect(queues[0]?.length).toBe(1);
  });
});

describe('director', () => {
  it('portales lejos del jugador, con el portal estable de la duración configurada', () => {
    const w = createWorld({ seed: 3, arena: HANGAR_COBALTO, god: true });
    let spawns = 0;
    const c = emptyCommand();
    for (let i = 0; i < 60 * 8; i++) {
      stepWorld(w, c);
      w.events.drain((e) => {
        if (e.type === GameEvent.EnemySpawn) {
          spawns++;
          const d = Math.hypot(e.x - w.player.pos.x, e.z - w.player.pos.z);
          expect(d).toBeGreaterThanOrEqual(
            BALANCE.director.minDistanceFromPlayer - BALANCE.director.spawnJitter,
          );
          const en = w.enemies.items[e.a];
          expect(en?.stateDuration).toBe(BALANCE.director.materializeSeconds);
        }
      });
    }
    expect(spawns).toBe(w.director.queueLength);
  });

  it('respeta el tope de enemigos vivos de cada dificultad', () => {
    for (const d of DIFFICULTY_ORDER) {
      const w = createWorld({
        seed: 5,
        arena: FUNDICION_AMBAR,
        god: true,
        difficulty: d,
        startWave: 10,
      });
      for (let i = 0; i < 60 * 30; i++) {
        stepWorld(w, emptyCommand());
        w.events.clear();
        expect(w.enemies.activeCount).toBeLessThanOrEqual(DIFFICULTIES[d].maxAlive);
      }
    }
  });

  it('al desactivar a todos: oleada superada con bonificación si fue limpia, descanso y siguiente oleada', () => {
    const w = createWorld({ seed: 3, arena: HANGAR_COBALTO, god: true });
    while (w.director.phase !== DirectorPhase.Fighting) stepN(w, 1);
    for (const e of w.enemies.items) {
      if (!e.active) continue;
      e.state = EnemyState.Chase;
      damageEnemy(w, e, 9999);
    }
    let bonus = -1;
    stepWorld(w, emptyCommand());
    w.events.drain((e) => {
      if (e.type === GameEvent.WaveCleared) bonus = e.b;
    });
    expect(bonus).toBe(BALANCE.score.cleanWaveBonus);
    expect(w.director.phase).toBe(DirectorPhase.Rest);
    stepN(w, 60 * (BALANCE.director.restSeconds + 0.5));
    expect(w.director.wave).toBe(2);
  });

  it('superar la última oleada da la victoria y detiene la simulación', () => {
    const w = createWorld({ seed: 3, arena: HANGAR_COBALTO, god: true, startWave: 10 });
    while (w.director.phase !== DirectorPhase.Fighting) stepN(w, 1);
    for (const e of w.enemies.items)
      if (e.active) {
        e.state = EnemyState.Chase;
        damageEnemy(w, e, 9999);
      }
    stepWorld(w, emptyCommand());
    expect(w.victory).toBe(true);
    const tick = w.tick;
    stepWorld(w, emptyCommand());
    expect(w.tick).toBe(tick);
  });
});

describe('daño, escudo del Blindado y ataques', () => {
  it('el daño recibido depende de la dificultad', () => {
    const easy = createWorld({ seed: 1, arena: HANGAR_COBALTO, difficulty: 'easy' });
    const hard = createWorld({ seed: 1, arena: HANGAR_COBALTO, difficulty: 'hard' });
    hurtPlayer(easy, 20, 0);
    hurtPlayer(hard, 20, 0);
    expect(easy.player.shield).toBeCloseTo(50 - 20 * DIFFICULTIES.easy.damageTakenMultiplier);
    expect(hard.player.shield).toBeCloseTo(50 - 20 * DIFFICULTIES.hard.damageTakenMultiplier);
  });

  it('el escudo frontal del Blindado detiene los disparos de frente, pero no por detrás', () => {
    const w = createWorld({ seed: 1, arena: HANGAR_COBALTO });
    // Jugador en (0, 4) mirando a -z. Blindado delante, mirando hacia el jugador.
    const front = placeEnemy(w, EnemyKind.Blindado, 0, -1);
    front.yaw = Math.PI; // mira hacia +z
    spawnPlayerProjectile(w);
    let blocked = 0;
    for (let i = 0; i < 20; i++) {
      stepWorld(w, emptyCommand());
      w.events.drain((e) => {
        if (e.type === GameEvent.ProjectileBlocked) blocked++;
      });
    }
    expect(blocked).toBe(1);
    expect(front.health).toBe(front.maxHealth);
    front.yaw = 0; // ahora de espaldas al jugador
    spawnPlayerProjectile(w);
    stepN(w, 20);
    expect(front.health).toBe(front.maxHealth - w.tuning.weapon.damage);
  });

  it('el proyectil del Centinela daña al jugador y una cobertura lo detiene', () => {
    const w = createWorld({ seed: 1, arena: HANGAR_COBALTO });
    const c = placeEnemy(w, EnemyKind.Centinela, 0, -4, EnemyState.Windup, 0.0001);
    c.dir.x = 0;
    c.dir.z = 1;
    stepN(w, 120);
    expect(w.player.shield).toBeLessThan(w.player.maxShield);

    const w2 = createWorld({ seed: 1, arena: HANGAR_COBALTO });
    w2.player.pos.x = 4.5;
    w2.player.pos.z = 3;
    const c2 = placeEnemy(w2, EnemyKind.Centinela, 4.5, -4, EnemyState.Windup, 0.0001);
    c2.dir.x = 0;
    c2.dir.z = 1;
    stepN(w2, 120);
    expect(w2.player.shield).toBe(w2.player.maxShield);
  });

  it('el rayo del Vigía daña en la línea, lo detiene una cobertura y lo evita la esquiva', () => {
    const make = (px: number, pz: number) => {
      const w = createWorld({ seed: 1, arena: HANGAR_COBALTO });
      w.player.pos.x = px;
      w.player.pos.z = pz;
      w.player.prev.x = px;
      w.player.prev.z = pz;
      const v = placeEnemy(w, EnemyKind.Vigia, px, pz - 10, EnemyState.Windup, 0.0001);
      v.dir.x = 0;
      v.dir.z = 1;
      return w;
    };
    const hit = make(0, 4);
    stepWorld(hit, emptyCommand());
    expect(hit.player.shield).toBeLessThan(hit.player.maxShield);

    const covered = make(4.5, 4); // columna (4.5, 0) en medio
    stepWorld(covered, emptyCommand());
    expect(covered.player.shield).toBe(covered.player.maxShield);

    const dodged = make(0, 4);
    dodged.player.invulnTimer = 0.2;
    stepWorld(dodged, emptyCommand());
    expect(dodged.player.shield).toBe(dodged.player.maxShield);
  });

  it('la onda del Blindado daña dentro del semicírculo y no fuera', () => {
    const inside = createWorld({ seed: 1, arena: HANGAR_COBALTO });
    const b = placeEnemy(inside, EnemyKind.Blindado, 0, 2, EnemyState.Windup, 0.0001);
    b.yaw = Math.PI; // mira a +z, hacia el jugador en (0, 4)
    stepWorld(inside, emptyCommand());
    expect(inside.player.shield).toBeLessThan(inside.player.maxShield);

    const behind = createWorld({ seed: 1, arena: HANGAR_COBALTO });
    const b2 = placeEnemy(behind, EnemyKind.Blindado, 0, 2, EnemyState.Windup, 0.0001);
    b2.yaw = 0; // de espaldas
    stepWorld(behind, emptyCommand());
    expect(behind.player.shield).toBe(behind.player.maxShield);
  });
});

describe('puntuación', () => {
  it('el combo sube con cada desactivación, tiene tope y se corta al recibir daño', () => {
    const s = createScore();
    expect(comboMultiplier(0)).toBe(1);
    expect(addKill(s, 100, 1)).toBe(100);
    expect(addKill(s, 100, 1)).toBe(110);
    expect(comboMultiplier(100)).toBe(BALANCE.score.comboMax);
    onPlayerDamaged(s);
    expect(s.combo).toBe(0);
    expect(s.bestCombo).toBe(2);
    expect(addKill(s, 100, 1.5)).toBe(150);
  });

  it('bonificación solo por oleada limpia', () => {
    const s = createScore();
    expect(onWaveCleared(s, 3, 1)).toBe(750);
    onPlayerDamaged(s);
    expect(onWaveCleared(s, 4, 1)).toBe(0);
  });

  it('cada tipo da sus puntos con la dificultad aplicada', () => {
    const w = createWorld({ seed: 1, arena: HANGAR_COBALTO, difficulty: 'hard' });
    const e = placeEnemy(w, EnemyKind.Vigia, 0, -2);
    damageEnemy(w, e, 9999);
    expect(w.score.points).toBe(Math.round(kindDef(w.tuning, EnemyKind.Vigia).score * 1.5));
  });
});

describe('objetos', () => {
  it('elige el tipo según los pesos', () => {
    const w = BALANCE.pickups.weights;
    expect(pickupTypeFromRoll(0, w)).toBe(PickupType.Health);
    expect(pickupTypeFromRoll(0.5, w)).toBe(PickupType.Shield);
    expect(pickupTypeFromRoll(0.99, w)).toBe(PickupType.Coolant);
  });

  it('recoger vida, escudo y enfriador', () => {
    const w = createWorld({ seed: 1, arena: HANGAR_COBALTO });
    w.player.health = 50;
    w.player.shield = 0;
    w.weapon.heat = 100;
    w.weapon.overheated = true;
    const { x, z } = w.player.pos;
    spawnPickup(w, PickupType.Health, x, z);
    spawnPickup(w, PickupType.Shield, x, z);
    spawnPickup(w, PickupType.Coolant, x, z);
    stepWorld(w, emptyCommand());
    expect(w.player.health).toBe(50 + BALANCE.pickups.healthAmount);
    expect(w.player.shield).toBeGreaterThanOrEqual(BALANCE.pickups.shieldAmount);
    expect(w.weapon.overheated).toBe(false);
    expect(w.pickups.activeCount).toBe(0);
  });

  it('caducan, respetan el máximo y nunca pasan la vida máxima', () => {
    const w = createWorld({ seed: 1, arena: HANGAR_COBALTO });
    w.director.disabled = true;
    for (let i = 0; i < 10; i++) spawnPickup(w, PickupType.Health, -12, -12);
    expect(w.pickups.activeCount).toBe(BALANCE.pickups.maxActive);
    stepN(w, 60 * (BALANCE.pickups.lifetime + 0.5));
    expect(w.pickups.activeCount).toBeLessThanOrEqual(1);
    spawnPickup(w, PickupType.Health, w.player.pos.x, w.player.pos.z);
    stepWorld(w, emptyCommand());
    expect(w.player.health).toBe(w.player.maxHealth);
  });
});

describe('peligros', () => {
  const h = FUNDICION_AMBAR.hazards[0];

  it('todos los peligros tienen ciclo lento y aviso previo suficiente', () => {
    for (const a of ARENAS) {
      for (const hz of a.hazards) {
        expect(hazardCycle(hz)).toBeGreaterThanOrEqual(BALANCE.hazards.minCycleSeconds);
        expect(hz.warnSeconds).toBeGreaterThanOrEqual(BALANCE.hazards.minWarnSeconds);
        expect(insideHazard(hz, a.playerSpawn.x, a.playerSpawn.z, -1)).toBe(false);
      }
    }
  });

  it('el aviso siempre precede a la activación', () => {
    if (!h) return;
    let prev = hazardPhaseAt(h, 0);
    for (let t = 0; t < 30; t += 1 / 60) {
      const ph = hazardPhaseAt(h, t);
      if (ph === HazardPhase.Active && prev !== HazardPhase.Active)
        expect(prev).toBe(HazardPhase.Warn);
      prev = ph;
    }
  });

  it('daña solo mientras está activo y el jugador está dentro', () => {
    if (!h) return;
    const w = createWorld({ seed: 1, arena: FUNDICION_AMBAR });
    w.director.disabled = true;
    w.player.pos.x = h.x;
    w.player.pos.z = h.z;
    let activations = 0;
    let sawWarnWithoutDamage = false;
    for (let i = 0; i < 60 * hazardCycle(h); i++) {
      const before = w.player.shield + w.player.health;
      w.player.prev.x = h.x;
      w.player.pos.x = h.x;
      w.player.pos.z = h.z;
      stepWorld(w, emptyCommand());
      const phase = hazardPhaseAt(h, w.time);
      const after = w.player.shield + w.player.health;
      if (phase !== HazardPhase.Active) {
        // El escudo puede regenerarse, pero nunca bajar fuera de la fase activa.
        expect(after).toBeGreaterThanOrEqual(before - 1e-9);
        if (phase === HazardPhase.Warn) sawWarnWithoutDamage = true;
      }
      w.events.drain((e) => {
        if (e.type === GameEvent.HazardActivate && e.a === 0) activations++;
      });
    }
    expect(sawWarnWithoutDamage).toBe(true);
    expect(activations).toBe(1);
    expect(w.player.health + w.player.shield).toBeLessThan(150);
  });
});

describe('prueba de rendimiento', () => {
  it('?stress crea 60 enemigos y mantiene unos 200 proyectiles sin dañar al jugador', () => {
    const w = createWorld({ seed: 1, arena: HANGAR_COBALTO, stress: true });
    expect(w.enemies.activeCount).toBe(STRESS_ENEMIES);
    stepN(w, 60);
    expect(w.projectiles.activeCount).toBeGreaterThanOrEqual(150);
    expect(w.player.health).toBe(w.player.maxHealth);
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
  });
});
