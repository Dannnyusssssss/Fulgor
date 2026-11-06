/**
 * Objetos recogibles, cada uno con forma propia además de color:
 * vida = cruz verde, escudo = hexágono azul, enfriador = rombo blanco azulado.
 * Flotan y giran despacio; al final de su vida se encogen poco a poco (sin parpadear).
 */
import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  OctahedronGeometry,
  type BufferGeometry,
  type Scene,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BALANCE } from '../data/balance';
import { PickupType, type PickupTypeId } from '../game/pickups';
import type { World } from '../game/world';

/** Segundos finales en los que el objeto se encoge para avisar que va a desaparecer. */
const FADE_SECONDS = 3;

function cross(): BufferGeometry {
  const a = new BoxGeometry(0.5, 0.16, 0.16);
  const b = new BoxGeometry(0.16, 0.5, 0.16);
  return mergeGeometries([a, b]) ?? a;
}

export class PickupMeshes {
  private readonly meshes = new Map<PickupTypeId, InstancedMesh>();
  private readonly dummy = new Object3D();
  private readonly counts = new Map<PickupTypeId, number>();
  private time = 0;

  constructor(private readonly scene: Scene) {
    const cap = BALANCE.pickups.capacity;
    const make = (type: PickupTypeId, geo: BufferGeometry, color: number): void => {
      const m = new InstancedMesh(geo, new MeshBasicMaterial({ color: new Color(color) }), cap);
      m.instanceMatrix.setUsage(DynamicDrawUsage);
      m.count = 0;
      m.frustumCulled = false;
      scene.add(m);
      this.meshes.set(type, m);
    };
    make(PickupType.Health, cross(), 0x6dff8e);
    const hex = new CylinderGeometry(0.28, 0.28, 0.12, 6);
    hex.rotateX(Math.PI / 2);
    make(PickupType.Shield, hex, 0x6fb6ff);
    make(PickupType.Coolant, new OctahedronGeometry(0.26, 0), 0xdff6ff);
  }

  update(world: World, dt: number): void {
    this.time += dt;
    const counts = this.counts;
    counts.clear();
    const d = this.dummy;
    for (const p of world.pickups.items) {
      if (!p.active) continue;
      const mesh = this.meshes.get(p.type);
      if (mesh === undefined) continue;
      const n = counts.get(p.type) ?? 0;
      const s = Math.min(1, Math.max(0.3, p.life / FADE_SECONDS));
      d.position.set(p.x, 0.7 + Math.sin(this.time * 2.5 + p.index) * 0.08, p.z);
      d.rotation.set(0, this.time * 1.4 + p.index, 0);
      d.scale.setScalar(s);
      d.updateMatrix();
      mesh.setMatrixAt(n, d.matrix);
      counts.set(p.type, n + 1);
    }
    for (const [type, mesh] of this.meshes) {
      mesh.count = counts.get(type) ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const m of this.meshes.values()) {
      this.scene.remove(m);
      m.geometry.dispose();
      (m.material as MeshBasicMaterial).dispose();
      m.dispose();
    }
  }
}
