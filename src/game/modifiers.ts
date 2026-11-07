/**
 * Modificadores de la partida (los producen las mejoras). Los sistemas leen los valores efectivos que salen
 * de combinar los datos base con estos modificadores; los datos base nunca se tocan.
 */
import type { WeaponDef } from '../data/weapons';
import type { PlayerTuning } from './tuning';

export interface Modifiers {
  /** Multiplica el daño de todas las armas. */
  damageMul: number;
  /** Multiplica la cadencia (divide el intervalo entre disparos). */
  fireRateMul: number;
  /** Multiplica el calor por disparo. */
  heatMul: number;
  coolRateMul: number;
  ventCooldownMul: number;
  overheatLockMul: number;
  projectileSpeedMul: number;
  rangeMul: number;
  /** Perdigones extra del Dispersor. */
  extraPellets: number;
  /** Metros extra de alcance del Rayo. */
  beamRangeAdd: number;
  maxShieldAdd: number;
  maxHealthAdd: number;
  shieldRegenDelayMul: number;
  shieldRegenRateMul: number;
  /** Multiplica el daño recibido (se suma a la dificultad). */
  damageTakenMul: number;
  moveSpeedMul: number;
  dodgeCooldownMul: number;
  dodgeInvulnAdd: number;
  /** Vida recuperada por cada máquina desactivada. */
  healOnKill: number;
  /** Metros extra de radio de recogida de objetos. */
  pickupRadiusAdd: number;
  /** Multiplica la vida y el escudo que dan los objetos. */
  pickupAmountMul: number;
  abilityCooldownMul: number;
  /** Multiplica la potencia de la habilidad (radio de la Onda, absorción de la Barrera, duración del Señuelo). */
  abilityPowerMul: number;
  /** Calor que se quita a todas las armas al esquivar. */
  dodgeHeatVent: number;
}

export function createModifiers(): Modifiers {
  return {
    damageMul: 1,
    fireRateMul: 1,
    heatMul: 1,
    coolRateMul: 1,
    ventCooldownMul: 1,
    overheatLockMul: 1,
    projectileSpeedMul: 1,
    rangeMul: 1,
    extraPellets: 0,
    beamRangeAdd: 0,
    maxShieldAdd: 0,
    maxHealthAdd: 0,
    shieldRegenDelayMul: 1,
    shieldRegenRateMul: 1,
    damageTakenMul: 1,
    moveSpeedMul: 1,
    dodgeCooldownMul: 1,
    dodgeInvulnAdd: 0,
    healOnKill: 0,
    pickupRadiusAdd: 0,
    pickupAmountMul: 1,
    abilityCooldownMul: 1,
    abilityPowerMul: 1,
    dodgeHeatVent: 0,
  };
}

export function resetModifiers(m: Modifiers): void {
  Object.assign(m, createModifiers());
}

/** Escribe en `out` el arma efectiva (datos base + modificadores). No crea objetos. */
export function effectiveWeapon(out: WeaponDef, base: WeaponDef, m: Modifiers): WeaponDef {
  Object.assign(out, base);
  out.damage = base.damage * m.damageMul;
  out.fireInterval = base.fireInterval / Math.max(0.1, m.fireRateMul);
  out.heatPerShot = base.heatPerShot * m.heatMul;
  out.coolRate = base.coolRate * m.coolRateMul;
  out.ventCooldown = base.ventCooldown * m.ventCooldownMul;
  out.overheatLockSeconds = base.overheatLockSeconds * m.overheatLockMul;
  out.projectileSpeed = base.projectileSpeed * m.projectileSpeedMul;
  if (base.mode === 'beam') {
    out.range = base.range + m.beamRangeAdd;
  } else {
    out.range = base.range * m.rangeMul;
    out.falloffStart = base.falloffStart * m.rangeMul;
  }
  if (base.mode === 'spread') out.pellets = base.pellets + m.extraPellets;
  return out;
}

/** Escribe en `out` los valores efectivos del jugador. */
export function effectivePlayer(out: PlayerTuning, base: PlayerTuning, m: Modifiers): PlayerTuning {
  // Se conserva el objeto `dodge` propio de `out` (no se comparte con los datos base ni se crea uno nuevo).
  const dodge = out.dodge;
  Object.assign(out, base);
  out.dodge = Object.assign(dodge, base.dodge);
  out.speed = base.speed * m.moveSpeedMul;
  out.maxHealth = base.maxHealth + m.maxHealthAdd;
  out.maxShield = base.maxShield + m.maxShieldAdd;
  out.shieldRegenDelay = base.shieldRegenDelay * m.shieldRegenDelayMul;
  out.shieldRegenRate = base.shieldRegenRate * m.shieldRegenRateMul;
  out.dodge.cooldown = base.dodge.cooldown * m.dodgeCooldownMul;
  out.dodge.invulnerability = base.dodge.invulnerability + m.dodgeInvulnAdd;
  return out;
}
