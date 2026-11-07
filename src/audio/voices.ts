/**
 * Tope de voces simultáneas (lógica pura). Decide si un sonido puede empezar:
 * - como mucho `maxVoices` sonando a la vez en total;
 * - como mucho `maxPerSound` del mismo sonido;
 * - el mismo sonido no se repite antes de `minInterval` segundos (evita la acumulación de volumen).
 * Así muchos disparos o impactos a la vez nunca suman un pico de volumen.
 */
export interface SoundLimits {
  maxPerSound: number;
  minInterval: number;
}

export class VoiceLimiter {
  /** Fin previsto de cada voz activa (búfer de tamaño fijo). */
  private readonly ends: Float64Array;
  private readonly ids: Int32Array;
  private readonly lastStart = new Map<number, number>();

  constructor(readonly maxVoices: number) {
    this.ends = new Float64Array(Math.max(1, maxVoices));
    this.ids = new Int32Array(Math.max(1, maxVoices)).fill(-1);
  }

  /** Voces que siguen sonando en `now`. */
  active(now: number): number {
    let n = 0;
    for (let i = 0; i < this.ends.length; i++)
      if (this.ids[i] !== -1 && (this.ends[i] ?? 0) > now) n++;
    return n;
  }

  /**
   * Intenta reservar una voz para el sonido `id` que dura `duration` segundos desde `now`.
   * Devuelve true si se puede reproducir.
   */
  tryStart(id: number, now: number, duration: number, limits: SoundLimits): boolean {
    const last = this.lastStart.get(id);
    if (last !== undefined && now - last < limits.minInterval) return false;
    let same = 0;
    let free = -1;
    for (let i = 0; i < this.ends.length; i++) {
      const alive = this.ids[i] !== -1 && (this.ends[i] ?? 0) > now;
      if (!alive) {
        if (free < 0) free = i;
        continue;
      }
      if (this.ids[i] === id) same++;
    }
    if (free < 0 || same >= limits.maxPerSound) return false;
    this.ids[free] = id;
    this.ends[free] = now + Math.max(0, duration);
    this.lastStart.set(id, now);
    return true;
  }

  reset(): void {
    this.ids.fill(-1);
    this.ends.fill(0);
    this.lastStart.clear();
  }
}
