/**
 * Peligros de energía en el suelo. Siempre se ve su contorno; el aviso se dibuja con rayas diagonales cuya intensidad
 * sube de forma progresiva (sin parpadeo), y al activarse la zona se rellena. El pulso de brillo de la activación
 * pide permiso al presupuesto de destellos; si no se concede (o con "Reducir destellos"), solo cambia el color.
 */
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  type Scene,
} from 'three';
import type { FlashBudget } from '../core/flash-budget';
import type { ArenaDef } from '../data/arenas';
import { HazardPhase, hazardPhaseAt, hazardProgressAt } from '../game/hazards';
import { disposeTree } from './arena-mesh';

function createStripeTexture(): CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 10;
    for (let k = -size; k < size * 2; k += 32) {
      ctx.beginPath();
      ctx.moveTo(k, 0);
      ctx.lineTo(k + size, size);
      ctx.stroke();
    }
  }
  const tex = new CanvasTexture(canvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

interface HazardView {
  stripes: MeshBasicMaterial;
  fill: MeshBasicMaterial;
  edge: LineBasicMaterial;
  /** Brillo extra de la activación concedida (decae suave). */
  boost: number;
}

export class HazardsView {
  private readonly group = new Group();
  private readonly views: HazardView[] = [];
  private readonly texture: CanvasTexture;
  private readonly color = new Color();
  private readonly base: Color;

  constructor(
    private readonly scene: Scene,
    private readonly def: ArenaDef,
    private readonly budget: FlashBudget,
  ) {
    this.texture = createStripeTexture();
    this.base = new Color(def.palette.hazard);
    for (const h of def.hazards) {
      const geo = new PlaneGeometry(h.width, h.depth);
      geo.rotateX(-Math.PI / 2);
      const tex = this.texture.clone();
      tex.repeat.set(h.width / 1.2, h.depth / 1.2);
      tex.needsUpdate = true;
      const stripes = new MeshBasicMaterial({
        color: 0x000000,
        map: tex,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      });
      const fill = new MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      });
      const sMesh = new Mesh(geo, stripes);
      sMesh.position.set(h.x, 0.035, h.z);
      const fMesh = new Mesh(geo, fill);
      fMesh.position.set(h.x, 0.03, h.z);
      const edge = new LineBasicMaterial({ color: this.base });
      const outline = new LineSegments(new EdgesGeometry(geo), edge);
      outline.position.set(h.x, 0.04, h.z);
      this.group.add(fMesh, sMesh, outline);
      this.views.push({ stripes, fill, edge, boost: 0 });
    }
    scene.add(this.group);
  }

  /** La simulación avisa de que el peligro `index` se activó (`now` en segundos del render). */
  onActivate(index: number, now: number): void {
    const v = this.views[index];
    if (v !== undefined && this.budget.request(now) === 'full') v.boost = 1;
  }

  update(time: number, dt: number): void {
    this.def.hazards.forEach((h, i) => {
      const v = this.views[i];
      if (v === undefined) return;
      const phase = hazardPhaseAt(h, time);
      const progress = hazardProgressAt(h, time);
      v.boost = Math.max(0, v.boost - dt * 4);
      let stripes = 0;
      let fill = 0;
      if (phase === HazardPhase.Warn) {
        // Las rayas aparecen poco a poco durante todo el aviso.
        stripes = 0.25 + 0.6 * progress;
        fill = 0.05;
      } else if (phase === HazardPhase.Active) {
        stripes = 0.5;
        fill = 0.55 + 0.25 * v.boost;
      }
      this.color.copy(this.base).multiplyScalar(stripes);
      v.stripes.color.copy(this.color);
      this.color.copy(this.base).multiplyScalar(fill);
      v.fill.color.copy(this.color);
      // El contorno se ve siempre (forma del peligro aunque esté apagado).
      v.edge.color.copy(this.base).multiplyScalar(phase === HazardPhase.Off ? 0.45 : 1);
    });
  }

  dispose(): void {
    this.scene.remove(this.group);
    disposeTree(this.group);
    this.texture.dispose();
  }
}
