/**
 * Enemigos: todas son máquinas inventadas. Cada uno tiene un coste en puntos de presupuesto de oleada
 * y da puntos al desactivarlo. Todo ataque tiene un aviso que nunca dura menos que BALANCE.telegraph.minSeconds.
 */
export type EnemyKindName = 'zumbador' | 'centinela' | 'blindado' | 'reparador' | 'vigia';

export interface EnemyBaseDef {
  radius: number;
  health: number;
  /** Velocidad de desplazamiento. */
  speed: number;
  /** Coste en el presupuesto de la oleada. */
  cost: number;
  /** Puntos al desactivarlo. */
  score: number;
}

/** Dron rápido que embiste en línea recta tras un aviso con la dirección fijada. */
export interface ZumbadorDef extends EnemyBaseDef {
  id: 'zumbador';
  chargeRange: number;
  windupSeconds: number;
  dashSpeed: number;
  dashSeconds: number;
  dashDamage: number;
  recoverSeconds: number;
  recoverJitter: number;
  chargeCooldown: number;
}

/** Torreta móvil que mantiene la distancia y dispara esferas lentas y esquivables. */
export interface CentinelaDef extends EnemyBaseDef {
  id: 'centinela';
  minRange: number;
  maxRange: number;
  /** Velocidad al moverse de lado. */
  strafeSpeed: number;
  /** Cada cuánto puede cambiar de sentido al moverse de lado. */
  strafeSwitchSeconds: number;
  windupSeconds: number;
  projectileSpeed: number;
  projectileRadius: number;
  projectileDamage: number;
  projectileRange: number;
  cooldown: number;
  cooldownJitter: number;
}

/** Autómata lento con escudo frontal: solo se le daña de lado o por detrás. */
export interface BlindadoDef extends EnemyBaseDef {
  id: 'blindado';
  /** Velocidad de giro (rad/s): lenta para que se le pueda rodear. */
  turnRate: number;
  /** Mitad del ángulo que cubre el escudo frontal (rad). */
  shieldHalfAngle: number;
  /** Alcance y mitad del ángulo de la onda frontal (rad). */
  attackRange: number;
  attackHalfAngle: number;
  windupSeconds: number;
  attackDamage: number;
  recoverSeconds: number;
  cooldown: number;
}

/** Reparador: no ataca; cura a los demás. Es objetivo prioritario. */
export interface ReparadorDef extends EnemyBaseDef {
  id: 'reparador';
  /** Distancia que intenta guardar respecto al jugador. */
  keepAway: number;
  healRange: number;
  /** Vida por segundo que devuelve a su objetivo. */
  healRate: number;
  /** Distancia a la que se queda de su aliado. */
  allyDistance: number;
}

/** Vigía: apunta con una línea láser visible, la fija y dispara tras una pausa. */
export interface VigiaDef extends EnemyBaseDef {
  id: 'vigia';
  range: number;
  /** Fase de seguimiento: la línea sigue al jugador con giro limitado. */
  trackSeconds: number;
  trackTurnRate: number;
  /** Fase fijada: la línea ya no se mueve; al terminar, dispara. */
  lockSeconds: number;
  beamDamage: number;
  cooldown: number;
  cooldownJitter: number;
}

export const ZUMBADOR: ZumbadorDef = {
  id: 'zumbador',
  radius: 0.5,
  health: 30,
  speed: 4.2,
  cost: 1,
  score: 100,
  chargeRange: 6.5,
  windupSeconds: 0.55,
  dashSpeed: 16,
  dashSeconds: 0.4,
  dashDamage: 15,
  recoverSeconds: 0.7,
  recoverJitter: 0.35,
  chargeCooldown: 1.2,
};

export const CENTINELA: CentinelaDef = {
  id: 'centinela',
  radius: 0.55,
  health: 40,
  speed: 3,
  cost: 2,
  score: 200,
  minRange: 7,
  maxRange: 13,
  strafeSpeed: 2.2,
  strafeSwitchSeconds: 2.5,
  windupSeconds: 0.6,
  projectileSpeed: 9,
  projectileRadius: 0.25,
  projectileDamage: 12,
  projectileRange: 30,
  cooldown: 2.4,
  cooldownJitter: 0.8,
};

export const BLINDADO: BlindadoDef = {
  id: 'blindado',
  radius: 0.85,
  health: 110,
  speed: 2,
  cost: 4,
  score: 400,
  // Más lento que lo que gira el jugador al rodearlo a 5–6 m (6 m/s ÷ 5 m ≈ 1,2 rad/s): siempre se le puede flanquear.
  turnRate: 0.8,
  shieldHalfAngle: Math.PI / 3,
  attackRange: 3.4,
  attackHalfAngle: (70 * Math.PI) / 180,
  windupSeconds: 0.75,
  attackDamage: 20,
  recoverSeconds: 1,
  cooldown: 1.6,
};

export const REPARADOR: ReparadorDef = {
  id: 'reparador',
  radius: 0.5,
  health: 35,
  speed: 3.6,
  cost: 3,
  score: 300,
  keepAway: 10,
  healRange: 7,
  healRate: 10,
  allyDistance: 3.5,
};

export const VIGIA: VigiaDef = {
  id: 'vigia',
  radius: 0.55,
  health: 45,
  speed: 1.6,
  cost: 3,
  score: 300,
  range: 26,
  trackSeconds: 1,
  trackTurnRate: 1.6,
  lockSeconds: 0.55,
  beamDamage: 22,
  cooldown: 2.8,
  cooldownJitter: 0.8,
};
