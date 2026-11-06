/**
 * Retícula en el suelo: un anillo que marca dónde impactaría el disparo siguiendo el yaw de la cámara
 * (se detiene en la primera pared o cobertura), más una línea tenue desde Chispa.
 */
import {
  AdditiveBlending,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RingGeometry,
  type Scene,
} from 'three';
import { forwardInto, vec2 } from '../core/math';
import { BALANCE } from '../data/balance';
import type { Arena } from '../game/arena';
import { sweepObstacles } from '../game/collision';
import { disposeTree } from './arena-mesh';

const fwd = vec2();

export class Reticle {
  private readonly group = new Group();
  private readonly ring: Mesh;
  private readonly line: Mesh;

  constructor(private readonly scene: Scene) {
    const mat = new MeshBasicMaterial({
      color: 0x8ff3ff,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.ring = new Mesh(new RingGeometry(0.22, 0.3, 24), mat);
    this.ring.rotation.x = -Math.PI / 2;
    const lineMat = new MeshBasicMaterial({
      color: 0x8ff3ff,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.line = new Mesh(new PlaneGeometry(0.05, 1), lineMat);
    this.line.rotation.x = -Math.PI / 2;
    this.group.add(this.ring, this.line);
    scene.add(this.group);
  }

  update(arena: Arena, x: number, z: number, yaw: number, projectileRadius: number): void {
    forwardInto(fwd, yaw);
    const max = BALANCE.camera.reticleMaxDistance;
    const t = sweepObstacles(arena, x, z, x + fwd.x * max, z + fwd.z * max, projectileRadius);
    const d = t >= 0 ? Math.max(0.6, t * max) : max;
    this.ring.position.set(x + fwd.x * d, 0.03, z + fwd.z * d);
    // La línea va desde un poco delante de Chispa hasta el anillo.
    const start = 0.6;
    const len = Math.max(0.01, d - start - 0.3);
    this.line.position.set(x + fwd.x * (start + len / 2), 0.02, z + fwd.z * (start + len / 2));
    this.line.scale.set(1, len, 1);
    this.line.rotation.set(-Math.PI / 2, 0, yaw);
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  dispose(): void {
    this.scene.remove(this.group);
    disposeTree(this.group);
  }
}
