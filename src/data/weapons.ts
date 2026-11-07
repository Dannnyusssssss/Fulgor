/**
 * Armas de energía (inventadas). No usan munición: usan calor. Cada arma tiene su propio calor;
 * la que está guardada se enfría a su ritmo normal.
 *
 * Tres formas de disparo:
 * - `projectile`: un proyectil preciso (Pulsador).
 * - `spread`: abanico fijo de perdigones cortos, sin aleatoriedad, con menos daño a distancia (Dispersor).
 * - `beam`: haz continuo instantáneo; cada "disparo" es un pulso del haz de daño y calor pequeños (Rayo).
 */
export type WeaponId = 'pulsador' | 'dispersor' | 'rayo';
export type FireMode = 'projectile' | 'spread' | 'beam';

export interface WeaponDef {
  id: WeaponId;
  mode: FireMode;
  /** Daño por proyectil, perdigón o pulso del haz. */
  damage: number;
  /** Segundos entre disparos (o entre pulsos del haz). */
  fireInterval: number;
  projectileSpeed: number;
  projectileRadius: number;
  /** Alcance en metros (el proyectil se apaga al recorrerlo; el haz llega hasta aquí). */
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
  /** Perdigones por disparo (1 si no es abanico). */
  pellets: number;
  /** Ángulo total del abanico, en radianes (0 si no es abanico). */
  spreadAngle: number;
  /** El daño empieza a bajar a partir de esta distancia… */
  falloffStart: number;
  /** …hasta esta fracción del daño al final del alcance (1 = sin caída). */
  falloffMin: number;
}

export const PULSADOR: WeaponDef = {
  id: 'pulsador',
  mode: 'projectile',
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
  pellets: 1,
  spreadAngle: 0,
  falloffStart: 45,
  falloffMin: 1,
};

/** Abanico corto: 7 perdigones en 30°, mucho daño de cerca y poco a 12 m. */
export const DISPERSOR: WeaponDef = {
  id: 'dispersor',
  mode: 'spread',
  damage: 7,
  fireInterval: 0.62,
  projectileSpeed: 34,
  projectileRadius: 0.1,
  range: 12,
  heatPerShot: 20,
  maxHeat: 100,
  coolRate: 32,
  coolDelay: 0.35,
  overheatLockSeconds: 1.6,
  ventCoolRate: 140,
  ventDuration: 0.8,
  ventCooldown: 5,
  pellets: 7,
  spreadAngle: (30 * Math.PI) / 180,
  falloffStart: 4,
  falloffMin: 0.35,
};

/** Haz continuo: 20 pulsos por segundo, calienta rápido (≈1,6 s de disparo seguido desde frío). */
export const RAYO: WeaponDef = {
  id: 'rayo',
  mode: 'beam',
  damage: 2.4,
  fireInterval: 0.05,
  projectileSpeed: 0,
  projectileRadius: 0.08,
  range: 18,
  heatPerShot: 3.2,
  maxHeat: 100,
  coolRate: 34,
  coolDelay: 0.3,
  overheatLockSeconds: 1.8,
  ventCoolRate: 140,
  ventDuration: 0.8,
  ventCooldown: 5,
  pellets: 1,
  spreadAngle: 0,
  falloffStart: 18,
  falloffMin: 1,
};

/** Orden de las ranuras (teclas 1, 2 y 3). */
export const WEAPON_ORDER: readonly WeaponId[] = ['pulsador', 'dispersor', 'rayo'];

/**
 * Desbloqueo por progreso (en cualquier dificultad). `reachWave`: llegar a esa oleada de la arena;
 * `completeArena`: completarla. El Pulsador está disponible desde el principio.
 */
export type WeaponUnlock =
  | { kind: 'start' }
  | { kind: 'reachWave'; arena: string; wave: number }
  | { kind: 'completeArena'; arena: string };

export const WEAPON_UNLOCKS: Readonly<Record<WeaponId, WeaponUnlock>> = {
  pulsador: { kind: 'start' },
  dispersor: { kind: 'reachWave', arena: 'hangar-cobalto', wave: 5 },
  rayo: { kind: 'completeArena', arena: 'hangar-cobalto' },
};

export function isWeaponId(v: unknown): v is WeaponId {
  return v === 'pulsador' || v === 'dispersor' || v === 'rayo';
}
