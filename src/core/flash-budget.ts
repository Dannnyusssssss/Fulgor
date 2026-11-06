/**
 * Presupuesto global de destellos (fotosensibilidad).
 *
 * Todo efecto de luz fuerte (pulsos de luz, flashes de impacto, explosiones, relámpagos de peligros)
 * pide permiso aquí antes de mostrarse. En cualquier ventana de `windowSeconds` se conceden como máximo
 * `maxPerWindow` destellos, sumando todos los enemigos y efectos a la vez (criterio WCAG 2.3.1: no más de 3 por segundo).
 * Lo que no cabe se muestra "atenuado": un cambio de color estable y suave, sin pulso de brillo.
 * Con "Reducir destellos" activo, todo se muestra atenuado.
 */
export type FlashDecision = 'full' | 'dimmed';

export class FlashBudget {
  /** Instantes (en segundos) de los últimos destellos concedidos, en un búfer circular. */
  private readonly granted: Float64Array;
  private head = 0;
  private count = 0;
  private reduced = false;

  constructor(
    readonly maxPerWindow: number,
    readonly windowSeconds: number,
  ) {
    this.granted = new Float64Array(Math.max(1, maxPerWindow));
  }

  setReduced(reduced: boolean): void {
    this.reduced = reduced;
  }

  isReduced(): boolean {
    return this.reduced;
  }

  /** Pide un destello en el instante `now` (segundos, creciente). */
  request(now: number): FlashDecision {
    if (this.reduced || this.maxPerWindow <= 0) return 'dimmed';
    if (this.count < this.maxPerWindow) {
      this.record(now);
      return 'full';
    }
    // El búfer está lleno: el más antiguo está en `head`. Solo se concede si ya salió de la ventana.
    const oldest = this.granted[this.head] ?? 0;
    if (now - oldest >= this.windowSeconds) {
      this.record(now);
      return 'full';
    }
    return 'dimmed';
  }

  /** Cuántos destellos se concedieron en la ventana que termina en `now` (para el overlay y los tests). */
  grantedInWindow(now: number): number {
    let n = 0;
    for (let i = 0; i < this.count; i++) {
      const t = this.granted[i] ?? 0;
      if (now - t < this.windowSeconds) n++;
    }
    return n;
  }

  reset(): void {
    this.head = 0;
    this.count = 0;
  }

  private record(now: number): void {
    if (this.count < this.maxPerWindow) {
      this.granted[(this.head + this.count) % this.maxPerWindow] = now;
      this.count++;
    } else {
      this.granted[this.head] = now;
      this.head = (this.head + 1) % this.maxPerWindow;
    }
  }
}
