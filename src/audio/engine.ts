/**
 * Motor de audio: crea el AudioContext solo tras un gesto del jugador, convierte los eventos de la simulación
 * en sonidos (con tope de voces), coloca los sonidos de enemigos en el espacio con PannerNode
 * y programa la música generativa con un pequeño margen de antelación.
 * Si el navegador no tiene WebAudio, todo sigue funcionando en silencio.
 */
import { DirectorPhase } from '../game/director';
import { EnemyKind } from '../game/enemies/types';
import type { EventRecord } from '../game/events';
import type { World } from '../game/world';
import { Mixer } from './mixer';
import {
  createMusicStep,
  intensityTarget,
  midiToHz,
  MusicSequencer,
  smoothIntensity,
  stepSeconds,
} from './music';
import { createNoise, playBass, playHat, playKick, playPad, playPluck, playSound } from './sfx';
import { SOUND_SPECS, soundForEvent } from './sfx-map';
import { VoiceLimiter } from './voices';

/** Voces de efectos simultáneas como máximo. */
const MAX_VOICES = 12;
/** Antelación con la que se programan las notas de la música (s). */
const LOOKAHEAD = 0.12;

export interface AudioLevels {
  muted: boolean;
  volume: number;
  musicVolume: number;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private mixer: Mixer | null = null;
  private noise: AudioBuffer | null = null;
  private readonly voices = new VoiceLimiter(MAX_VOICES);
  private readonly seq = new MusicSequencer();
  private readonly step = createMusicStep();
  private readonly padFreqs = [0, 0, 0];
  private nextStep = 0;
  private intensity = 0.15;
  private levels: AudioLevels = { muted: false, volume: 0.6, musicVolume: 0.6 };

  /** Se llama desde un gesto del jugador (clic o tecla): crea o reanuda el contexto. */
  unlock(): void {
    if (this.ctx === null) {
      const Ctor = globalThis.AudioContext as typeof AudioContext | undefined;
      if (Ctor === undefined) return;
      try {
        this.ctx = new Ctor();
        this.mixer = new Mixer(this.ctx);
        this.noise = createNoise(this.ctx);
        this.mixer.setLevels(this.levels.volume, this.levels.musicVolume, this.levels.muted);
        this.nextStep = this.ctx.currentTime + 0.1;
      } catch {
        this.ctx = null;
        this.mixer = null;
        return;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
  }

  setLevels(levels: AudioLevels): void {
    this.levels = { ...levels };
    this.mixer?.setLevels(levels.volume, levels.musicVolume, levels.muted);
  }

  /** Pestaña oculta: se suspende el contexto (sin consumo); al volver se reanuda con el siguiente gesto o aquí. */
  setSuspended(suspended: boolean): void {
    const ctx = this.ctx;
    if (ctx === null) return;
    if (suspended && ctx.state === 'running') void ctx.suspend().catch(() => undefined);
    else if (!suspended && ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  }

  handle(e: EventRecord): void {
    const ctx = this.ctx;
    const mixer = this.mixer;
    const noise = this.noise;
    if (ctx === null || mixer === null || noise === null || this.levels.muted) return;
    const id = soundForEvent(e);
    if (id === null) return;
    const spec = SOUND_SPECS[id];
    const now = ctx.currentTime;
    if (!this.voices.tryStart(id, now, spec.duration, spec.limits)) return;
    let out: AudioNode = mixer.sfx;
    if (spec.positional) {
      // Sonido posicional ligero: el volumen y el lado dependen de dónde está la fuente respecto a Chispa.
      const panner = ctx.createPanner();
      panner.panningModel = 'equalpower';
      panner.distanceModel = 'inverse';
      panner.refDistance = 5;
      panner.maxDistance = 60;
      panner.rolloffFactor = 0.9;
      setPosition(panner, e.x, 1, e.z);
      panner.connect(mixer.sfx);
      out = panner;
      // Se desconecta solo cuando termina el sonido.
      setTimeout(() => panner.disconnect(), (spec.duration + 0.3) * 1000);
    }
    playSound(ctx, out, id, now + 0.005, spec.gain, noise);
  }

  /** Oyente en Chispa mirando hacia la cámara, intensidad de la música y programación de notas. */
  update(world: World, x: number, z: number, yaw: number, playing: boolean, dt: number): void {
    const ctx = this.ctx;
    const mixer = this.mixer;
    const noise = this.noise;
    if (ctx === null || mixer === null || noise === null) return;
    setListener(ctx.listener, x, z, yaw);

    let boss = false;
    for (const e of world.enemies.items) {
      if (e.active && e.kind === EnemyKind.Coloso) {
        boss = true;
        break;
      }
    }
    const fighting =
      playing &&
      (world.director.phase === DirectorPhase.Fighting ||
        world.director.phase === DirectorPhase.Spawning);
    const target = intensityTarget({
      fighting,
      alive: world.enemies.activeCount,
      cap: world.diff.maxAlive,
      boss: boss && playing,
    });
    this.intensity = smoothIntensity(this.intensity, playing ? target : 0.1, dt);

    // Con el sonido silenciado no se programan notas (no gasta CPU).
    if (this.levels.muted || this.levels.musicVolume <= 0) {
      this.nextStep = ctx.currentTime + 0.05;
      return;
    }
    const sp = stepSeconds();
    if (this.nextStep < ctx.currentTime) this.nextStep = ctx.currentTime + 0.02;
    while (this.nextStep < ctx.currentTime + LOOKAHEAD) {
      const s = this.seq.next(this.intensity, boss && playing, this.step);
      const t = this.nextStep;
      const out = mixer.music;
      if (s.pad !== null) {
        for (let i = 0; i < 3; i++) this.padFreqs[i] = midiToHz(s.pad[i] ?? 57);
        playPad(ctx, out, this.padFreqs, t, sp * 16);
      }
      if (s.arp !== null) playPluck(ctx, out, midiToHz(s.arp), t, 0.03 + 0.03 * this.intensity);
      if (s.bass !== null) playBass(ctx, out, midiToHz(s.bass), t, sp * 1.8);
      if (s.kick) playKick(ctx, out, t);
      if (s.hat) playHat(ctx, out, noise, t);
      this.nextStep += sp;
    }
  }
}

function setPosition(p: PannerNode, x: number, y: number, z: number): void {
  if (p.positionX !== undefined) {
    p.positionX.value = x;
    p.positionY.value = y;
    p.positionZ.value = z;
  } else {
    p.setPosition(x, y, z);
  }
}

function setListener(l: AudioListener, x: number, z: number, yaw: number): void {
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  if (l.positionX !== undefined) {
    l.positionX.value = x;
    l.positionY.value = 1;
    l.positionZ.value = z;
    l.forwardX.value = fx;
    l.forwardY.value = 0;
    l.forwardZ.value = fz;
    l.upX.value = 0;
    l.upY.value = 1;
    l.upZ.value = 0;
  } else {
    l.setPosition(x, 1, z);
    l.setOrientation(fx, 0, fz, 0, 1, 0);
  }
}
