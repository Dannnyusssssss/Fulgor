/**
 * Habilidades (tecla Q). Se elige una por partida en la pantalla de selección; las tres están disponibles desde el inicio.
 * - Onda: empuja a los enemigos cercanos, los daña un poco e interrumpe sus avisos de ataque.
 * - Barrera: escudo temporal que absorbe daño antes que el escudo normal.
 * - Señuelo: holograma que atrae la atención de los enemigos durante unos segundos.
 */
export type AbilityId = 'onda' | 'barrera' | 'senuelo';

export const ABILITY_ORDER: readonly AbilityId[] = ['onda', 'barrera', 'senuelo'];

export interface OndaDef {
  cooldown: number;
  radius: number;
  /** Metros que se empuja a un enemigo pegado al jugador (menos cuanto más lejos). */
  pushDistance: number;
  /** Segundos que dura el empuje (se reparte en varios pasos para no atravesar paredes). */
  pushSeconds: number;
  damage: number;
}

export interface BarreraDef {
  cooldown: number;
  duration: number;
  /** Daño que absorbe antes de romperse. */
  absorb: number;
}

export interface SenueloDef {
  cooldown: number;
  duration: number;
  /** Distancia delante del jugador a la que aparece. */
  distance: number;
  radius: number;
}

export const ABILITIES = {
  onda: { cooldown: 9, radius: 6, pushDistance: 4.5, pushSeconds: 0.25, damage: 10 } as OndaDef,
  barrera: { cooldown: 14, duration: 4, absorb: 60 } as BarreraDef,
  senuelo: { cooldown: 16, duration: 5, distance: 3, radius: 0.45 } as SenueloDef,
};

export function isAbilityId(v: unknown): v is AbilityId {
  return v === 'onda' || v === 'barrera' || v === 'senuelo';
}

export function abilityCooldown(id: AbilityId): number {
  return ABILITIES[id].cooldown;
}
