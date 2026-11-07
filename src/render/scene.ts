/**
 * Renderer WebGL, escena y cámara. Se ajusta al tamaño de la ventana y respeta devicePixelRatio con tope por calidad.
 */
import { PCFShadowMap, PerspectiveCamera, Scene, WebGLRenderer, SRGBColorSpace } from 'three';
import { BALANCE, type Quality } from '../data/balance';

export class GameRenderer {
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  private quality: Quality;
  private lastWidth = 0;
  private lastHeight = 0;
  private lastDpr = 0;
  /** Escala de la resolución interna (resolución dinámica; 1 = completa). */
  private renderScale = 1;

  private constructor(
    readonly renderer: WebGLRenderer,
    readonly canvas: HTMLCanvasElement,
    quality: Quality,
  ) {
    this.quality = quality;
    this.camera = new PerspectiveCamera(BALANCE.camera.fovDefault, 1, 0.05, 200);
    renderer.outputColorSpace = SRGBColorSpace;
    // PCFShadowMap: PCFSoftShadowMap ya no existe en esta versión de Three.js (avisa en consola y se sustituye).
    renderer.shadowMap.type = PCFShadowMap;
    this.applyQuality();
  }

  /**
   * Comprueba si el navegador puede crear un contexto WebGL, con un canvas aparte para no ocupar el del juego.
   * Así, sin WebGL se muestra el mensaje propio sin que Three.js llene la consola de errores.
   */
  static webglAvailable(): boolean {
    try {
      const probe = document.createElement('canvas');
      const gl = probe.getContext('webgl2') ?? probe.getContext('webgl');
      if (gl === null) return false;
      // Libera el contexto de prueba enseguida (los navegadores limitan cuántos puede haber a la vez).
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return true;
    } catch {
      return false;
    }
  }

  /** Crea el renderer o devuelve null si WebGL no está disponible. */
  static create(canvas: HTMLCanvasElement, quality: Quality): GameRenderer | null {
    if (!GameRenderer.webglAvailable()) return null;
    try {
      const renderer = new WebGLRenderer({
        canvas,
        antialias: BALANCE.quality[quality].antialias,
        powerPreference: 'high-performance',
        stencil: false,
      });
      if (!renderer.getContext()) return null;
      return new GameRenderer(renderer, canvas, quality);
    } catch {
      return null;
    }
  }

  getQuality(): Quality {
    return this.quality;
  }

  /** Cambia la calidad. El antialias se decide al crear el renderer y no cambia en caliente. */
  setQuality(quality: Quality): void {
    if (quality === this.quality) return;
    this.quality = quality;
    this.applyQuality();
  }

  private applyQuality(): void {
    this.renderer.shadowMap.enabled = BALANCE.quality[this.quality].shadows;
    this.lastDpr = 0; // fuerza recalcular el tamaño con el nuevo tope
  }

  /** Ajusta el tamaño del búfer si cambió la ventana o el devicePixelRatio. Barato si no cambió nada. */
  syncSize(): void {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    const dpr =
      Math.min(window.devicePixelRatio || 1, BALANCE.quality[this.quality].dprCap) *
      this.renderScale;
    if (width === this.lastWidth && height === this.lastHeight && dpr === this.lastDpr) return;
    this.lastWidth = width;
    this.lastHeight = height;
    this.lastDpr = dpr;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /** Obliga a recalcular el tamaño del búfer en el próximo frame (por ejemplo tras restaurar el contexto). */
  forceResize(): void {
    this.lastDpr = 0;
  }

  /** Cambia la escala de la resolución interna (0,6–1). El tamaño en pantalla no cambia. */
  setRenderScale(scale: number): void {
    const s = Number.isFinite(scale) ? Math.min(1, Math.max(0.5, scale)) : 1;
    if (s === this.renderScale) return;
    this.renderScale = s;
    this.lastDpr = 0;
  }

  /** Relación de píxeles efectiva (para el overlay de depuración). */
  get pixelRatio(): number {
    return this.lastDpr;
  }

  setFov(fov: number): void {
    if (this.camera.fov === fov) return;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
