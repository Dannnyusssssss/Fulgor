import { describe, expect, it } from 'vitest';
import { PULSADOR, type WeaponDef } from '../src/data/weapons';
import { createWeaponState, updateWeapon, WeaponFlag } from '../src/game/weapon';

const DT = 1 / 60;
const def: WeaponDef = { ...PULSADOR };

function hold(steps: number, fire: boolean, vent = false, w = createWeaponState()) {
  let shots = 0;
  let overheats = 0;
  for (let i = 0; i < steps; i++) {
    const f = updateWeapon(w, def, fire, vent, DT);
    if (f & WeaponFlag.Fired) shots++;
    if (f & WeaponFlag.Overheated) overheats++;
  }
  return { w, shots, overheats };
}

describe('calor del Pulsador', () => {
  it('dispara a la cadencia configurada sin depender del paso', () => {
    const { shots } = hold(60, true, false, { ...createWeaponState() });
    // 1 s a 0.16 s por disparo = 7 disparos (el primero sale enseguida).
    expect(shots).toBe(Math.floor(1 / def.fireInterval) + 1);
  });

  it('cada disparo sube el calor', () => {
    const w = createWeaponState();
    updateWeapon(w, def, true, false, DT);
    expect(w.heat).toBeCloseTo(def.heatPerShot);
  });

  it('al llegar al máximo se sobrecalienta y bloquea el disparo', () => {
    const { w, overheats } = hold(60 * 5, true);
    expect(overheats).toBeGreaterThanOrEqual(1);
    // Justo tras sobrecalentar no puede disparar.
    const w2 = createWeaponState();
    let steps = 0;
    while (!w2.overheated && steps < 10000) {
      updateWeapon(w2, def, true, false, DT);
      steps++;
    }
    expect(w2.overheated).toBe(true);
    expect(w2.heat).toBe(def.maxHeat);
    expect(updateWeapon(w2, def, true, false, DT) & WeaponFlag.Fired).toBe(0);
    expect(w.heat).toBeLessThanOrEqual(def.maxHeat);
  });

  it('el bloqueo termina tras el tiempo configurado', () => {
    const w = createWeaponState();
    while (!w.overheated) updateWeapon(w, def, true, false, DT);
    const lockSteps = Math.ceil(def.overheatLockSeconds / DT) + 1;
    for (let i = 0; i < lockSteps; i++) updateWeapon(w, def, false, false, DT);
    expect(w.overheated).toBe(false);
  });

  it('se enfría solo tras dejar de disparar', () => {
    const w = createWeaponState();
    hold(10, true, false, w);
    const hot = w.heat;
    hold(60, false, false, w);
    expect(w.heat).toBeLessThan(hot);
    hold(60 * 10, false, false, w);
    expect(w.heat).toBe(0);
  });

  it('ventilar enfría mucho más rápido, impide disparar mientras dura y tiene recarga', () => {
    const a = createWeaponState();
    const b = createWeaponState();
    hold(30, true, false, a);
    hold(30, true, false, b);
    const flags = updateWeapon(a, def, false, true, DT);
    expect(flags & WeaponFlag.VentStarted).toBeTruthy();
    expect(updateWeapon(a, def, true, false, DT) & WeaponFlag.Fired).toBe(0);
    hold(20, false, false, a);
    hold(21, false, false, b);
    expect(a.heat).toBeLessThan(b.heat);
    // En recarga: una segunda pulsación no ventila.
    hold(10, true, false, a);
    expect(updateWeapon(a, def, false, true, DT) & WeaponFlag.VentStarted).toBe(0);
  });

  it('ventilar sin calor no gasta la recarga', () => {
    const w = createWeaponState();
    expect(updateWeapon(w, def, false, true, DT) & WeaponFlag.VentStarted).toBe(0);
    expect(w.ventCooldown).toBe(0);
  });

  it('ventilar durante el sobrecalentamiento lo termina antes', () => {
    const w = createWeaponState();
    while (!w.overheated) updateWeapon(w, def, true, false, DT);
    updateWeapon(w, def, false, true, DT);
    const steps = Math.ceil(def.maxHeat / def.ventCoolRate / DT) + 2;
    for (let i = 0; i < steps; i++) updateWeapon(w, def, false, false, DT);
    expect(w.overheated).toBe(false);
    expect(steps * DT).toBeLessThan(def.overheatLockSeconds);
  });
});
