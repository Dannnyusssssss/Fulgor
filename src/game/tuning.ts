/**
 * Parámetros de combate de una partida. Son una copia de los datos de `src/data/` que el overlay de depuración
 * puede editar en vivo sin tocar los originales.
 */
import { BALANCE } from '../data/balance';
import {
  BLINDADO,
  CENTINELA,
  REPARADOR,
  VIGIA,
  ZUMBADOR,
  type BlindadoDef,
  type CentinelaDef,
  type ReparadorDef,
  type VigiaDef,
  type ZumbadorDef,
} from '../data/enemies';
import { PULSADOR, type WeaponDef } from '../data/weapons';

/** Convierte tipos literales y de solo lectura en tipos editables. */
type Widen<T> = T extends number
  ? number
  : T extends boolean
    ? boolean
    : T extends string
      ? string
      : { -readonly [K in keyof T]: Widen<T[K]> };

export type PlayerTuning = Widen<typeof BALANCE.player>;

export interface Tuning {
  player: PlayerTuning;
  weapon: WeaponDef;
  zumbador: ZumbadorDef;
  centinela: CentinelaDef;
  blindado: BlindadoDef;
  reparador: ReparadorDef;
  vigia: VigiaDef;
}

export function createTuning(): Tuning {
  // Copia profunda: los datos son objetos planos de números y textos.
  return JSON.parse(
    JSON.stringify({
      player: BALANCE.player,
      weapon: PULSADOR,
      zumbador: ZUMBADOR,
      centinela: CENTINELA,
      blindado: BLINDADO,
      reparador: REPARADOR,
      vigia: VIGIA,
    }),
  ) as Tuning;
}
