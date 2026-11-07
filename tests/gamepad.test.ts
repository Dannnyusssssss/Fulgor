import { describe, expect, it } from 'vitest';
import {
  createPadState,
  curve,
  PAD,
  PadMapper,
  radialDeadzone,
  type PadSnapshot,
} from '../src/core/gamepad';
import { HANGAR_COBALTO } from '../src/data/arenas';
import { DIFFICULTIES } from '../src/data/difficulty';
import { aimAssistDelta } from '../src/game/aim-assist';
import { EnemyKind, EnemyState } from '../src/game/enemies/types';
import { createWorld, type World } from '../src/game/world';
import { parseSave, defaultSave, serializeSave } from '../src/save/schema';
import { placeEnemy } from './helpers';

function snap(axes: number[] = [0, 0, 0, 0], pressed: number[] = []): PadSnapshot {
  const buttons = new Array<number>(17).fill(0);
  for (const b of pressed) buttons[b] = 1;
  return { axes, buttons };
}

describe('mando: zona muerta y curva', () => {
  it('dentro de la zona muerta vale 0 y fuera escala sin salto hasta 1', () => {
    const out = { x: 0, y: 0 };
    radialDeadzone(0.1, 0.1, PAD.deadzone, out);
    expect(out).toEqual({ x: 0, y: 0 });
    radialDeadzone(PAD.deadzone + 1e-6, 0, PAD.deadzone, out);
    expect(out.x).toBeLessThan(1e-4);
    radialDeadzone(1, 0, PAD.deadzone, out);
    expect(out.x).toBeCloseTo(1);
    // Diagonal a tope: magnitud 1, no 1,41.
    radialDeadzone(1, 1, PAD.deadzone, out);
    expect(Math.hypot(out.x, out.y)).toBeCloseTo(1);
    // Valores no finitos se ignoran.
    radialDeadzone(Number.NaN, Number.POSITIVE_INFINITY, PAD.deadzone, out);
    expect(out).toEqual({ x: 0, y: 0 });
  });

  it('la curva conserva el signo y da más precisión cerca del centro', () => {
    expect(curve(0.5, 2)).toBeCloseTo(0.25);
    expect(curve(-0.5, 2)).toBeCloseTo(-0.25);
    expect(curve(1, 2)).toBe(1);
  });
});

describe('mando: mapeo de botones', () => {
  it('sticks: el izquierdo mueve (arriba = adelante) y el derecho gira', () => {
    const m = new PadMapper();
    const s = m.update(snap([0, -1, 1, 0]), createPadState());
    expect(s.connected).toBe(true);
    expect(s.moveZ).toBeCloseTo(1);
    expect(s.moveX).toBeCloseTo(0);
    expect(s.lookX).toBeCloseTo(1);
  });

  it('gatillos: disparar y apuntar mientras se mantienen', () => {
    const m = new PadMapper();
    const out = createPadState();
    const b = new Array<number>(17).fill(0);
    b[PAD.buttons.rt] = 0.2;
    expect(m.update({ axes: [0, 0, 0, 0], buttons: b }, out).fire).toBe(false);
    b[PAD.buttons.rt] = 0.8;
    b[PAD.buttons.lt] = 1;
    m.update({ axes: [0, 0, 0, 0], buttons: b }, out);
    expect(out.fire).toBe(true);
    expect(out.aim).toBe(true);
    m.update({ axes: [0, 0, 0, 0], buttons: b }, out);
    expect(out.fire).toBe(true);
  });

  it('esquivar, ventilar, habilidad, armas, hombro y pausa son pulsaciones (solo el primer frame)', () => {
    const m = new PadMapper();
    const out = createPadState();
    const B = PAD.buttons;
    m.update(snap(undefined, [B.a, B.x, B.y, B.left, B.rb, B.start]), out);
    expect([out.dodge, out.vent, out.ability, out.shoulder, out.pause]).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(out.weapon).toBe(1);
    m.update(snap(undefined, [B.a, B.x, B.y, B.left, B.rb, B.start]), out);
    expect([out.dodge, out.vent, out.ability, out.shoulder, out.pause, out.weapon]).toEqual([
      false,
      false,
      false,
      false,
      false,
      0,
    ]);
    m.update(snap(), out);
    m.update(snap(undefined, [B.up]), out);
    expect(out.weapon).toBe(2);
    m.update(snap(undefined, [B.right]), out);
    expect(out.weapon).toBe(3);
    m.update(snap(undefined, [B.b]), out);
    expect(out.dodge).toBe(true);
  });

  it('sin mando todo vuelve a cero', () => {
    const m = new PadMapper();
    const out = createPadState();
    m.update(snap([1, 1, 1, 1], [PAD.buttons.rt]), out);
    m.update(null, out);
    expect(out).toEqual(createPadState());
  });
});

describe('apuntado asistido', () => {
  function world(): World {
    const w = createWorld({ seed: 2, arena: HANGAR_COBALTO });
    w.director.disabled = true;
    return w;
  }
  const cone = DIFFICULTIES.normal.aimAssistCone;
  const rate = DIFFICULTIES.normal.aimAssistRate;

  it('acerca la puntería al enemigo dentro del cono, con giro limitado', () => {
    const w = world();
    // Jugador en (0, 4); enemigo delante y un poco a la derecha (≈4°).
    const e = placeEnemy(w, EnemyKind.Zumbador, 0.7, -6, EnemyState.Recover);
    const delta = aimAssistDelta(w, 0, cone, rate, 1 / 60);
    expect(delta).toBeLessThan(0); // girar a la derecha = yaw menor
    expect(Math.abs(delta)).toBeCloseTo(rate / 60);
    // Con un paso grande no se pasa del objetivo.
    const big = aimAssistDelta(w, 0, cone, rate, 10);
    const exact = Math.atan2(-(e.pos.x - 0), -(e.pos.z - 4));
    expect(big).toBeCloseTo(exact);
  });

  it('no ayuda fuera del cono, detrás de una cobertura ni con enemigos en el portal', () => {
    const w = world();
    placeEnemy(w, EnemyKind.Zumbador, 6, -2, EnemyState.Recover); // muy a la derecha
    expect(aimAssistDelta(w, 0, cone, rate, 1 / 60)).toBe(0);
    const w2 = world();
    w2.player.pos.x = 4.5; // columna en (4.5, 0) entre ambos
    placeEnemy(w2, EnemyKind.Zumbador, 4.6, -5, EnemyState.Recover);
    expect(aimAssistDelta(w2, 0, cone, rate, 1 / 60)).toBe(0);
    const w3 = world();
    placeEnemy(w3, EnemyKind.Zumbador, 0.5, -6, EnemyState.Materializing);
    expect(aimAssistDelta(w3, 0, cone, rate, 1 / 60)).toBe(0);
  });

  it('la dificultad cambia la ayuda: más en Fácil, menos en Difícil', () => {
    const e = DIFFICULTIES.easy;
    const h = DIFFICULTIES.hard;
    expect(e.aimAssistCone).toBeGreaterThan(h.aimAssistCone);
    expect(e.aimAssistRate).toBeGreaterThan(h.aimAssistRate);
  });
});

describe('ajustes de asistencias y volumen', () => {
  it('se guardan, se validan y los guardados antiguos quedan apagados', () => {
    const s = defaultSave(false);
    expect(s.settings.aimAssist).toBe(false);
    expect(s.settings.autoFire).toBe(false);
    s.settings.aimAssist = true;
    s.settings.autoFire = true;
    s.settings.volume = 0.3;
    s.settings.musicVolume = 0;
    expect(parseSave(serializeSave(s), false)).toEqual(s);
    const bad = parseSave(
      JSON.stringify({ settings: { aimAssist: 'sí', autoFire: 1, volume: 5, musicVolume: -1 } }),
      false,
    );
    expect(bad.settings.aimAssist).toBe(false);
    expect(bad.settings.autoFire).toBe(false);
    expect(bad.settings.volume).toBe(0.6);
    expect(bad.settings.musicVolume).toBe(0.6);
  });
});
