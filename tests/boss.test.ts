import { describe, expect, it } from 'vitest';
import { emptyCommand } from '../src/core/input';
import { Rng } from '../src/core/rng';
import { ARENAS, HANGAR_COBALTO } from '../src/data/arenas';
import { BALANCE } from '../src/data/balance';
import { DIFFICULTIES } from '../src/data/difficulty';
import { COLOSO, COLOSO_VARIANTS } from '../src/data/enemies';
import { WAVES } from '../src/data/waves';
import { ZoneState } from '../src/game/boss-zones';
import { isCircleFree } from '../src/game/collision';
import { composeWave, MAX_WAVE_SIZE } from '../src/game/director';
import {
  bossWarn,
  ColosoAttack,
  phaseFor,
  sweepCrosses,
  updateColoso,
} from '../src/game/enemies/coloso';
import { EnemyFlag } from '../src/game/enemies/common';
import { EnemyKind, EnemyState, isDamageable, type Enemy } from '../src/game/enemies/types';
import { GameEvent } from '../src/game/events';
import { NavField } from '../src/game/nav';
import { damageEnemy } from '../src/game/systems/damage';
import { spawnAtPortal } from '../src/game/systems/director-system';
import { createTuning } from '../src/game/tuning';
import { createWorld, stepWorld, type World } from '../src/game/world';
import { botCommand } from './bot';
import { makeContext, makeEnemy, placeEnemy } from './helpers';

function bossWorld(arena = HANGAR_COBALTO): { w: World; boss: Enemy } {
  const w = createWorld({ seed: 4, arena, perks: false });
  w.director.disabled = true;
  const boss = placeEnemy(w, EnemyKind.Coloso, 0, -6, EnemyState.Recover, 100);
  return { w, boss };
}

function stepN(w: World, n: number): number[] {
  const seen: number[] = [];
  for (let i = 0; i < n; i++) {
    stepWorld(w, emptyCommand());
    w.events.drain((e) => seen.push(e.type));
  }
  return seen;
}

describe('datos del Coloso', () => {
  it('la oleada 10 de cada arena es la del jefe y el Coloso aparece primero', () => {
    const tuning = createTuning();
    for (const arena of ARENAS) {
      const waves = WAVES[arena.id] ?? [];
      const last = waves[waves.length - 1];
      expect(waves).toHaveLength(BALANCE.director.wavesPerArena);
      expect(last?.boss, arena.id).toBe(true);
      expect(COLOSO_VARIANTS[arena.id], arena.id).toBeDefined();
      if (!last) continue;
      for (const seed of [1, 2, 3, 4]) {
        const out = new Uint8Array(MAX_WAVE_SIZE);
        const n = composeWave(last, 1, tuning, new Rng(seed), out);
        expect(out[0]).toBe(EnemyKind.Coloso);
        expect([...out.slice(0, n)].filter((k) => k === EnemyKind.Coloso)).toHaveLength(1);
      }
      // Ninguna otra oleada tiene jefe.
      expect(waves.slice(0, -1).some((w) => w.boss === true)).toBe(false);
    }
  });

  it('todos los avisos duran al menos el mínimo del jefe', () => {
    for (const s of [COLOSO.sweepWarnSeconds, COLOSO.volleyWarnSeconds, COLOSO.orbWarnSeconds]) {
      expect(bossWarn(s)).toBeGreaterThanOrEqual(BALANCE.boss.minWarnSeconds);
    }
    expect(bossWarn(0.1)).toBe(BALANCE.boss.minWarnSeconds);
  });

  it('cada punto de aparición del jefe está libre y es alcanzable desde el inicio', () => {
    for (const arena of ARENAS) {
      const w = createWorld({ seed: 1, arena });
      const nav = new NavField(w.arena, BALANCE.nav.cellSize, BALANCE.nav.largeRadius);
      nav.recompute(arena.playerSpawn.x, arena.playerSpawn.z);
      expect(arena.bossSpawns.length, arena.id).toBeGreaterThan(0);
      for (const sp of arena.bossSpawns) {
        expect(
          isCircleFree(w.arena, sp.x, sp.z, COLOSO.radius + 0.3),
          `${arena.id} ${sp.x},${sp.z}`,
        ).toBe(true);
        expect(Number.isFinite(nav.distanceAt(sp.x, sp.z)), `${arena.id} ${sp.x},${sp.z}`).toBe(
          true,
        );
      }
    }
  });

  it('la vida depende de la arena y de la dificultad', () => {
    const lives: number[] = [];
    for (const difficulty of ['easy', 'hard'] as const) {
      const w = createWorld({ seed: 1, arena: HANGAR_COBALTO, difficulty });
      spawnAtPortal(w, EnemyKind.Coloso);
      const b = w.enemies.items.find((e) => e.active && e.kind === EnemyKind.Coloso);
      lives.push(b?.maxHealth ?? 0);
    }
    expect(lives[0]).toBeCloseTo(COLOSO.health * DIFFICULTIES.easy.bossHealthMultiplier);
    expect(lives[1]).toBeCloseTo(COLOSO.health * DIFFICULTIES.hard.bossHealthMultiplier);
  });
});

describe('fases', () => {
  it('umbrales de vida', () => {
    expect(phaseFor(COLOSO, 1)).toBe(1);
    expect(phaseFor(COLOSO, 0.67)).toBe(1);
    expect(phaseFor(COLOSO, 0.66)).toBe(2);
    expect(phaseFor(COLOSO, 0.34)).toBe(2);
    expect(phaseFor(COLOSO, 0.33)).toBe(3);
  });

  it('al bajar de un umbral hace una pausa estable sin recibir daño y pasa de fase', () => {
    const { w, boss } = bossWorld();
    damageEnemy(w, boss, boss.maxHealth * 0.4);
    const seen = stepN(w, 1);
    expect(seen).toContain(GameEvent.BossPhase);
    expect(boss.phase).toBe(2);
    expect(boss.state).toBe(EnemyState.Shift);
    expect(isDamageable(boss)).toBe(false);
    const hp = boss.health;
    damageEnemy(w, boss, 100);
    expect(boss.health).toBe(hp);
    stepN(w, Math.ceil(COLOSO.phaseShiftSeconds * 60) + 1);
    expect(boss.state).not.toBe(EnemyState.Shift);
    damageEnemy(w, boss, boss.health - boss.maxHealth * 0.2);
    stepN(w, 1);
    expect(boss.phase).toBe(3);
  });

  it('si pierde mucha vida de golpe salta directamente a la fase que corresponde', () => {
    const { w, boss } = bossWorld();
    damageEnemy(w, boss, boss.maxHealth * 0.8);
    stepN(w, 1);
    expect(boss.phase).toBe(3);
  });
});

describe('ataques', () => {
  it('fase 1 solo usa barrido y ráfaga; la fase 2 añade orbes; la 3, la llamada', () => {
    const ctx = makeContext(HANGAR_COBALTO, 0, 4);
    const seen = new Set<number>();
    for (let i = 0; i < 60; i++) {
      const e = makeEnemy(ctx, EnemyKind.Coloso, 0, -4, 0, EnemyState.Chase);
      e.attack = i % 3;
      updateColoso(e, ctx, 1 / 60);
      seen.add(e.attack);
    }
    expect([...seen].sort()).toEqual([ColosoAttack.Sweep, ColosoAttack.Volley]);

    seen.clear();
    for (let i = 0; i < 80; i++) {
      const e = makeEnemy(ctx, EnemyKind.Coloso, 0, -4, 0, EnemyState.Chase);
      e.phase = 2;
      e.health = e.maxHealth * 0.5;
      updateColoso(e, ctx, 1 / 60);
      seen.add(e.attack);
    }
    expect(seen.has(ColosoAttack.Orbs)).toBe(true);
    expect(seen.has(ColosoAttack.Summon)).toBe(false);

    const e = makeEnemy(ctx, EnemyKind.Coloso, 0, -4, 0, EnemyState.Chase);
    e.phase = 3;
    e.health = e.maxHealth * 0.2;
    updateColoso(e, ctx, 1 / 60);
    expect(e.attack).toBe(ColosoAttack.Summon);
  });

  it('cada ataque empieza con un aviso de al menos el mínimo del jefe', () => {
    const ctx = makeContext(HANGAR_COBALTO, 0, 4);
    for (let i = 0; i < 40; i++) {
      const e = makeEnemy(ctx, EnemyKind.Coloso, 0, -4, 0, EnemyState.Chase);
      e.phase = 1 + (i % 3);
      e.health = e.maxHealth * (e.phase === 1 ? 1 : e.phase === 2 ? 0.5 : 0.2);
      const flags = updateColoso(e, ctx, 1 / 60);
      expect(flags & EnemyFlag.TelegraphStarted).toBeTruthy();
      expect(e.state).toBe(EnemyState.Windup);
      expect(e.stateDuration).toBeGreaterThanOrEqual(BALANCE.boss.minWarnSeconds);
    }
  });

  it('sin línea de visión usa los orbes en vez de quedarse atascado', () => {
    // Jugador detrás de la columna de (4.5, 0); el Coloso al otro lado.
    const ctx = makeContext(HANGAR_COBALTO, 4.5, 2);
    const e = makeEnemy(ctx, EnemyKind.Coloso, 4.5, -4, 0, EnemyState.Chase);
    const flags = updateColoso(e, ctx, 1 / 60);
    expect(e.attack).toBe(ColosoAttack.Orbs);
    expect(flags & EnemyFlag.Orbs).toBeTruthy();
  });

  it('el barrido daña una sola vez al pasar por el jugador; la cobertura y la esquiva lo evitan', () => {
    const sweepHits = (setup: (w: World) => void): number => {
      const { w, boss } = bossWorld();
      setup(w);
      boss.state = EnemyState.Chase;
      boss.stateTimer = 0;
      // Forzar un barrido: el primer ataque con el jugador a tiro puede ser barrido o ráfaga; se repite hasta barrer.
      let tries = 0;
      while (boss.attack !== ColosoAttack.Sweep && tries++ < 50) {
        boss.state = EnemyState.Chase;
        boss.attack = ColosoAttack.Volley;
        stepN(w, 1);
      }
      const shield = w.player.shield;
      const health = w.player.health;
      stepN(w, Math.ceil((COLOSO.sweepWarnSeconds + COLOSO.sweepSeconds) * 60) + 2);
      return shield + health - (w.player.shield + w.player.health);
    };
    expect(sweepHits(() => undefined)).toBeCloseTo(COLOSO.sweepDamage);
    expect(
      sweepHits((w) => {
        w.player.invulnTimer = 999;
      }),
    ).toBe(0);
  });

  it('sweepCrosses solo cuenta el tramo recorrido en el paso y dentro del alcance', () => {
    const ctx = makeContext(HANGAR_COBALTO, 0, 4);
    const e = makeEnemy(ctx, EnemyKind.Coloso, 0, 0, 0);
    // Jugador justo delante (yaw 0 → hacia -z).
    e.sweepPrev = -0.2;
    e.sweepAngle = 0.2;
    expect(sweepCrosses(e, COLOSO, 0, -6, 0.45)).toBe(true);
    e.sweepPrev = 0.3;
    e.sweepAngle = 0.6;
    expect(sweepCrosses(e, COLOSO, 0, -6, 0.45)).toBe(false);
    e.sweepPrev = -0.2;
    e.sweepAngle = 0.2;
    expect(sweepCrosses(e, COLOSO, 0, -(COLOSO.sweepRange + 2), 0.45)).toBe(false);
  });

  it('los orbes avisan, caen y solo dañan dentro; en la fase 3 dejan una zona activa', () => {
    const { w } = bossWorld();
    const zone = w.bossZones.acquire();
    if (!zone) throw new Error('sin zonas');
    Object.assign(zone, {
      x: w.player.pos.x,
      z: w.player.pos.z,
      radius: 1.8,
      state: ZoneState.Warn,
      timer: 1.2,
      warnDuration: 1.2,
      impactDamage: 18,
      lingerSeconds: 1,
      lingerDps: 10,
    });
    const far = w.bossZones.acquire();
    if (!far) throw new Error('sin zonas');
    Object.assign(far, { ...zone, x: 12, z: 12, lingerSeconds: 0 });
    stepN(w, 60);
    expect(w.player.shield).toBe(w.player.maxShield);
    const seen = stepN(w, 13);
    expect(seen.filter((t) => t === GameEvent.ZoneImpact)).toHaveLength(2);
    expect(w.player.shield).toBeCloseTo(w.player.maxShield - 18, 0);
    expect(zone.active && zone.state === ZoneState.Active).toBe(true);
    expect(far.active).toBe(false);
    stepN(w, 60);
    expect(w.player.shield).toBeLessThan(w.player.maxShield - 18 - 5);
    expect(zone.active).toBe(false);
  });

  it('la llamada de apoyo nunca supera el tope de enemigos de apoyo', () => {
    const { w, boss } = bossWorld();
    damageEnemy(w, boss, boss.maxHealth * 0.75);
    let maxSupport = 0;
    for (let i = 0; i < 60 * 60; i++) {
      stepWorld(w, emptyCommand());
      w.events.clear();
      let n = 0;
      for (const e of w.enemies.items) if (e.active && e.kind !== EnemyKind.Coloso) n++;
      maxSupport = Math.max(maxSupport, n);
    }
    expect(maxSupport).toBeGreaterThan(0);
    expect(maxSupport).toBeLessThanOrEqual(COLOSO.supportCap);
  });

  it('la Onda daña al jefe pero no lo empuja ni lo interrumpe', () => {
    const w = createWorld({ seed: 4, arena: HANGAR_COBALTO, perks: false, ability: 'onda' });
    w.director.disabled = true;
    const boss = placeEnemy(w, EnemyKind.Coloso, 0, 1, EnemyState.Windup, 1);
    boss.attack = ColosoAttack.Volley;
    stepWorld(w, { ...emptyCommand(), ability: true });
    expect(boss.state).toBe(EnemyState.Windup);
    expect(boss.health).toBeLessThan(boss.maxHealth);
    expect(boss.pushTimer).toBe(0);
  });
});

describe('el jefe es derrotable', () => {
  for (const arena of ARENAS) {
    it(`${arena.id}: el jugador automático gana la oleada del jefe`, { timeout: 60000 }, () => {
      const w = createWorld({ seed: 31, arena, startWave: 10 });
      const cmd = emptyCommand();
      for (let i = 0; i < 60 * 300 && !w.victory && !w.defeated; i++) {
        stepWorld(w, botCommand(w, cmd));
        w.events.clear();
      }
      expect(w.defeated).toBe(false);
      expect(w.victory).toBe(true);
    });
  }
});
