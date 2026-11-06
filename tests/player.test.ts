import { describe, expect, it } from 'vitest';
import { emptyCommand, type PlayerCommand } from '../src/core/input';
import { HANGAR_COBALTO } from '../src/data/arenas';
import { BALANCE } from '../src/data/balance';
import { createArena } from '../src/game/arena';
import { computeBoom, type BoomInput } from '../src/game/camera-boom';
import { createPlayer, damagePlayer, updatePlayer } from '../src/game/player';
import { createTuning } from '../src/game/tuning';

const DT = 1 / 60;
const arena = createArena(HANGAR_COBALTO);

function cmd(partial: Partial<PlayerCommand>): PlayerCommand {
  return { ...emptyCommand(), ...partial };
}

function run(steps: number, c: PlayerCommand, tune = createTuning(), start = { x: 0, z: 4 }) {
  const p = createPlayer(start.x, start.z, c.yaw, tune.player);
  for (let i = 0; i < steps; i++) updatePlayer(p, arena, c, DT, tune.player);
  return p;
}

describe('movimiento del jugador', () => {
  it('avanza hacia donde mira la cámara a la velocidad configurada', () => {
    const p = run(60, cmd({ moveZ: 1, yaw: 0 }));
    // yaw 0 = hacia -z. En 1 s, casi 6 m (hay una pequeña aceleración inicial).
    expect(p.pos.z).toBeLessThan(4 - 5);
    expect(Math.abs(p.pos.x)).toBeLessThan(1e-6);
  });

  it('el movimiento es relativo al yaw', () => {
    const p = run(30, cmd({ moveZ: 1, yaw: Math.PI / 2 }));
    // yaw π/2 = mira hacia -x.
    expect(p.pos.x).toBeLessThan(-2);
  });

  it('la diagonal no es más rápida que la recta', () => {
    const straight = run(30, cmd({ moveZ: 1 }));
    const diag = run(30, cmd({ moveZ: 1, moveX: 1 }));
    const dStraight = Math.hypot(straight.pos.x, straight.pos.z - 4);
    const dDiag = Math.hypot(diag.pos.x, diag.pos.z - 4);
    expect(dDiag).toBeCloseTo(dStraight, 3);
  });

  it('apuntar con precisión reduce la velocidad', () => {
    const normal = run(30, cmd({ moveZ: 1 }));
    const aiming = run(30, cmd({ moveZ: 1, aim: true }));
    expect(Math.abs(aiming.pos.z - 4)).toBeLessThan(Math.abs(normal.pos.z - 4));
  });

  it('entradas no finitas no rompen el estado', () => {
    const p = run(10, cmd({ moveX: Number.NaN, moveZ: Infinity, yaw: Number.NaN }));
    expect(Number.isFinite(p.pos.x)).toBe(true);
    expect(Number.isFinite(p.pos.z)).toBe(true);
    expect(Number.isFinite(p.yaw)).toBe(true);
  });
});

describe('esquiva', () => {
  it('da invulnerabilidad breve, se desplaza rápido y tiene enfriamiento', () => {
    const tune = createTuning();
    const p = createPlayer(0, 4, 0, tune.player);
    const dodged = updatePlayer(p, arena, cmd({ dodge: true, moveX: 1 }), DT, tune.player);
    expect(dodged).toBe(true);
    expect(p.invulnTimer).toBeGreaterThan(0);
    expect(damagePlayer(p, 50, false)).toBe(0);
    expect(p.shield).toBe(tune.player.maxShield);
    // Va hacia la derecha (dirección pulsada) a la velocidad de esquiva.
    expect(p.vel.x).toBeCloseTo(tune.player.dodge.speed);
    // Una segunda esquiva enseguida no ocurre (enfriamiento).
    expect(updatePlayer(p, arena, cmd({ dodge: true }), DT, tune.player)).toBe(false);
    // Tras el enfriamiento vuelve a estar disponible.
    const steps = Math.ceil(tune.player.dodge.cooldown / DT) + 1;
    for (let i = 0; i < steps; i++) updatePlayer(p, arena, cmd({}), DT, tune.player);
    expect(p.invulnTimer).toBe(0);
    expect(updatePlayer(p, arena, cmd({ dodge: true }), DT, tune.player)).toBe(true);
  });

  it('sin dirección pulsada esquiva hacia delante', () => {
    const tune = createTuning();
    const p = createPlayer(0, 4, 0, tune.player);
    updatePlayer(p, arena, cmd({ dodge: true }), DT, tune.player);
    expect(p.dodgeDir.z).toBeCloseTo(-1);
  });

  it('la esquiva no atraviesa coberturas', () => {
    const tune = createTuning();
    // Columna en (4.5, 0): esquivar hacia ella desde (4.5, 2).
    const p = createPlayer(4.5, 2, 0, tune.player);
    updatePlayer(p, arena, cmd({ dodge: true }), DT, tune.player);
    for (let i = 0; i < 20; i++) updatePlayer(p, arena, cmd({}), DT, tune.player);
    expect(p.pos.z).toBeGreaterThan(0.9);
  });
});

describe('daño y escudo', () => {
  it('el escudo absorbe primero y luego baja la vida', () => {
    const tune = createTuning();
    const p = createPlayer(0, 4, 0, tune.player);
    damagePlayer(p, 30, false);
    expect(p.shield).toBe(20);
    expect(p.health).toBe(100);
    damagePlayer(p, 40, false);
    expect(p.shield).toBe(0);
    expect(p.health).toBe(80);
  });

  it('el escudo se regenera solo tras el retardo sin daño', () => {
    const tune = createTuning();
    const p = createPlayer(0, 4, 0, tune.player);
    damagePlayer(p, 50, false);
    for (let i = 0; i < 60 * 2; i++) updatePlayer(p, arena, cmd({}), DT, tune.player);
    expect(p.shield).toBe(0);
    for (let i = 0; i < 60 * 2; i++) updatePlayer(p, arena, cmd({}), DT, tune.player);
    expect(p.shield).toBeGreaterThan(0);
    for (let i = 0; i < 60 * 10; i++) updatePlayer(p, arena, cmd({}), DT, tune.player);
    expect(p.shield).toBe(tune.player.maxShield);
    // La vida no se regenera sola.
    expect(p.health).toBe(100);
  });

  it('la vida llega a 0 y el jugador queda desactivado; modo invulnerable y daño inválido no hacen nada', () => {
    const tune = createTuning();
    const p = createPlayer(0, 4, 0, tune.player);
    expect(damagePlayer(p, 100, true)).toBe(0);
    expect(damagePlayer(p, Number.NaN, false)).toBe(0);
    expect(damagePlayer(p, -5, false)).toBe(0);
    damagePlayer(p, 1000, false);
    expect(p.health).toBe(0);
    expect(p.alive).toBe(false);
    expect(damagePlayer(p, 10, false)).toBe(0);
  });
});

describe('brazo de la cámara', () => {
  const base = (): BoomInput => ({
    x: 0,
    z: 4,
    yaw: 0,
    pitch: -0.18,
    shoulder: BALANCE.camera.shoulderOffset,
    distance: BALANCE.camera.distance,
    pivotHeight: BALANCE.camera.pivotHeight,
    padding: BALANCE.camera.collisionPadding,
    minDistance: BALANCE.camera.minDistance,
  });
  const out = { pivotX: 0, pivotZ: 0, distance: 0 };

  it('sin obstáculos usa la distancia completa y el pivote va sobre el hombro', () => {
    const r = computeBoom(arena, base(), out);
    expect(r.distance).toBeCloseTo(BALANCE.camera.distance);
    expect(r.pivotX).toBeCloseTo(BALANCE.camera.shoulderOffset);
  });

  it('se acerca si hay una pared detrás', () => {
    // Pegado a la pared sur (z = 18) mirando hacia -z: la cámara quedaría fuera.
    const r = computeBoom(arena, { ...base(), z: 16.5 }, out);
    expect(r.distance).toBeLessThan(BALANCE.camera.distance);
    const camZ = r.pivotZ + Math.cos(0) * Math.cos(-0.18) * r.distance;
    expect(camZ).toBeLessThanOrEqual(18 - BALANCE.camera.collisionPadding + 1e-3);
  });

  it('se acerca si una columna alta queda detrás', () => {
    // Columna en (4.5, 0) de radio 0.9; el personaje delante de ella mirando hacia -z, cámara detrás (+z)…
    // así que colocamos al personaje al norte de la columna mirando al norte.
    const r = computeBoom(
      arena,
      { ...base(), x: 4.5 - BALANCE.camera.shoulderOffset, z: -1.6 },
      out,
    );
    expect(r.distance).toBeLessThan(BALANCE.camera.distance);
  });

  it('el hombro se recoge junto a una pared lateral', () => {
    // Pegado a la pared este (x = 18) con el hombro derecho hacia ella.
    const r = computeBoom(arena, { ...base(), x: 17.4, z: 4, shoulder: 1.5 }, out);
    expect(r.pivotX).toBeLessThanOrEqual(18 - BALANCE.camera.collisionPadding + 1e-3);
  });
});
