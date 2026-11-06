/**
 * Renderer WebGL, escena y cámara. Se ajusta al tamaño de la ventana y respeta devicePixelRatio con tope por calidad.
 */
import { PCFSoftShadowMap, PerspectiveCamera, Scene, WebGLRenderer, SRGBColorSpace } from 'three';
import { BALANCE, type Quality } from '../data/balance';

export class GameRenderer {
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  private quality: Quality;
  private lastWidth = 0;
  private lastHeight = 0;
  private lastDpr = 0;

  private constructor(
    readonly renderer: WebGLRenderer,
    readonly canvas: HTMLCanvasElement,
    quality: Quality,
  ) {
    this.quality = quality;
    this.camera = new PerspectiveCamera(BALANCE.camera.fovDefault, 1, 0.05, 200);
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.shadowMap.type = PCFSoftShadowMap;
    this.applyQuality();
  }

  /** Crea el renderer o devuelve null si WebGL no está disponible. */
  static create(canvas: HTMLCanvasElement, quality: Quality): GameRenderer | null {
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
    const dpr = Math.min(window.devicePixelRatio || 1, BALANCE.quality[this.quality].dprCap);
    if (width === this.lastWidth && height === this.lastHeight && dpr === this.lastDpr) return;
    this.lastWidth = width;
    this.lastHeight = height;
    this.lastDpr = dpr;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
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
