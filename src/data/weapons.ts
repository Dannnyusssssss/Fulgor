/**
 * Armas de energía (inventadas). No usan munición: usan calor.
 */
export interface WeaponDef {
  id: string;
  name: string;
  damage: number;
  /** Segundos entre disparos. */
  fireInterval: number;
  projectileSpeed: number;
  projectileRadius: number;
  /** Alcance en metros (el proyectil se apaga al recorrerlo). */
  range: number;
  heatPerShot: number;
  maxHeat: number;
  /** Calor que se disipa por segundo cuando no se dispara. */
  coolRate: number;
  /** Segundos tras el último disparo antes de empezar a enfriar. */
  coolDelay: number;
  /** Bloqueo al sobrecalentarse. */
  overheatLockSeconds: number;
  /** Ventilado (R): enfriado rápido durante un tiempo, con recarga. */
  ventCoolRate: number;
  ventDuration: number;
  ventCooldown: number;
}

export const PULSADOR: WeaponDef = {
  id: 'pulsador',
  name: 'Pulsador',
  damage: 10,
  fireInterval: 0.16,
  projectileSpeed: 42,
  projectileRadius: 0.12,
  range: 45,
  heatPerShot: 7,
  maxHeat: 100,
  coolRate: 30,
  coolDelay: 0.25,
  overheatLockSeconds: 1.6,
  ventCoolRate: 140,
  ventDuration: 0.8,
  ventCooldown: 5,
};
