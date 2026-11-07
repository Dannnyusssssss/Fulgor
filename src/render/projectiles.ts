/**
 * Proyectiles instanciados. Los del jugador son rayos alargados cian; los enemigos serán esferas facetadas magenta:
 * se distinguen por forma y por color.
 */
import {
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  IcosahedronGeometry,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  type Scene,
} from 'three';
import { lerp } from '../core/math';
import { Team } from '../game/projectiles';
import type { World } from '../game/world';

const SHOT_HEIGHT = 0.8;
/** Radio del disparo del Pulsador: los perdigones (más finos) se dibujan más cortos y estrechos. */
const BASE_RADIUS = 0.12;

export class ProjectileMeshes {
  private readonly player: InstancedMesh;
  private readonly enemy: InstancedMesh;
  private readonly dummy = new Object3D();

  constructor(
    private readonly scene: Scene,
    capacity: number,
  ) {
    this.player = new InstancedMesh(
      new BoxGeometry(0.09, 0.09, 0.8),
      new MeshBasicMaterial({ color: new Color(0x7ff6ff) }),
      capacity,
    );
    this.enemy = new InstancedMesh(
      new IcosahedronGeometry(0.2, 0),
      new MeshBasicMaterial({ color: new Color(0xff4fd8) }),
      capacity,
    );
    for (const m of [this.player, this.enemy]) {
      m.instanceMatrix.setUsage(DynamicDrawUsage);
      m.count = 0;
      m.frustumCulled = false;
      scene.add(m);
    }
  }

  update(world: World, alpha: number): void {
    let np = 0;
    let ne = 0;
    const d = this.dummy;
    for (const p of world.projectiles.items) {
      if (!p.active) continue;
      d.position.set(lerp(p.prevX, p.x, alpha), SHOT_HEIGHT, lerp(p.prevZ, p.z, alpha));
      d.rotation.set(0, Math.atan2(-p.vx, -p.vz), 0);
      const k = p.team === Team.Player ? p.radius / BASE_RADIUS : 1;
      d.scale.set(k, k, k * k);
      d.updateMatrix();
      if (p.team === Team.Player) this.player.setMatrixAt(np++, d.matrix);
      else this.enemy.setMatrixAt(ne++, d.matrix);
    }
    this.player.count = np;
    this.enemy.count = ne;
    this.player.instanceMatrix.needsUpdate = true;
    this.enemy.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    for (const m of [this.player, this.enemy]) {
      this.scene.remove(m);
      m.geometry.dispose();
      (m.material as MeshBasicMaterial).dispose();
      m.dispose();
    }
  }
}
