/**
 * Música generativa original (lógica pura): un secuenciador por pasos de semicorchea que, según la intensidad
 * de la partida, suma capas (pad, arpegio, bajo, pulso grave y platillo sintético).
 * Escala pentatónica menor sobre La, con una progresión fija de cuatro acordes. Todas las notas quedan por encima
 * de ~70 Hz para que se oigan en altavoces de portátil. La variación sale de un generador propio con semilla
 * (no del RNG de la partida), así la música nunca cambia lo que pasa en el juego.
 */
export const MUSIC = {
  bpm: 104,
  stepsPerBar: 16,
  /** Nota más grave permitida (MIDI 38 = Re2 ≈ 73 Hz). */
  minMidi: 38,
  /** Raíz del bajo: La2 (110 Hz). */
  bassRoot: 45,
  /** Pentatónica menor (semitonos desde la raíz). */
  scale: [0, 3, 5, 7, 10] as readonly number[],
  /** Progresión (desplazamiento de la raíz por compás): La, Fa, Sol, Mi. */
  progression: [0, -4, -2, -5] as readonly number[],
  /** Umbrales de intensidad de cada capa. */
  bassFrom: 0.25,
  kickFrom: 0.45,
  hatFrom: 0.6,
  /** Por encima de esto el pulso grave suena en cada tiempo. */
  driveFrom: 0.75,
} as const;

export interface MusicStep {
  /** Notas MIDI (null = silencio en esa capa). */
  bass: number | null;
  arp: number | null;
  /** Acorde del pad (solo al empezar el compás); tres notas o null. */
  pad: readonly [number, number, number] | null;
  kick: boolean;
  hat: boolean;
}

export function createMusicStep(): MusicStep {
  return { bass: null, arp: null, pad: null, kick: false, hat: false };
}

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Segundos que dura un paso (semicorchea). */
export function stepSeconds(): number {
  return 60 / MUSIC.bpm / 4;
}

/** Intensidad deseada según el estado de la partida (0 calma … 1 máximo). */
export function intensityTarget(s: {
  fighting: boolean;
  alive: number;
  cap: number;
  boss: boolean;
}): number {
  if (s.boss) return 0.92;
  if (!s.fighting) return 0.15;
  const load = s.cap > 0 ? Math.min(1, s.alive / s.cap) : 0;
  return 0.35 + 0.5 * load;
}

/** Acerca la intensidad a la deseada sin saltos (independiente de los FPS). */
export function smoothIntensity(current: number, target: number, dt: number): number {
  const k = 1 - Math.exp(-0.8 * Math.max(0, dt));
  return current + (target - current) * k;
}

export class MusicSequencer {
  private step = 0;
  private bar = 0;
  private seed: number;
  /** Posición del arpegio dentro de la escala (paseo aleatorio suave). */
  private arpIndex = 5;
  private readonly chord: [number, number, number] = [0, 0, 0];

  constructor(seed = 0x5eed) {
    this.seed = seed >>> 0 || 1;
  }

  private rand(): number {
    // xorshift32: variación musical propia.
    let x = this.seed;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.seed = x >>> 0;
    return this.seed / 4294967296;
  }

  /** Paso actual dentro del compás (0–15). */
  get position(): number {
    return this.step;
  }

  /** Calcula el siguiente paso en `out` y avanza. */
  next(intensity: number, boss: boolean, out: MusicStep): MusicStep {
    const i = Math.min(1, Math.max(0, intensity));
    const s = this.step;
    const shift = MUSIC.progression[this.bar % MUSIC.progression.length] ?? 0;
    const root = MUSIC.bassRoot + shift;

    // Pad: acorde abierto (raíz, quinta y décima menor) dos octavas por encima del bajo.
    if (s === 0) {
      this.chord[0] = root + 24;
      this.chord[1] = root + 31;
      this.chord[2] = root + 39;
      out.pad = this.chord;
    } else {
      out.pad = null;
    }

    // Arpegio: negras en calma, corcheas a media intensidad, semicorcheas a tope (y siempre con el jefe).
    const every = boss || i >= 0.8 ? 1 : i >= 0.4 ? 2 : 4;
    if (s % every === 0) {
      const r = this.rand();
      this.arpIndex += r < 0.35 ? -1 : r < 0.7 ? 1 : r < 0.85 ? 2 : -2;
      this.arpIndex = Math.max(0, Math.min(9, this.arpIndex));
      const octave = Math.floor(this.arpIndex / MUSIC.scale.length);
      const degree = MUSIC.scale[this.arpIndex % MUSIC.scale.length] ?? 0;
      out.arp = root + 24 + (boss ? 12 : 0) + octave * 12 + degree;
    } else {
      out.arp = null;
    }

    // Bajo sincopado; con el jefe, en cada tiempo.
    const bassSteps = boss ? s % 4 === 0 : s === 0 || s === 6 || s === 8 || s === 14;
    out.bass = i >= MUSIC.bassFrom && bassSteps ? Math.max(MUSIC.minMidi, root) : null;

    // Pulso grave y platillo.
    out.kick =
      i >= MUSIC.kickFrom &&
      (s === 0 || s === 8 || (i >= MUSIC.driveFrom && (s === 4 || s === 12)));
    out.hat = i >= MUSIC.hatFrom && s % 4 === 2;

    this.step = (s + 1) % MUSIC.stepsPerBar;
    if (this.step === 0) this.bar++;
    return out;
  }
}
