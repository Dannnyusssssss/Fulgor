/**
 * Arma de energía con calor: disparar calienta; al llegar al máximo se bloquea un tiempo.
 * Ventilar (R) enfría muy rápido durante un momento, con recarga; mientras ventila no dispara.
 */
import type { WeaponDef } from '../data/weapons';

export interface WeaponState {
  heat: number;
  overheated: boolean;
  lockTimer: number;
  /** Tiempo hasta el siguiente disparo permitido (puede quedar levemente negativo para mantener la cadencia exacta). */
  fireCooldown: number;
  sinceShot: number;
  ventTimer: number;
  ventCooldown: number;
}

export function createWeaponState(): WeaponState {
  return {
    heat: 0,
    overheated: false,
    lockTimer: 0,
    fireCooldown: 0,
    sinceShot: 999,
    ventTimer: 0,
    ventCooldown: 0,
  };
}

/** Resultado de un paso, como banderas de bits (sin crear objetos). */
export const WeaponFlag = {
  Fired: 1,
  Overheated: 2,
  VentStarted: 4,
} as const;

export function updateWeapon(
  w: WeaponState,
  def: WeaponDef,
  wantsFire: boolean,
  wantsVent: boolean,
  dt: number,
): number {
  let flags = 0;
  w.sinceShot += dt;
  w.fireCooldown -= dt;
  w.ventCooldown = Math.max(0, w.ventCooldown - dt);

  // Ventilado: solo si hay calor que quitar y no está en recarga.
  if (wantsVent && w.ventCooldown <= 0 && w.ventTimer <= 0 && w.heat > 0) {
    w.ventTimer = def.ventDuration;
    w.ventCooldown = def.ventCooldown;
    flags |= WeaponFlag.VentStarted;
  }

  // Enfriado: rápido al ventilar; normal tras un breve retardo desde el último disparo.
  if (w.ventTimer > 0) {
    w.heat -= def.ventCoolRate * dt;
    w.ventTimer = Math.max(0, w.ventTimer - dt);
  } else if (w.sinceShot >= def.coolDelay) {
    w.heat -= def.coolRate * dt;
  }
  if (w.heat < 0) w.heat = 0;

  // Bloqueo por sobrecalentamiento: termina al acabar el tiempo o si el calor llega a 0 (por ventilar).
  if (w.overheated) {
    w.lockTimer -= dt;
    if (w.lockTimer <= 0 || w.heat <= 0) {
      w.overheated = false;
      w.lockTimer = 0;
    }
  }

  if (wantsFire && !w.overheated && w.ventTimer <= 0 && w.fireCooldown <= 0) {
    flags |= WeaponFlag.Fired;
    w.heat += def.heatPerShot;
    w.sinceShot = 0;
    // Se suma el intervalo (no se reinicia) para que la cadencia no dependa del paso; el tope evita ráfagas acumuladas.
    w.fireCooldown = Math.max(w.fireCooldown, -dt) + def.fireInterval;
    if (w.heat >= def.maxHeat) {
      w.heat = def.maxHeat;
      w.overheated = true;
      w.lockTimer = def.overheatLockSeconds;
      flags |= WeaponFlag.Overheated;
    }
  }
  if (w.fireCooldown < 0 && !wantsFire) w.fireCooldown = 0;
  return flags;
}
