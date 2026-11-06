/**
 * Enemigos (máquinas inventadas).
 */
export interface ZumbadorDef {
  id: 'zumbador';
  radius: number;
  health: number;
  /** Velocidad de persecución. */
  speed: number;
  /** Distancia a la que empieza el aviso de embestida (si hay línea de visión). */
  chargeRange: number;
  /** Duración del aviso (nunca menor que BALANCE.telegraph.minSeconds). */
  windupSeconds: number;
  dashSpeed: number;
  dashSeconds: number;
  dashDamage: number;
  /** Pausa tras embestir, durante la que es vulnerable. */
  recoverSeconds: number;
  /** Variación aleatoria máxima añadida a la pausa (flujo de combate). */
  recoverJitter: number;
  /** Espera mínima entre dos embestidas. */
  chargeCooldown: number;
  /** Puntos al desactivarlo. */
  score: number;
}

export const ZUMBADOR: ZumbadorDef = {
  id: 'zumbador',
  radius: 0.5,
  health: 30,
  speed: 4.2,
  chargeRange: 6.5,
  windupSeconds: 0.55,
  dashSpeed: 16,
  dashSeconds: 0.4,
  dashDamage: 15,
  recoverSeconds: 0.7,
  recoverJitter: 0.35,
  chargeCooldown: 1.2,
  score: 100,
};
