/**
 * Resolución dinámica (lógica pura): mide los FPS en ventanas de tiempo y decide la escala de la resolución
 * interna. Si los FPS se quedan por debajo del umbral durante varias ventanas seguidas, baja un paso; si se
 * mantienen holgados durante bastante más tiempo, sube un paso (histéresis: nunca oscila de un frame a otro).
 * Los frames con un salto de tiempo anómalo (pestaña en segundo plano, pausa del depurador) no cuentan.
 */
export interface DynResConfig {
  /** Por debajo de estos FPS la ventana cuenta como lenta. */
  lowFps: number;
  /** Por encima de estos FPS la ventana cuenta como holgada. */
  highFps: number;
  /** Duración de cada ventana de medida (s). */
  windowSeconds: number;
  /** Ventanas lentas seguidas para bajar la escala. */
  windowsToDrop: number;
  /** Ventanas holgadas seguidas para subirla. */
  windowsToRaise: number;
  step: number;
  minScale: number;
  maxScale: number;
  /** Un frame más largo que esto se ignora. */
  maxFrameSeconds: number;
}

export class DynamicResolution {
  private scale: number;
  private frames = 0;
  private time = 0;
  private slow = 0;
  private fast = 0;
  /** FPS medidos en la última ventana completa (0 si aún no hay). */
  lastFps = 0;

  constructor(
    private readonly cfg: DynResConfig,
    initialScale = cfg.maxScale,
  ) {
    this.scale = this.clamp(initialScale);
  }

  get current(): number {
    return this.scale;
  }

  /** Vuelve a empezar la medida (por ejemplo al reanudar una partida), sin tocar la escala. */
  resetWindow(): void {
    this.frames = 0;
    this.time = 0;
    this.slow = 0;
    this.fast = 0;
  }

  /** Fija la escala (por ejemplo al desactivar la opción). */
  setScale(scale: number): void {
    this.scale = this.clamp(scale);
    this.resetWindow();
  }

  /**
   * Registra un frame de `dt` segundos. Devuelve true si la escala cambió en este frame
   * (quien llama aplica la escala nueva y la guarda).
   */
  frame(dt: number): boolean {
    if (!(dt > 0) || dt > this.cfg.maxFrameSeconds) return false;
    this.frames++;
    this.time += dt;
    if (this.time < this.cfg.windowSeconds) return false;
    const fps = this.frames / this.time;
    this.lastFps = fps;
    this.frames = 0;
    this.time = 0;
    if (fps < this.cfg.lowFps) {
      this.slow++;
      this.fast = 0;
    } else if (fps > this.cfg.highFps) {
      this.fast++;
      this.slow = 0;
    } else {
      this.slow = 0;
      this.fast = 0;
    }
    if (this.slow >= this.cfg.windowsToDrop && this.scale > this.cfg.minScale) {
      this.slow = 0;
      return this.change(-this.cfg.step);
    }
    if (this.fast >= this.cfg.windowsToRaise && this.scale < this.cfg.maxScale) {
      this.fast = 0;
      return this.change(this.cfg.step);
    }
    return false;
  }

  private change(delta: number): boolean {
    const next = this.clamp(this.scale + delta);
    if (next === this.scale) return false;
    this.scale = next;
    return true;
  }

  /** Redondea a centésimas para que la escala guardada sea estable. */
  private clamp(v: number): number {
    const c = Number.isFinite(v) ? Math.min(this.cfg.maxScale, Math.max(this.cfg.minScale, v)) : 1;
    return Math.round(c * 100) / 100;
  }
}
