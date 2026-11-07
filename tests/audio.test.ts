import { describe, expect, it } from 'vitest';
import { MIX } from '../src/audio/mixer';
import {
  createMusicStep,
  intensityTarget,
  midiToHz,
  MUSIC,
  MusicSequencer,
  smoothIntensity,
} from '../src/audio/music';
import { Sound, SOUND_SPECS, soundForEvent, type SoundId } from '../src/audio/sfx-map';
import { VoiceLimiter } from '../src/audio/voices';
import { EnemyKind } from '../src/game/enemies/types';
import { GameEvent, type EventRecord, type GameEventType } from '../src/game/events';

function ev(type: GameEventType, patch: Partial<EventRecord> = {}): EventRecord {
  return { type, x: 0, z: 0, a: 0, b: 0, c: 0, d: 0, ...patch };
}

describe('tope de voces', () => {
  it('limita las voces totales, las del mismo sonido y la repetición rápida', () => {
    const v = new VoiceLimiter(4);
    const loose = { maxPerSound: 10, minInterval: 0 };
    for (let i = 0; i < 4; i++) expect(v.tryStart(i, 0, 1, loose)).toBe(true);
    expect(v.tryStart(9, 0, 1, loose)).toBe(false);
    expect(v.active(0.5)).toBe(4);
    // Al terminar, las voces quedan libres.
    expect(v.tryStart(9, 1.01, 1, loose)).toBe(true);

    const w = new VoiceLimiter(8);
    const strict = { maxPerSound: 2, minInterval: 0.1 };
    expect(w.tryStart(1, 0, 1, strict)).toBe(true);
    expect(w.tryStart(1, 0.05, 1, strict)).toBe(false);
    expect(w.tryStart(1, 0.1, 1, strict)).toBe(true);
    expect(w.tryStart(1, 0.3, 1, strict)).toBe(false);
    expect(w.tryStart(2, 0.3, 1, strict)).toBe(true);
  });

  it('cien disparos en el mismo instante no suman más de unas pocas voces', () => {
    const v = new VoiceLimiter(12);
    const spec = SOUND_SPECS[Sound.ShotPulsador];
    let started = 0;
    for (let i = 0; i < 100; i++)
      if (v.tryStart(Sound.ShotPulsador, 0, spec.duration, spec.limits)) started++;
    expect(started).toBe(1);
  });
});

describe('sonidos de los eventos', () => {
  it('todos los sonidos tienen datos y un volumen moderado', () => {
    for (const id of Object.values(Sound) as SoundId[]) {
      const spec = SOUND_SPECS[id];
      expect(spec, String(id)).toBeDefined();
      expect(spec.gain).toBeGreaterThan(0);
      expect(spec.gain).toBeLessThanOrEqual(0.5);
      expect(spec.limits.maxPerSound).toBeGreaterThanOrEqual(1);
    }
    expect(MIX.masterMax).toBeLessThanOrEqual(0.5);
    expect(MIX.highpassHz).toBeGreaterThanOrEqual(70);
  });

  it('las señales importantes tienen sonido (y cada arma el suyo)', () => {
    expect(soundForEvent(ev(GameEvent.Shot, { b: 0 }))).toBe(Sound.ShotPulsador);
    expect(soundForEvent(ev(GameEvent.Shot, { b: 1 }))).toBe(Sound.ShotDispersor);
    expect(soundForEvent(ev(GameEvent.BeamPulse))).toBe(Sound.Beam);
    expect(soundForEvent(ev(GameEvent.Overheat))).toBe(Sound.Overheat);
    expect(soundForEvent(ev(GameEvent.WaveStart))).toBe(Sound.WaveStart);
    expect(soundForEvent(ev(GameEvent.PlayerHit))).toBe(Sound.PlayerHit);
    expect(soundForEvent(ev(GameEvent.TelegraphStart, { b: EnemyKind.Zumbador }))).toBe(
      Sound.Telegraph,
    );
    expect(soundForEvent(ev(GameEvent.TelegraphStart, { b: EnemyKind.Coloso }))).toBe(
      Sound.BossTelegraph,
    );
    expect(soundForEvent(ev(GameEvent.BossPhase))).toBe(Sound.BossPhase);
    expect(soundForEvent(ev(GameEvent.EnemyDestroyed))).toBe(Sound.Destroyed);
    expect(soundForEvent(ev(GameEvent.PlayerDodge))).toBe(Sound.Dodge);
    // Los eventos internos no suenan.
    expect(soundForEvent(ev(GameEvent.PerkOffer))).toBeNull();
    // Los enemigos suenan en su posición; el arma del jugador, no.
    expect(SOUND_SPECS[Sound.EnemyFire].positional).toBe(true);
    expect(SOUND_SPECS[Sound.ShotPulsador].positional).toBe(false);
  });
});

describe('música generativa', () => {
  function bar(seq: MusicSequencer, intensity: number, boss = false) {
    const step = createMusicStep();
    let bass = 0;
    let kick = 0;
    let hat = 0;
    let arp = 0;
    let pads = 0;
    const notes: number[] = [];
    for (let i = 0; i < MUSIC.stepsPerBar; i++) {
      seq.next(intensity, boss, step);
      if (step.bass !== null) {
        bass++;
        notes.push(step.bass);
      }
      if (step.arp !== null) {
        arp++;
        notes.push(step.arp);
      }
      if (step.pad !== null) {
        pads++;
        notes.push(...step.pad);
      }
      if (step.kick) kick++;
      if (step.hat) hat++;
    }
    return { bass, kick, hat, arp, pads, notes };
  }

  it('suma capas al subir la intensidad', () => {
    const calm = bar(new MusicSequencer(1), 0.1);
    const mid = bar(new MusicSequencer(1), 0.5);
    const high = bar(new MusicSequencer(1), 0.9);
    expect(calm.pads).toBe(1);
    expect(calm.bass + calm.kick + calm.hat).toBe(0);
    expect(mid.bass).toBeGreaterThan(0);
    expect(mid.kick).toBeGreaterThan(0);
    expect(high.hat).toBeGreaterThan(0);
    expect(high.kick).toBeGreaterThan(mid.kick);
    expect(high.arp).toBeGreaterThan(calm.arp);
  });

  it('todas las notas suenan por encima de ~70 Hz y la secuencia es reproducible', () => {
    const a = new MusicSequencer(7);
    const b = new MusicSequencer(7);
    for (let k = 0; k < 16; k++) {
      const ra = bar(a, (k % 4) / 3, k % 5 === 0);
      const rb = bar(b, (k % 4) / 3, k % 5 === 0);
      expect(ra.notes).toEqual(rb.notes);
      for (const n of ra.notes) expect(midiToHz(n)).toBeGreaterThanOrEqual(70);
    }
  });

  it('intensidad: calma < combate < jefe, y cambia sin saltos', () => {
    const rest = intensityTarget({ fighting: false, alive: 0, cap: 18, boss: false });
    const light = intensityTarget({ fighting: true, alive: 2, cap: 18, boss: false });
    const heavy = intensityTarget({ fighting: true, alive: 18, cap: 18, boss: false });
    const boss = intensityTarget({ fighting: true, alive: 3, cap: 18, boss: true });
    expect(rest).toBeLessThan(light);
    expect(light).toBeLessThan(heavy);
    expect(heavy).toBeLessThanOrEqual(boss);
    // Un paso de 1/60 s mueve poco, y el resultado casi no depende de los FPS.
    expect(smoothIntensity(0, 1, 1 / 60)).toBeLessThan(0.05);
    let x30 = 0;
    let x120 = 0;
    for (let i = 0; i < 30; i++) x30 = smoothIntensity(x30, 1, 1 / 30);
    for (let i = 0; i < 120; i++) x120 = smoothIntensity(x120, 1, 1 / 120);
    expect(x30).toBeCloseTo(x120, 6);
  });
});
