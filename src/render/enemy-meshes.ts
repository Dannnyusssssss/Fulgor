/**
 * Enemigos dibujados con InstancedMesh (una llamada de dibujo por pieza, no por enemigo).
 * Zumbador: cuerpo octaédrico oscuro con un anillo luminoso. Durante el aviso, el anillo cambia de forma (se abre)
 * y de color de manera estable y progresiva: nunca parpadea.
 * También dibuja los avisos en el suelo (franja con chevrones) y los anillos de materialización.
 */
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  RepeatWrapping,
  DynamicDrawUsage,
  InstancedMesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  OctahedronGeometry,
  PlaneGeometry,
  RingGeometry,
  TorusGeometry,
  SRGBColorSpace,
  type Scene,
} from 'three';
import { lerp } from '../core/math';
import { dashLength } from '../game/enemies/zumbador';
import { EnemyState } from '../game/enemies/types';
import type { World } from '../game/world';

const RING_NORMAL = new Color(0xff3d8b);
const RING_WARN = new Color(0xffb020);
const TELEGRAPH = new Color(0xffa31a);
const PORTAL = new Color(0xb78bff);
const HOVER_HEIGHT = 0.85;

/** Franja de aviso: chevrones que apuntan en la dirección del ataque (forma, no solo color). */
function createChevronTexture(): CanvasTexture {
  const w = 64;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 7;
    // Bordes laterales de la franja.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 5, h);
    ctx.fillRect(w - 5, 0, 5, h);
    // Dos chevrones por repetición, apuntando hacia arriba de la textura (= hacia delante).
    for (const y of [24, 88]) {
      ctx.beginPath();
      ctx.moveTo(10, y + 22);
      ctx.lineTo(w / 2, y);
      ctx.lineTo(w - 10, y + 22);
      ctx.stroke();
    }
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(1, 3);
  return tex;
}

export class EnemyMeshes {
  private readonly body: InstancedMesh;
  private readonly ring: InstancedMesh;
  private readonly telegraph: InstancedMesh;
  private readonly portal: InstancedMesh;
  private readonly chevrons: CanvasTexture;
  private readonly dummy = new Object3D();
  private readonly color = new Color();
  private time = 0;

  constructor(
    private readonly scene: Scene,
    capacity: number,
    shadows: boolean,
  ) {
    const bodyMat = new MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.4,
      metalness: 0.6,
      flatShading: true,
    });
    this.body = new InstancedMesh(new OctahedronGeometry(0.5, 0), bodyMat, capacity);
    this.body.castShadow = shadows;

    const ringMat = new MeshBasicMaterial({ color: 0xffffff });
    this.ring = new InstancedMesh(new TorusGeometry(0.48, 0.05, 4, 16), ringMat, capacity);

    this.chevrons = createChevronTexture();
    const telMat = new MeshBasicMaterial({
      color: 0xffffff,
      map: this.chevrons,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const telGeo = new PlaneGeometry(1, 1);
    telGeo.rotateX(-Math.PI / 2);
    // El origen de la franja queda en su borde trasero: se escala hacia delante desde el enemigo.
    telGeo.translate(0, 0, -0.5);
    this.telegraph = new InstancedMesh(telGeo, telMat, capacity);

    const portalGeo = new RingGeometry(0.55, 0.75, 32);
    portalGeo.rotateX(-Math.PI / 2);
    const portalMat = new MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.portal = new InstancedMesh(portalGeo, portalMat, capacity);

    const white = new Color(0xffffff);
    for (const m of [this.body, this.ring, this.telegraph, this.portal]) {
      m.instanceMatrix.setUsage(DynamicDrawUsage);
      // Los colores por instancia se crean desde el principio para que el shader no cambie después.
      for (let i = 0; i < capacity; i++) m.setColorAt(i, white);
      m.count = 0;
      m.frustumCulled = false;
      scene.add(m);
    }
  }

  update(world: World, alpha: number, dt: number): void {
    this.time += dt;
    const def = world.tuning.zumbador;
    const d = this.dummy;
    let n = 0;
    let nt = 0;
    let np = 0;
    for (const e of world.enemies.items) {
      if (!e.active) continue;
      const x = lerp(e.prev.x, e.pos.x, alpha);
      const z = lerp(e.prev.z, e.pos.z, alpha);
      const materializing = e.state === EnemyState.Materializing;
      const progress = e.stateDuration > 0 ? 1 - Math.max(0, e.stateTimer) / e.stateDuration : 1;
      // Flotación suave y continua (no es un destello).
      const bob = Math.sin(this.time * 3 + e.index) * 0.06;
      const scale = materializing ? 0.25 + 0.75 * progress : 1;

      d.position.set(x, HOVER_HEIGHT + bob, z);
      // Giro lento y continuo del cuerpo.
      d.rotation.set(0, this.time * 0.8 + e.index, 0);
      d.scale.set(scale, scale * 0.8, scale);
      d.updateMatrix();
      this.body.setMatrixAt(n, d.matrix);
      // Daño recibido: el cuerpo se aclara brevemente con un fundido suave.
      const hurt = Math.max(0, 1 - e.sinceHurt / 0.25);
      this.color.setRGB(0.5 + hurt * 0.3, 0.52 + hurt * 0.2, 0.68 + hurt * 0.2);
      this.body.setColorAt(n, this.color);

      // Anillo: horizontal en reposo; durante el aviso se inclina hacia la dirección del ataque y se vuelve ámbar.
      const windup = e.state === EnemyState.Windup;
      d.position.set(x, HOVER_HEIGHT + bob, z);
      d.rotation.set(Math.PI / 2 - (windup ? 0.9 * progress : 0), e.yaw, 0, 'YXZ');
      const rs = windup ? scale * (1 + 0.25 * progress) : scale;
      d.scale.set(rs, rs, rs);
      d.updateMatrix();
      this.ring.setMatrixAt(n, d.matrix);
      this.color.copy(RING_NORMAL);
      if (windup) this.color.lerp(RING_WARN, 0.4 + 0.6 * progress);
      this.ring.setColorAt(n, this.color);
      n++;

      if (windup) {
        // Franja de aviso en el suelo con la longitud exacta de la embestida; se intensifica sin parpadear.
        const len = dashLength(def) + e.radius;
        d.position.set(e.pos.x, 0.025, e.pos.z);
        d.rotation.set(0, e.yaw, 0);
        d.scale.set(e.radius * 2, 1, len);
        d.updateMatrix();
        this.telegraph.setMatrixAt(nt, d.matrix);
        this.color.copy(TELEGRAPH).multiplyScalar(0.35 + 0.65 * progress);
        this.telegraph.setColorAt(nt, this.color);
        nt++;
      }

      if (materializing) {
        // Anillo de entrada estable: tamaño y color constantes durante toda la materialización.
        d.position.set(x, 0.03, z);
        d.rotation.set(0, 0, 0);
        d.scale.set(1, 1, 1);
        d.updateMatrix();
        this.portal.setMatrixAt(np, d.matrix);
        this.portal.setColorAt(np, PORTAL);
        np++;
      }
    }
    this.finish(this.body, n);
    this.finish(this.ring, n);
    this.finish(this.telegraph, nt);
    this.finish(this.portal, np);
  }

  private finish(mesh: InstancedMesh, count: number): void {
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    for (const m of [this.body, this.ring, this.telegraph, this.portal]) {
      this.scene.remove(m);
      m.geometry.dispose();
      (m.material as MeshBasicMaterial).dispose();
      m.dispose();
    }
    this.chevrons.dispose();
  }
}
