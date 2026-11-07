import { describe, expect, it } from 'vitest';
import { yawFromDir } from '../src/core/math';
import { ARENAS, HANGAR_COBALTO } from '../src/data/arenas';
import { BALANCE } from '../src/data/balance';
import { inFrontArc, updateBlindado } from '../src/game/enemies/blindado';
import { updateCentinela } from '../src/game/enemies/centinela';
import { EnemyFlag, telegraphDuration, type EnemyContext } from '../src/game/enemies/common';
import { pickHealTarget, updateReparador } from '../src/game/enemies/reparador';
import { EnemyKind, EnemyState, isDamageable, type Enemy } from '../src/game/enemies/types';
import { updateVigia } from '../src/game/enemies/vigia';
import { updateZumbador, windupDuration } from '../src/game/enemies/zumbador';
import { NavField } from '../src/game/nav';
import { arenaFor, makeContext, makeEnemy } from './helpers';

const DT = 1 / 60;
type Ai = (e: Enemy, ctx: EnemyContext, dt: number) => number;

function stepUntil(ai: Ai, e: Enemy, ctx: EnemyContext, pred: () => boolean, max = 600) {
  let flags = 0;
  for (let i = 0; i < max; i++) {
    flags |= ai(e, ctx, DT);
    if (pred()) return { steps: i + 1, flags };
  }
  return { steps: -1, flags };
}

/** Comprueba que, desde que empieza el aviso hasta el ataque, pasa al menos el mínimo global. */
function attackAfterTelegraph(ai: Ai, e: Enemy, ctx: EnemyContext, attackFlag: number) {
  const start = stepUntil(
    ai,
    e,
    ctx,
    () => e.state === EnemyState.Windup || e.state === EnemyState.Track,
  );
  expect(start.steps).toBeGreaterThan(0);
  expect(start.flags & EnemyFlag.TelegraphStarted).toBeTruthy();
  expect(start.flags & attackFlag).toBe(0);
  let steps = 0;
  let flags = 0;
  while (!(flags & attackFlag) && steps < 600) {
    flags |= ai(e, ctx, DT);
    steps++;
  }
  expect(flags & attackFlag).toBeTruthy();
  expect(steps * DT).toBeGreaterThanOrEqual(BALANCE.telegraph.minSeconds - 1e-9);
  return steps;
}

describe('aviso mínimo', () => {
  it('ninguna duración de aviso baja del mínimo global', () => {
    expect(telegraphDuration(0.01)).toBe(BALANCE.telegraph.minSeconds);
    expect(telegraphDuration(2)).toBe(2);
  });
});

describe('Zumbador', () => {
  it('se materializa sin moverse ni recibir daño y luego persigue', () => {
    const ctx = makeContext(HANGAR_COBALTO, 0, 4);
    const e = makeEnemy(ctx, EnemyKind.Zumbador, -15, -15, 0, EnemyState.Materializing);
    e.stateTimer = 0.5;
    expect(isDamageable(e)).toBe(false);
    updateZumbador(e, ctx, DT);
    expect(e.pos.x).toBe(-15);
    expect(
      stepUntil(updateZumbador, e, ctx, () => e.state === EnemyState.Chase).steps,
    ).toBeGreaterThan(0);
    expect(isDamageable(e)).toBe(true);
  });

  it('rodea las coberturas con el mapa de distancias', () => {
    const ctx = makeContext(HANGAR_COBALTO, 4.5, 2.2);
    const e = makeEnemy(ctx, EnemyKind.Zumbador, 4.5, -4);
    const r = stepUntil(updateZumbador, e, ctx, () => e.state === EnemyState.Windup, 600);
    expect(r.steps).toBeGreaterThan(0);
    expect(Math.hypot(e.pos.x - 4.5, e.pos.z)).toBeGreaterThanOrEqual(0.9 + e.radius - 1e-3);
  });

  it('avisa con la dirección fijada y golpea si el jugador sigue en la línea', () => {
    const ctx = makeContext(HANGAR_COBALTO, 0, 4);
    const e = makeEnemy(ctx, EnemyKind.Zumbador, 0, -1);
    stepUntil(updateZumbador, e, ctx, () => e.state === EnemyState.Windup);
    expect(e.stateDuration).toBe(windupDuration(ctx.tuning.zumbador));
    const dir = { ...e.dir };
    ctx.player.pos.x = 0.2;
    const r = stepUntil(updateZumbador, e, ctx, () => e.state === EnemyState.Recover);
    expect(e.dir).toEqual(dir);
    expect(r.flags & EnemyFlag.HitPlayer).toBeTruthy();
  });

  it('falla si el jugador se aparta durante el aviso', () => {
    const ctx = makeContext(HANGAR_COBALTO, 0, 4);
    const e = makeEnemy(ctx, EnemyKind.Zumbador, 0, -1);
    stepUntil(updateZumbador, e, ctx, () => e.state === EnemyState.Windup);
    ctx.player.pos.x = 3;
    const r = stepUntil(updateZumbador, e, ctx, () => e.state === EnemyState.Recover);
    expect(r.flags & EnemyFlag.HitPlayer).toBe(0);
  });

  it('no ataca a un jugador desactivado', () => {
    const ctx = makeContext(HANGAR_COBALTO, 0, 4);
    ctx.player.alive = false;
    const e = makeEnemy(ctx, EnemyKind.Zumbador, 0, -1);
    expect(stepUntil(updateZumbador, e, ctx, () => e.state === EnemyState.Windup, 120).steps).toBe(
      -1,
    );
  });
});

describe('Centinela', () => {
  it('avisa antes de disparar y el disparo sale en la dirección fijada', () => {
    const ctx = makeContext(HANGAR_COBALTO, 0, 4);
    const e = makeEnemy(ctx, EnemyKind.Centinela, 0, -6);
    attackAfterTelegraph(updateCentinela, e, ctx, EnemyFlag.Fire);
    expect(e.dir.z).toBeGreaterThan(0.9);
  });

  it('se aleja si el jugador está demasiado cerca', () => {
    const ctx = makeContext(HANGAR_COBALTO, 0, 4);
    const e = makeEnemy(ctx, EnemyKind.Centinela, 0, 1);
    e.attackCooldown = 100;
    for (let i = 0; i < 90; i++) updateCentinela(e, ctx, DT);
    expect(Math.hypot(e.pos.x, e.pos.z - 4)).toBeGreaterThan(4);
  });

  it('sin línea de visión no dispara', () => {
    // Columna (4.5, 0) entre ambos.
    const ctx = makeContext(HANGAR_COBALTO, 4.5, 2.5);
    const e = makeEnemy(ctx, EnemyKind.Centinela, 4.5, -2.5);
    e.attackCooldown = 0;
    const r = updateCentinela(e, ctx, DT);
    expect(r & EnemyFlag.TelegraphStarted).toBe(0);
  });

  it('tras disparar espera la recarga', () => {
    const ctx = makeContext(HANGAR_COBALTO, 0, 4);
    const e = makeEnemy(ctx, EnemyKind.Centinela, 0, -6);
    attackAfterTelegraph(updateCentinela, e, ctx, EnemyFlag.Fire);
    expect(e.attackCooldown).toBeGreaterThanOrEqual(ctx.tuning.centinela.cooldown);
  });
});

describe('Blindado', () => {
  it('el escudo cubre solo el frente', () => {
    const ctx = makeContext(HANGAR_COBALTO, 0, 4);
    const e = makeEnemy(ctx, EnemyKind.Blindado, 0, 0);
    e.yaw = 0; // mira hacia -z
    const half = ctx.tuning.blindado.shieldHalfAngle;
    expect(inFrontArc(e, 0, -2, half)).toBe(true);
    expect(inFrontArc(e, 0, 2, half)).toBe(false);
    expect(inFrontArc(e, 2, 0, half)).toBe(false);
    expect(inFrontArc(e, 1, -2, half)).toBe(true);
  });

  it('gira despacio: se le puede rodear', () => {
    const ctx = makeContext(HANGAR_COBALTO, 0, 6);
    const e = makeEnemy(ctx, EnemyKind.Blindado, 0, 3);
    e.yaw = 0; // de espaldas al jugador
    e.attackCooldown = 100;
    updateBlindado(e, ctx, DT);
    expect(Math.abs(e.yaw)).toBeLessThanOrEqual(ctx.tuning.blindado.turnRate * DT + 1e-9);
  });

  it('avisa con el semicírculo y la onda llega tras el aviso', () => {
    const ctx = makeContext(HANGAR_COBALTO, 0, 4);
    const e = makeEnemy(ctx, EnemyKind.Blindado, 0, 1.5);
    e.yaw = yawFromDir(0, 1);
    attackAfterTelegraph(updateBlindado, e, ctx, EnemyFlag.Shockwave);
  });

  it('durante el aviso no gira ni se mueve', () => {
    const ctx = makeContext(HANGAR_COBALTO, 0, 4);
    const e = makeEnemy(ctx, EnemyKind.Blindado, 0, 1.5);
    e.yaw = yawFromDir(0, 1);
    stepUntil(updateBlindado, e, ctx, () => e.state === EnemyState.Windup);
    const yaw = e.yaw;
    const x = e.pos.x;
    ctx.player.pos.x = 3;
    updateBlindado(e, ctx, DT);
    expect(e.yaw).toBe(yaw);
    expect(e.pos.x).toBe(x);
  });
});

describe('Reparador', () => {
  it('cura al aliado más dañado a su alcance, sin pasar de su vida máxima, y nunca a sí mismo', () => {
    const ctx = makeContext(HANGAR_COBALTO, 0, 12);
    const healer = makeEnemy(ctx, EnemyKind.Reparador, -2, -8, 0);
    const a = makeEnemy(ctx, EnemyKind.Zumbador, 0, -8, 1);
    const b = makeEnemy(ctx, EnemyKind.Centinela, 1, -8, 2);
    a.health = 25; // 83 %
    b.health = 10; // 25 %
    healer.health = 5;
    (ctx.enemies as Enemy[]).push(healer, a, b);
    expect(pickHealTarget(healer, ctx)).toBe(2);
    for (let i = 0; i < 600; i++) updateReparador(healer, ctx, DT);
    expect(b.health).toBe(b.maxHealth);
    expect(a.health).toBe(a.maxHealth);
    expect(healer.health).toBe(5);
  });

  it('no cura fuera de su alcance ni tras una cobertura', () => {
    const ctx = makeContext(HANGAR_COBALTO, 0, 12);
    const healer = makeEnemy(ctx, EnemyKind.Reparador, 4.5, -2.5, 0);
    const behind = makeEnemy(ctx, EnemyKind.Zumbador, 4.5, 2.5, 1); // columna en medio
    const far = makeEnemy(ctx, EnemyKind.Zumbador, -15, -15, 2);
    behind.health = 1;
    far.health = 1;
    (ctx.enemies as Enemy[]).push(healer, behind, far);
    expect(pickHealTarget(healer, ctx)).toBe(-1);
  });

  it('se aleja del jugador si no tiene a quién curar y nunca ataca', () => {
    const ctx = makeContext(HANGAR_COBALTO, 0, 4);
    const healer = makeEnemy(ctx, EnemyKind.Reparador, 0, 0);
    // Un aliado sano y lejos: no hay a quién curar, pero no está solo.
    const ally = makeEnemy(ctx, EnemyKind.Zumbador, -15, -15, 1);
    (ctx.enemies as Enemy[]).push(healer, ally);
    let flags = 0;
    for (let i = 0; i < 120; i++) flags |= updateReparador(healer, ctx, DT);
    expect(flags).toBe(0);
    expect(Math.hypot(healer.pos.x, healer.pos.z - 4)).toBeGreaterThan(6);
  });

  it('si se queda sin aliados deja de huir y se acerca al jugador', () => {
    const ctx = makeContext(HANGAR_COBALTO, 0, 4);
    const healer = makeEnemy(ctx, EnemyKind.Reparador, 0, -8);
    // Un enemigo inactivo (ranura libre del pool) no cuenta como aliado.
    const gone = makeEnemy(ctx, EnemyKind.Zumbador, -15, -15, 1);
    gone.active = false;
    (ctx.enemies as Enemy[]).push(healer, gone);
    const start = Math.hypot(healer.pos.x, healer.pos.z - 4);
    let flags = 0;
    for (let i = 0; i < 180; i++) flags |= updateReparador(healer, ctx, DT);
    expect(flags).toBe(0);
    expect(Math.hypot(healer.pos.x, healer.pos.z - 4)).toBeLessThan(start - 2);
  });
});

describe('Vigía', () => {
  it('sigue con la línea, la fija y dispara tras la pausa', () => {
    const ctx = makeContext(HANGAR_COBALTO, 0, 8);
    const e = makeEnemy(ctx, EnemyKind.Vigia, 0, -8);
    const steps = attackAfterTelegraph(updateVigia, e, ctx, EnemyFlag.Beam);
    const def = ctx.tuning.vigia;
    expect(steps * DT).toBeGreaterThanOrEqual(
      def.trackSeconds + telegraphDuration(def.lockSeconds) - 2 * DT,
    );
  });

  it('en la fase fijada la dirección no cambia aunque el jugador se mueva', () => {
    const ctx = makeContext(HANGAR_COBALTO, 0, 8);
    const e = makeEnemy(ctx, EnemyKind.Vigia, 0, -8);
    stepUntil(updateVigia, e, ctx, () => e.state === EnemyState.Windup);
    const dir = { ...e.dir };
    ctx.player.pos.x = 4;
    for (let i = 0; i < 10; i++) updateVigia(e, ctx, DT);
    expect(e.dir).toEqual(dir);
  });

  it('durante el seguimiento el giro está limitado', () => {
    const ctx = makeContext(HANGAR_COBALTO, 0, 8);
    const e = makeEnemy(ctx, EnemyKind.Vigia, 0, -8);
    stepUntil(updateVigia, e, ctx, () => e.state === EnemyState.Track);
    const yaw0 = e.yaw;
    ctx.player.pos.x = 15;
    updateVigia(e, ctx, DT);
    expect(Math.abs(e.yaw - yaw0)).toBeLessThanOrEqual(ctx.tuning.vigia.trackTurnRate * DT + 1e-9);
  });
});

describe('mapas de distancias en todas las arenas', () => {
  for (const def of ARENAS) {
    it(`${def.id}: apariciones y objetos alcanzables por cuerpos pequeños y grandes`, () => {
      const arena = arenaFor(def);
      const small = new NavField(arena, BALANCE.nav.cellSize, BALANCE.nav.smallRadius);
      const large = new NavField(arena, BALANCE.nav.cellSize, BALANCE.nav.largeRadius);
      small.recompute(def.playerSpawn.x, def.playerSpawn.z);
      large.recompute(def.playerSpawn.x, def.playerSpawn.z);
      for (const s of def.enemySpawns) {
        expect(small.distanceAt(s.x, s.z)).toBeGreaterThan(0);
        expect(large.distanceAt(s.x, s.z)).toBeGreaterThan(0);
      }
      for (const s of def.pickupPoints)
        expect(small.distanceAt(s.x, s.z)).toBeGreaterThanOrEqual(0);
    });
  }
});
