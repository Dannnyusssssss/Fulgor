/**
 * Mejoras por partida (perks). Entre oleadas se elige 1 de 3. Cada mejora tiene niveles que se acumulan,
 * y sus efectos suman a los modificadores de la partida; los topes de PERK_CAPS impiden romper el equilibrio.
 * Los nombres y descripciones visibles están en texts.ts.
 */
import type { AbilityId } from './abilities';
import type { WeaponId } from './weapons';

/** Valores que una mejora puede cambiar (coinciden con los modificadores de la partida). */
export type PerkStat =
  | 'damageMul'
  | 'fireRateMul'
  | 'heatMul'
  | 'coolRateMul'
  | 'ventCooldownMul'
  | 'overheatLockMul'
  | 'projectileSpeedMul'
  | 'rangeMul'
  | 'extraPellets'
  | 'beamRangeAdd'
  | 'maxShieldAdd'
  | 'maxHealthAdd'
  | 'shieldRegenDelayMul'
  | 'shieldRegenRateMul'
  | 'damageTakenMul'
  | 'moveSpeedMul'
  | 'dodgeCooldownMul'
  | 'dodgeInvulnAdd'
  | 'healOnKill'
  | 'pickupRadiusAdd'
  | 'pickupAmountMul'
  | 'abilityCooldownMul'
  | 'abilityPowerMul'
  | 'dodgeHeatVent';

export interface PerkEffect {
  stat: PerkStat;
  /** Lo que suma cada nivel (negativo para reducir). */
  perLevel: number;
}

export interface PerkDef {
  id: string;
  maxLevel: number;
  effects: readonly PerkEffect[];
  /** Mejoras incompatibles: si se tiene una, la otra no se ofrece. */
  excludes?: readonly string[];
  /** Solo se ofrece si esa arma está desbloqueada. */
  requiresWeapon?: WeaponId;
  /** Solo se ofrece con esa habilidad. */
  requiresAbility?: AbilityId;
}

export const PERKS: readonly PerkDef[] = [
  { id: 'nucleo-afilado', maxLevel: 3, effects: [{ stat: 'damageMul', perLevel: 0.12 }] },
  { id: 'gatillo-agil', maxLevel: 3, effects: [{ stat: 'fireRateMul', perLevel: 0.1 }] },
  { id: 'disipador', maxLevel: 3, effects: [{ stat: 'coolRateMul', perLevel: 0.2 }] },
  { id: 'condensador-frio', maxLevel: 3, effects: [{ stat: 'heatMul', perLevel: -0.1 }] },
  { id: 'purga-rapida', maxLevel: 2, effects: [{ stat: 'ventCooldownMul', perLevel: -0.2 }] },
  { id: 'reinicio-expres', maxLevel: 2, effects: [{ stat: 'overheatLockMul', perLevel: -0.25 }] },
  { id: 'escudo-ampliado', maxLevel: 3, effects: [{ stat: 'maxShieldAdd', perLevel: 15 }] },
  {
    id: 'regeneracion-temprana',
    maxLevel: 2,
    effects: [{ stat: 'shieldRegenDelayMul', perLevel: -0.2 }],
  },
  { id: 'recarga-escudo', maxLevel: 2, effects: [{ stat: 'shieldRegenRateMul', perLevel: 0.3 }] },
  { id: 'chasis-reforzado', maxLevel: 3, effects: [{ stat: 'maxHealthAdd', perLevel: 15 }] },
  {
    id: 'placas',
    maxLevel: 3,
    effects: [{ stat: 'damageTakenMul', perLevel: -0.08 }],
    excludes: ['canon-cristal'],
  },
  {
    id: 'canon-cristal',
    maxLevel: 1,
    effects: [
      { stat: 'damageMul', perLevel: 0.3 },
      { stat: 'damageTakenMul', perLevel: 0.15 },
    ],
    excludes: ['placas'],
  },
  { id: 'servos', maxLevel: 2, effects: [{ stat: 'moveSpeedMul', perLevel: 0.08 }] },
  { id: 'esquiva-ligera', maxLevel: 2, effects: [{ stat: 'dodgeCooldownMul', perLevel: -0.15 }] },
  { id: 'fase-extendida', maxLevel: 2, effects: [{ stat: 'dodgeInvulnAdd', perLevel: 0.06 }] },
  { id: 'reciclaje', maxLevel: 3, effects: [{ stat: 'healOnKill', perLevel: 2 }] },
  { id: 'iman', maxLevel: 2, effects: [{ stat: 'pickupRadiusAdd', perLevel: 1 }] },
  { id: 'botiquin', maxLevel: 2, effects: [{ stat: 'pickupAmountMul', perLevel: 0.25 }] },
  {
    id: 'habilidad-rapida',
    maxLevel: 2,
    effects: [{ stat: 'abilityCooldownMul', perLevel: -0.15 }],
  },
  { id: 'amplificador', maxLevel: 2, effects: [{ stat: 'abilityPowerMul', perLevel: 0.25 }] },
  {
    id: 'proyectil-veloz',
    maxLevel: 2,
    effects: [
      { stat: 'projectileSpeedMul', perLevel: 0.15 },
      { stat: 'rangeMul', perLevel: 0.1 },
    ],
  },
  {
    id: 'perdigones-extra',
    maxLevel: 1,
    effects: [{ stat: 'extraPellets', perLevel: 2 }],
    requiresWeapon: 'dispersor',
  },
  {
    id: 'rayo-concentrado',
    maxLevel: 2,
    effects: [{ stat: 'beamRangeAdd', perLevel: 3 }],
    requiresWeapon: 'rayo',
  },
  { id: 'esquiva-fria', maxLevel: 2, effects: [{ stat: 'dodgeHeatVent', perLevel: 15 }] },
];

/** Opciones por oferta. */
export const PERK_OFFER_SIZE = 3;

/** Topes de cada valor tras sumar todas las mejoras (ninguna combinación puede salirse de aquí). */
export const PERK_CAPS: Readonly<Record<PerkStat, { min: number; max: number }>> = {
  damageMul: { min: 1, max: 1.8 },
  fireRateMul: { min: 1, max: 1.3 },
  heatMul: { min: 0.7, max: 1 },
  coolRateMul: { min: 1, max: 1.6 },
  ventCooldownMul: { min: 0.6, max: 1 },
  overheatLockMul: { min: 0.5, max: 1 },
  projectileSpeedMul: { min: 1, max: 1.3 },
  rangeMul: { min: 1, max: 1.2 },
  extraPellets: { min: 0, max: 2 },
  beamRangeAdd: { min: 0, max: 6 },
  maxShieldAdd: { min: 0, max: 45 },
  maxHealthAdd: { min: 0, max: 45 },
  shieldRegenDelayMul: { min: 0.6, max: 1 },
  shieldRegenRateMul: { min: 1, max: 1.6 },
  damageTakenMul: { min: 0.76, max: 1.15 },
  moveSpeedMul: { min: 1, max: 1.16 },
  dodgeCooldownMul: { min: 0.7, max: 1 },
  dodgeInvulnAdd: { min: 0, max: 0.12 },
  healOnKill: { min: 0, max: 6 },
  pickupRadiusAdd: { min: 0, max: 2 },
  pickupAmountMul: { min: 1, max: 1.5 },
  abilityCooldownMul: { min: 0.7, max: 1 },
  abilityPowerMul: { min: 1, max: 1.5 },
  dodgeHeatVent: { min: 0, max: 30 },
};
