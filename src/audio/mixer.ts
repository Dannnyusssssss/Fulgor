/**
 * Mezcla de WebAudio: buses de efectos y de música → filtro paso alto (~70 Hz) → compresor → limitador
 * → volumen general → salida. El limitador corta cualquier pico: no hay sustos de volumen alto.
 * Los cambios de volumen y el silencio se hacen con rampas suaves (sin chasquidos).
 */
export const MIX = {
  /** Volumen general máximo (con el ajuste al 100 %): moderado. */
  masterMax: 0.5,
  /** Frecuencia del filtro paso alto: lo que está por debajo no se oye en portátiles y solo resta margen. */
  highpassHz: 70,
  /** Tiempo de las rampas de volumen (constante de tiempo, s). */
  ramp: 0.05,
} as const;

export class Mixer {
  readonly sfx: GainNode;
  readonly music: GainNode;
  private readonly master: GainNode;

  constructor(readonly ctx: AudioContext) {
    this.sfx = ctx.createGain();
    this.music = ctx.createGain();
    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = MIX.highpassHz;
    // Compresor suave para igualar la mezcla.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.005;
    comp.release.value = 0.2;
    // Limitador: compresor muy rápido y de razón alta justo por debajo de 0 dB.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -4;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.1;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.sfx.connect(highpass);
    this.music.connect(highpass);
    highpass.connect(comp);
    comp.connect(limiter);
    limiter.connect(this.master);
    this.master.connect(ctx.destination);
  }

  /** Volumen general (0–1) y silencio. */
  setLevels(volume: number, musicVolume: number, muted: boolean): void {
    const now = this.ctx.currentTime;
    const v = muted ? 0 : Math.min(1, Math.max(0, volume)) * MIX.masterMax;
    this.master.gain.setTargetAtTime(v, now, MIX.ramp);
    this.music.gain.setTargetAtTime(Math.min(1, Math.max(0, musicVolume)) * 0.6, now, MIX.ramp);
  }
}
