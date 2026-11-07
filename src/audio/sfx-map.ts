/**
 * Qué sonido corresponde a cada evento de la simulación (lógica pura, sin WebAudio).
 * Cada sonido tiene un volumen moderado, un tope de voces y una separación mínima entre repeticiones.
 * Los sonidos de enemigos y del entorno son posicionales; los del jugador y los avisos generales, no.
 */
import { GameEvent, type EventRecord } from '../game/events';
import { EnemyKind } from '../game/enemies/types';
import type { SoundLimits } from './voices';

export const Sound = {
  ShotPulsador: 1,
  ShotDispersor: 2,
  Beam: 3,
  Hit: 4,
  Blocked: 5,
  Destroyed: 6,
  Dodge: 7,
  Overheat: 8,
  Vent: 9,
  PlayerHit: 10,
  WaveStart: 11,
  WaveCleared: 12,
  EnemyFire: 13,
  Telegraph: 14,
  EnemyBeam: 15,
  Shockwave: 16,
  Pickup: 17,
  Onda: 18,
  BarrierUp: 19,
  BarrierEnd: 20,
  Decoy: 21,
  BossPhase: 22,
  ZoneWarn: 23,
  ZoneImpact: 24,
  BossTelegraph: 25,
  PerkChosen: 26,
  WeaponSwitch: 27,
  Victory: 28,
  Defeat: 29,
  WallHit: 30,
} as const;
export type SoundId = (typeof Sound)[keyof typeof Sound];

export interface SoundSpec {
  /** Volumen relativo (0–1), antes del volumen general. Ninguno pasa de 0,5. */
  gain: number;
  /** Duración aproximada (para el tope de voces). */
  duration: number;
  limits: SoundLimits;
  /** Posicional (se coloca en el punto del evento). */
  positional: boolean;
}

const L = (maxPerSound: number, minInterval: number): SoundLimits => ({ maxPerSound, minInterval });

export const SOUND_SPECS: Readonly<Record<SoundId, SoundSpec>> = {
  [Sound.ShotPulsador]: { gain: 0.18, duration: 0.12, limits: L(3, 0.05), positional: false },
  [Sound.ShotDispersor]: { gain: 0.26, duration: 0.25, limits: L(2, 0.1), positional: false },
  [Sound.Beam]: { gain: 0.12, duration: 0.12, limits: L(2, 0.09), positional: false },
  [Sound.Hit]: { gain: 0.14, duration: 0.1, limits: L(3, 0.05), positional: true },
  [Sound.Blocked]: { gain: 0.16, duration: 0.12, limits: L(2, 0.08), positional: true },
  [Sound.Destroyed]: { gain: 0.3, duration: 0.5, limits: L(3, 0.06), positional: true },
  [Sound.Dodge]: { gain: 0.2, duration: 0.25, limits: L(1, 0.1), positional: false },
  [Sound.Overheat]: { gain: 0.3, duration: 0.6, limits: L(1, 0.5), positional: false },
  [Sound.Vent]: { gain: 0.22, duration: 0.7, limits: L(1, 0.3), positional: false },
  [Sound.PlayerHit]: { gain: 0.28, duration: 0.25, limits: L(1, 0.15), positional: false },
  [Sound.WaveStart]: { gain: 0.3, duration: 0.9, limits: L(1, 0.5), positional: false },
  [Sound.WaveCleared]: { gain: 0.3, duration: 1.0, limits: L(1, 0.5), positional: false },
  [Sound.EnemyFire]: { gain: 0.18, duration: 0.25, limits: L(3, 0.08), positional: true },
  [Sound.Telegraph]: { gain: 0.16, duration: 0.35, limits: L(3, 0.1), positional: true },
  [Sound.EnemyBeam]: { gain: 0.24, duration: 0.35, limits: L(2, 0.1), positional: true },
  [Sound.Shockwave]: { gain: 0.26, duration: 0.45, limits: L(2, 0.1), positional: true },
  [Sound.Pickup]: { gain: 0.22, duration: 0.35, limits: L(2, 0.1), positional: false },
  [Sound.Onda]: { gain: 0.3, duration: 0.6, limits: L(1, 0.2), positional: false },
  [Sound.BarrierUp]: { gain: 0.24, duration: 0.6, limits: L(1, 0.2), positional: false },
  [Sound.BarrierEnd]: { gain: 0.18, duration: 0.4, limits: L(1, 0.2), positional: false },
  [Sound.Decoy]: { gain: 0.22, duration: 0.5, limits: L(1, 0.2), positional: true },
  [Sound.BossPhase]: { gain: 0.34, duration: 1.4, limits: L(1, 1), positional: true },
  [Sound.ZoneWarn]: { gain: 0.14, duration: 0.4, limits: L(2, 0.12), positional: true },
  [Sound.ZoneImpact]: { gain: 0.26, duration: 0.5, limits: L(2, 0.1), positional: true },
  [Sound.BossTelegraph]: { gain: 0.26, duration: 0.9, limits: L(1, 0.3), positional: true },
  [Sound.PerkChosen]: { gain: 0.26, duration: 0.6, limits: L(1, 0.3), positional: false },
  [Sound.WeaponSwitch]: { gain: 0.16, duration: 0.15, limits: L(1, 0.08), positional: false },
  [Sound.Victory]: { gain: 0.34, duration: 2, limits: L(1, 2), positional: false },
  [Sound.Defeat]: { gain: 0.3, duration: 1.6, limits: L(1, 2), positional: false },
  [Sound.WallHit]: { gain: 0.08, duration: 0.08, limits: L(2, 0.06), positional: true },
};

/** Sonido de un evento, o null si no suena. `shotWeapon`: ranura del arma en los disparos. */
export function soundForEvent(e: EventRecord): SoundId | null {
  switch (e.type) {
    case GameEvent.Shot:
      return e.b === 1 ? Sound.ShotDispersor : Sound.ShotPulsador;
    case GameEvent.BeamPulse:
      return Sound.Beam;
    case GameEvent.ProjectileHitEnemy:
      return Sound.Hit;
    case GameEvent.ProjectileHitWall:
      return Sound.WallHit;
    case GameEvent.ProjectileBlocked:
      return Sound.Blocked;
    case GameEvent.EnemyDestroyed:
      return Sound.Destroyed;
    case GameEvent.PlayerDodge:
      return Sound.Dodge;
    case GameEvent.Overheat:
      return Sound.Overheat;
    case GameEvent.Vent:
      return Sound.Vent;
    case GameEvent.PlayerHit:
      return Sound.PlayerHit;
    case GameEvent.WaveStart:
      return Sound.WaveStart;
    case GameEvent.WaveCleared:
      return Sound.WaveCleared;
    case GameEvent.EnemyFire:
      return Sound.EnemyFire;
    case GameEvent.TelegraphStart:
      return e.b === EnemyKind.Coloso ? Sound.BossTelegraph : Sound.Telegraph;
    case GameEvent.BeamFire:
      return Sound.EnemyBeam;
    case GameEvent.Shockwave:
      return Sound.Shockwave;
    case GameEvent.PickupCollected:
      return Sound.Pickup;
    case GameEvent.AbilityOnda:
      return Sound.Onda;
    case GameEvent.BarrierUp:
      return Sound.BarrierUp;
    case GameEvent.BarrierEnd:
      return Sound.BarrierEnd;
    case GameEvent.DecoyStart:
      return Sound.Decoy;
    case GameEvent.BossPhase:
      return Sound.BossPhase;
    case GameEvent.ZoneWarn:
      return Sound.ZoneWarn;
    case GameEvent.ZoneImpact:
      return Sound.ZoneImpact;
    case GameEvent.PerkChosen:
      return Sound.PerkChosen;
    case GameEvent.WeaponSwitch:
      return Sound.WeaponSwitch;
    case GameEvent.Victory:
      return Sound.Victory;
    case GameEvent.PlayerDefeated:
      return Sound.Defeat;
    default:
      return null;
  }
}
