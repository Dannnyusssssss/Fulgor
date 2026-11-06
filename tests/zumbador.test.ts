import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { HANGAR_COBALTO } from '../src/data/arenas';
import { BALANCE } from '../src/data/balance';
import { ZUMBADOR, type ZumbadorDef } from '../src/data/enemies';
import { createArena } from '../src/game/arena';
import { createEnemySlot, EnemyState, isDamageable, type Enemy } from '../src/game/enemies/types';
import {
  updateZumbador,
  windupDuration,
  ZumbadorFlag,
  type ZumbadorContext,
} from '../src/game/enemies/zumbador';
import { NavField } from '../src/game/nav';
import { createPlayer } from '../src/game/player';
import { createTuning } from '../src/game/tuning';

const DT = 1 / 60;
const arena = createArena(HANGAR_COBALTO);

function setup(ex: number, ez: number, px: number, pz: number, def: ZumbadorDef = { ...ZUMBADOR }) {
  const tune = createTuning();
  const player = createPlayer(px, pz, 0, tune.player);
  const nav = new NavField(arena, BALANCE.nav.cellSize, def.radius);
  nav.recompute(px, pz);
  const ctx: ZumbadorContext = { arena, nav, player, combat: new Rng(1), def };
  const e: Enemy = createEnemySlot(0);
  e.active = true;
  e.pos.x = ex;
  e.pos.z = ez;
  e.radius = def.radius;
  e.health = def.health;
  e.state = EnemyState.Chase;
  return { ctx, e, player };
}

function stepUntil(
  e: Enemy,
  ctx: ZumbadorContext,
  pred: () => boolean,
  max = 600,
): { steps: number; flags: number } {
  let flags = 0;
  for (let i = 0; i < max; i++) {
    flags |= updateZumbador(e, ctx, DT);
    if (pred()) return { steps: i + 1, flags };
  }
  return { steps: -1, flags };
}

describe('IA del Zumbador', () => {
  it('se materializa sin moverse ni recibir daño y luego persigue', () => {
    const { ctx, e } = setup(-15, -15, 0, 4);
    e.state = EnemyState.Materializing;
    e.stateTimer = 0.5;
    expect(isDamageable(e)).toBe(false);
    updateZumbador(e, ctx, DT);
    expect(e.pos.x).toBe(-15);
    const r = stepUntil(e, ctx, () => e.state === EnemyState.Chase);
    expect(r.steps).toBeGreaterThan(0);
    expect(isDamageable(e)).toBe(true);
  });

  it('persigue al jugador acercándose', () => {
    const { ctx, e, player } = setup(-15, -15, 0, 4);
    const d0 = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
    for (let i = 0; i < 60; i++) updateZumbador(e, ctx, DT);
    const d1 = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
    expect(d1).toBeLessThan(d0 - 2);
  });

  it('rodea las coberturas con el mapa de distancias y llega al jugador', () => {
    // El jugador está detrás de la columna (4.5, 0); el Zumbador al otro lado.
    const { ctx, e, player } = setup(4.5, -4, 4.5, 2.2);
    const r = stepUntil(e, ctx, () => e.state === EnemyState.Windup, 60 * 10);
    expect(r.steps).toBeGreaterThan(0);
    // Nunca dentro de la columna.
    expect(Math.hypot(e.pos.x - 4.5, e.pos.z)).toBeGreaterThanOrEqual(0.9 + e.radius - 1e-3);
    void player;
  });

  it('avisa antes de atacar: el aviso dura al menos el mínimo global y fija la dirección', () => {
    const { ctx, e } = setup(0, -1, 0, 4);
    const r = stepUntil(e, ctx, () => e.state === EnemyState.Windup);
    expect(r.flags & ZumbadorFlag.TelegraphStarted).toBeTruthy();
    expect(e.stateDuration).toBeGreaterThanOrEqual(BALANCE.telegraph.minSeconds);
    const dir = { x: e.dir.x, z: e.dir.z };
    // Aunque el jugador se mueva, la dirección no cambia y el enemigo no se mueve mientras avisa.
    ctx.player.pos.x = 5;
    const pos = { x: e.pos.x, z: e.pos.z };
    let windupSteps = 0;
    while (e.state === EnemyState.Windup) {
      const f = updateZumbador(e, ctx, DT);
      expect(f & ZumbadorFlag.HitPlayer).toBe(0);
      windupSteps++;
    }
    expect(windupSteps * DT).toBeGreaterThanOrEqual(BALANCE.telegraph.minSeconds - 1e-9);
    expect(e.dir).toEqual(dir);
    expect(e.pos.x).toBeCloseTo(pos.x);
    expect(e.state).toBe(EnemyState.Dash);
  });

  it('el aviso nunca es más corto que el mínimo aunque los datos digan otra cosa', () => {
    expect(windupDuration({ ...ZUMBADOR, windupSeconds: 0.05 })).toBe(BALANCE.telegraph.minSeconds);
  });

  it('la embestida golpea al jugador si sigue en la línea', () => {
    const { ctx, e } = setup(0, -1, 0, 4);
    const r = stepUntil(e, ctx, () => e.state === EnemyState.Recover);
    expect(r.flags & ZumbadorFlag.HitPlayer).toBeTruthy();
  });

  it('la embestida falla si el jugador se aparta durante el aviso', () => {
    const { ctx, e, player } = setup(0, -1, 0, 4);
    stepUntil(e, ctx, () => e.state === EnemyState.Windup);
    player.pos.x = 3;
    const r = stepUntil(e, ctx, () => e.state === EnemyState.Recover);
    expect(r.flags & ZumbadorFlag.HitPlayer).toBe(0);
  });

  it('la embestida se detiene contra una pared y pasa a recuperarse', () => {
    const { ctx, e } = setup(0, 15.5, 0, 17);
    stepUntil(e, ctx, () => e.state === EnemyState.Dash);
    const r = stepUntil(e, ctx, () => e.state === EnemyState.Recover);
    expect(r.steps).toBeGreaterThan(0);
    expect(e.pos.z).toBeLessThanOrEqual(18 - e.radius + 1e-6);
  });

  it('tras recuperarse espera antes de volver a embestir', () => {
    const { ctx, e } = setup(0, -1, 0, 4);
    stepUntil(e, ctx, () => e.state === EnemyState.Recover);
    stepUntil(e, ctx, () => e.state === EnemyState.Chase);
    expect(e.chargeCooldown).toBeGreaterThan(0);
    updateZumbador(e, ctx, DT);
    expect(e.state).toBe(EnemyState.Chase);
  });

  it('no ataca a un jugador desactivado', () => {
    const { ctx, e, player } = setup(0, -1, 0, 4);
    player.alive = false;
    const r = stepUntil(e, ctx, () => e.state === EnemyState.Windup, 120);
    expect(r.steps).toBe(-1);
  });
});

describe('mapa de distancias', () => {
  const nav = new NavField(arena, BALANCE.nav.cellSize, ZUMBADOR.radius);
  nav.recompute(HANGAR_COBALTO.playerSpawn.x, HANGAR_COBALTO.playerSpawn.z);

  it('todos los puntos de aparición son alcanzables desde el jugador', () => {
    for (const s of HANGAR_COBALTO.enemySpawns) expect(nav.distanceAt(s.x, s.z)).toBeGreaterThan(0);
  });

  it('la distancia crece al alejarse y la dirección apunta hacia el objetivo', () => {
    expect(nav.distanceAt(0, 4)).toBe(0);
    expect(nav.distanceAt(0, 10)).toBeGreaterThan(nav.distanceAt(0, 6));
    const out = { x: 0, z: 0 };
    expect(nav.direction(0, 10, out)).toBe(true);
    expect(out.z).toBeLessThan(0);
  });

  it('las celdas dentro de coberturas están bloqueadas', () => {
    const cell = nav.cellIndex(4.5, 0);
    expect(nav.blocked[cell]).toBe(1);
  });

  it('createTuning produce copias independientes', () => {
    const a = createTuning();
    const b = createTuning();
    a.zumbador.speed = 99;
    expect(b.zumbador.speed).toBe(ZUMBADOR.speed);
  });
});
