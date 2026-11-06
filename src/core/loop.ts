/**
 * Paso de tiempo fijo con acumulador.
 * La lógica avanza siempre en pasos de duración constante (60 Hz); el render usa `alpha`
 * para interpolar entre el estado anterior y el actual.
 */
export class FixedTimestep {
  private accumulator = 0;

  constructor(
    readonly stepSeconds: number,
    /** Tope de tiempo real por frame: evita la "espiral de la muerte" tras una pausa o un tirón. */
    readonly maxFrameSeconds: number,
  ) {}

  /** Añade el tiempo real transcurrido y devuelve cuántos pasos fijos hay que simular ahora. */
  advance(frameSeconds: number): number {
    if (!Number.isFinite(frameSeconds) || frameSeconds <= 0) return 0;
    this.accumulator += Math.min(frameSeconds, this.maxFrameSeconds);
    // El épsilon absorbe errores de coma flotante (p. ej. 3 × 1/60 sumados uno a uno).
    const steps = Math.floor((this.accumulator + 1e-9) / this.stepSeconds);
    this.accumulator = Math.max(0, this.accumulator - steps * this.stepSeconds);
    return steps;
  }

  /** Fracción [0, 1) del siguiente paso ya transcurrida, para interpolar el render. */
  get alpha(): number {
    return Math.min(1, this.accumulator / this.stepSeconds);
  }

  reset(): void {
    this.accumulator = 0;
  }
}
