/**
 * Enemigos dibujados con InstancedMesh: dos piezas por tipo (cuerpo y detalle), una llamada de dibujo por pieza.
 * Cada tipo tiene una silueta propia (no solo color). También dibuja todos los avisos de ataque:
 * - Zumbador y Centinela: franja con chevrones en el suelo hacia la dirección fijada.
 * - Blindado: semicírculo en el suelo con el área exacta de la onda.
 * - Vigía: línea láser (fina mientras sigue, gruesa cuando se fija).
 * Más el haz de curación del Reparador, el escudo frontal del Blindado y los portales de entrada.
 * Los avisos se intensifican de forma progresiva y estable: nunca parpadean.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  IcosahedronGeometry,
  InstancedMesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  OctahedronGeometry,
  PlaneGeometry,
  RepeatWrapping,
  RingGeometry,
  SRGBColorSpace,
  TorusGeometry,
  type BufferGeometry,
  type Material,
  type Scene,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { lerp, yawFromDir } from '../core/math';
import { BLINDADO } from '../data/enemies';
import { sweepObstacles } from '../game/collision';
import { EnemyKind, EnemyState, type Enemy, type EnemyKindId } from '../game/enemies/types';
import { dashLength } from '../game/enemies/zumbador';
import type { World } from '../game/world';

const TELEGRAPH = new Color(0xffa31a);
const LASER_TRACK = new Color(0xff5a3c);
const LASER_LOCK = new Color(0xffd0c0);
const HEAL = new Color(0x5dff9a);
const PORTAL = new Color(0xb78bff);
const WHITE = new Color(0xffffff);

/** Altura del ojo del Vigía (origen de su línea). */
const VIGIA_EYE = 1.45;
const CENTINELA_TELEGRAPH_LENGTH = 3;

interface KindStyle {
  /** Color base del cuerpo y del detalle. */
  body: Color;
  accent: Color;
  /** Color del detalle mientras avisa. */
  accentWarn: Color;
  bodyY: number;
  accentY: number;
}

/** Estilos de los enemigos normales (el Coloso tiene su propia vista, BossView). */
const STYLES: Record<Exclude<EnemyKindId, 6>, KindStyle> = {
  1: {
    body: new Color(0.5, 0.52, 0.68),
    accent: new Color(0xff3d8b),
    accentWarn: new Color(0xffb020),
    bodyY: 0.85,
    accentY: 0.85,
  },
  2: {
    body: new Color(0.55, 0.45, 0.65),
    accent: new Color(0xff4fd8),
    accentWarn: new Color(0xffe0f8),
    bodyY: 0.45,
    accentY: 0.75,
  },
  3: {
    body: new Color(0.45, 0.5, 0.6),
    accent: new Color(0x9fe8ff),
    accentWarn: new Color(0xffb020),
    bodyY: 0.55,
    accentY: 0.65,
  },
  4: {
    body: new Color(0x5dff9a),
    accent: new Color(0xeafff2),
    accentWarn: new Color(0xeafff2),
    bodyY: 1.0,
    accentY: 1.0,
  },
  5: {
    body: new Color(0.42, 0.42, 0.55),
    accent: new Color(0xff3030),
    accentWarn: new Color(0xffd0c0),
    bodyY: 0.75,
    accentY: VIGIA_EYE,
  },
};

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
    ctx.fillStyle = '#fff';
    ctx.lineWidth = 7;
    ctx.fillRect(0, 0, 5, h);
    ctx.fillRect(w - 5, 0, 5, h);
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
  tex.repeat.set(1, 2);
  return tex;
}

/** Cruz del Reparador (silueta inconfundible). */
function crossGeometry(): BufferGeometry {
  const a = new BoxGeometry(0.85, 0.26, 0.26);
  const b = new BoxGeometry(0.26, 0.85, 0.26);
  const merged = mergeGeometries([a, b]) ?? a;
  if (merged !== a) {
    a.dispose();
    b.dispose();
  }
  return merged;
}

/** Caja unitaria con origen en su cara trasera: se escala en z para formar líneas desde un punto. */
function lineGeometry(): BoxGeometry {
  const g = new BoxGeometry(1, 1, 1);
  g.translate(0, 0, -0.5);
  return g;
}

export class EnemyMeshes {
  private readonly bodies = new Map<EnemyKindId, InstancedMesh>();
  private readonly accents = new Map<EnemyKindId, InstancedMesh>();
  private readonly strip: InstancedMesh;
  private readonly sector: InstancedMesh;
  private readonly laser: InstancedMesh;
  private readonly heal: InstancedMesh;
  private readonly portal: InstancedMesh;
  private readonly chevrons: CanvasTexture;
  private readonly all: InstancedMesh[] = [];
  private readonly counts = new Map<InstancedMesh, number>();
  private readonly dummy = new Object3D();
  private readonly color = new Color();
  private time = 0;

  constructor(
    private readonly scene: Scene,
    capacity: number,
    shadows: boolean,
  ) {
    const metal = (): MeshStandardMaterial =>
      new MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.4,
        metalness: 0.55,
        flatShading: true,
      });
    const glow = (): MeshBasicMaterial => new MeshBasicMaterial({ color: 0xffffff });

    // Zumbador: octaedro con anillo.
    this.addKind(
      EnemyKind.Zumbador,
      new OctahedronGeometry(0.5, 0),
      metal(),
      new TorusGeometry(0.48, 0.05, 4, 16),
      glow(),
      capacity,
      shadows,
    );
    // Centinela: prisma hexagonal con cañón.
    const cannon = new BoxGeometry(0.16, 0.16, 0.75);
    cannon.translate(0, 0, -0.45);
    this.addKind(
      EnemyKind.Centinela,
      new CylinderGeometry(0.42, 0.55, 0.8, 6),
      metal(),
      cannon,
      glow(),
      capacity,
      shadows,
    );
    // Blindado: bloque con escudo curvo al frente (cubre ±shieldHalfAngle).
    const half = BLINDADO.shieldHalfAngle;
    const shield = new CylinderGeometry(1.02, 1.02, 1.1, 10, 1, true, Math.PI - half, half * 2);
    const shieldMat = new MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.55,
      side: DoubleSide,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.addKind(
      EnemyKind.Blindado,
      new BoxGeometry(1.3, 1.0, 1.2),
      metal(),
      shield,
      shieldMat,
      capacity,
      shadows,
    );
    // Reparador: cruz luminosa con núcleo.
    this.addKind(
      EnemyKind.Reparador,
      crossGeometry(),
      glow(),
      new IcosahedronGeometry(0.16, 0),
      glow(),
      capacity,
      false,
    );
    // Vigía: cono alto con un ojo.
    this.addKind(
      EnemyKind.Vigia,
      new ConeGeometry(0.45, 1.5, 5),
      metal(),
      new IcosahedronGeometry(0.2, 0),
      glow(),
      capacity,
      shadows,
    );

    this.chevrons = createChevronTexture();
    const stripGeo = new PlaneGeometry(1, 1);
    stripGeo.rotateX(-Math.PI / 2);
    stripGeo.translate(0, 0, -0.5);
    this.strip = this.addMesh(stripGeo, this.additive(this.chevrons), capacity);

    // Semicírculo de la onda: anillo parcial unitario en el suelo, centrado hacia -z (el frente).
    const arc = BLINDADO.attackHalfAngle;
    const sectorGeo = new RingGeometry(0.25, 1, 24, 1, Math.PI / 2 - arc, arc * 2);
    sectorGeo.rotateX(-Math.PI / 2);
    this.sector = this.addMesh(sectorGeo, this.additive(null), capacity);

    this.laser = this.addMesh(lineGeometry(), this.additive(null), capacity);
    this.heal = this.addMesh(lineGeometry(), this.additive(null), capacity);

    const portalGeo = new RingGeometry(0.55, 0.75, 32);
    portalGeo.rotateX(-Math.PI / 2);
    this.portal = this.addMesh(portalGeo, this.additive(null), capacity);
  }

  private additive(map: CanvasTexture | null): MeshBasicMaterial {
    return new MeshBasicMaterial({
      color: 0xffffff,
      map,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
    });
  }

  private addMesh(geo: BufferGeometry, mat: Material, capacity: number): InstancedMesh {
    const m = new InstancedMesh(geo, mat, capacity);
    m.instanceMatrix.setUsage(DynamicDrawUsage);
    // Los colores por instancia se crean desde el principio para que el shader no cambie después.
    for (let i = 0; i < capacity; i++) m.setColorAt(i, WHITE);
    m.count = 0;
    m.frustumCulled = false;
    this.scene.add(m);
    this.all.push(m);
    return m;
  }

  private addKind(
    kind: EnemyKindId,
    bodyGeo: BufferGeometry,
    bodyMat: Material,
    accentGeo: BufferGeometry,
    accentMat: Material,
    capacity: number,
    shadows: boolean,
  ): void {
    const body = this.addMesh(bodyGeo, bodyMat, capacity);
    body.castShadow = shadows;
    this.bodies.set(kind, body);
    this.accents.set(kind, this.addMesh(accentGeo, accentMat, capacity));
  }

  private push(mesh: InstancedMesh | undefined, color: Color): void {
    if (mesh === undefined) return;
    const n = this.counts.get(mesh) ?? 0;
    this.dummy.updateMatrix();
    mesh.setMatrixAt(n, this.dummy.matrix);
    mesh.setColorAt(n, color);
    this.counts.set(mesh, n + 1);
  }

  update(world: World, alpha: number, dt: number): void {
    this.time += dt;
    for (const m of this.all) this.counts.set(m, 0);
    const d = this.dummy;
    const items = world.enemies.items;
    for (const e of items) {
      if (!e.active || e.kind === EnemyKind.Coloso) continue;
      const x = lerp(e.prev.x, e.pos.x, alpha);
      const z = lerp(e.prev.z, e.pos.z, alpha);
      const style = STYLES[e.kind];
      const materializing = e.state === EnemyState.Materializing;
      const progress = e.stateDuration > 0 ? 1 - Math.max(0, e.stateTimer) / e.stateDuration : 1;
      const warning = e.state === EnemyState.Windup || e.state === EnemyState.Track;
      const scale = materializing ? 0.25 + 0.75 * progress : 1;
      // Flotación suave y continua de los drones (no es un destello).
      const bob =
        e.kind === EnemyKind.Zumbador || e.kind === EnemyKind.Reparador
          ? Math.sin(this.time * 3 + e.index) * 0.06
          : 0;

      // Cuerpo: se aclara un poco al recibir daño (fundido suave).
      const hurt = Math.max(0, 1 - e.sinceHurt / 0.25);
      this.color.copy(style.body).lerp(WHITE, hurt * 0.35);
      d.position.set(x, style.bodyY + bob, z);
      const spin = e.kind === EnemyKind.Zumbador || e.kind === EnemyKind.Reparador;
      d.rotation.set(0, spin ? this.time * 0.8 + e.index : e.yaw, 0);
      d.scale.set(scale, e.kind === EnemyKind.Zumbador ? scale * 0.8 : scale, scale);
      this.push(this.bodies.get(e.kind), this.color);

      // Detalle.
      this.color.copy(style.accent);
      if (warning) this.color.lerp(style.accentWarn, 0.4 + 0.6 * progress);
      d.position.set(x, style.accentY + bob, z);
      d.scale.set(scale, scale, scale);
      if (e.kind === EnemyKind.Zumbador) {
        // El anillo se inclina hacia la dirección del ataque durante el aviso.
        d.rotation.set(Math.PI / 2 - (warning ? 0.9 * progress : 0), e.yaw, 0, 'YXZ');
        if (warning) d.scale.multiplyScalar(1 + 0.25 * progress);
      } else if (e.kind === EnemyKind.Reparador) {
        d.rotation.set(this.time * 1.5, this.time, 0);
      } else {
        d.rotation.set(0, e.yaw, 0);
      }
      if (e.kind === EnemyKind.Blindado) {
        // El escudo brilla un momento (fundido estable) cuando detiene un disparo.
        this.color.lerp(WHITE, Math.max(0, 1 - e.sinceBlocked / 0.3) * 0.6);
      }
      this.push(this.accents.get(e.kind), this.color);

      if (materializing) {
        // Portal de entrada: anillo de tamaño y color constantes.
        d.position.set(x, 0.03, z);
        d.rotation.set(0, 0, 0);
        const s = Math.max(1, e.radius * 1.6);
        d.scale.set(s, 1, s);
        this.push(this.portal, PORTAL);
        continue;
      }
      if (warning) this.drawTelegraph(world, e, progress);
      if (e.kind === EnemyKind.Reparador && e.targetIndex >= 0)
        this.drawHeal(items[e.targetIndex], x, z, alpha);
    }
    for (const m of this.all) {
      m.count = this.counts.get(m) ?? 0;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  private drawTelegraph(world: World, e: Enemy, progress: number): void {
    const d = this.dummy;
    const intensity = 0.35 + 0.65 * progress;
    switch (e.kind) {
      case EnemyKind.Zumbador:
      case EnemyKind.Centinela: {
        const len =
          e.kind === EnemyKind.Zumbador
            ? dashLength(world.tuning.zumbador) + e.radius
            : CENTINELA_TELEGRAPH_LENGTH;
        const width = e.kind === EnemyKind.Zumbador ? e.radius * 2 : 0.5;
        d.position.set(e.pos.x, 0.025, e.pos.z);
        d.rotation.set(0, yawFromDir(e.dir.x, e.dir.z), 0);
        d.scale.set(width, 1, len);
        this.color.copy(TELEGRAPH).multiplyScalar(intensity);
        this.push(this.strip, this.color);
        break;
      }
      case EnemyKind.Blindado: {
        const r = world.tuning.blindado.attackRange;
        d.position.set(e.pos.x, 0.03, e.pos.z);
        d.rotation.set(0, e.yaw, 0);
        d.scale.set(r, 1, r);
        this.color.copy(TELEGRAPH).multiplyScalar(intensity);
        this.push(this.sector, this.color);
        break;
      }
      case EnemyKind.Vigia: {
        const range = world.tuning.vigia.range;
        const t = sweepObstacles(
          world.arena,
          e.pos.x,
          e.pos.z,
          e.pos.x + e.dir.x * range,
          e.pos.z + e.dir.z * range,
          0.05,
        );
        const len = (t >= 0 ? t : 1) * range;
        const locked = e.state === EnemyState.Windup;
        const w = locked ? 0.09 : 0.035;
        d.position.set(e.pos.x, VIGIA_EYE, e.pos.z);
        d.rotation.set(0, yawFromDir(e.dir.x, e.dir.z), 0);
        d.scale.set(w, w, len);
        this.color
          .copy(locked ? LASER_LOCK : LASER_TRACK)
          .multiplyScalar(locked ? 0.9 : 0.5 + 0.3 * progress);
        this.push(this.laser, this.color);
        break;
      }
      default:
        break;
    }
  }

  private drawHeal(target: Enemy | undefined, x: number, z: number, alpha: number): void {
    if (target === undefined || !target.active) return;
    const tx = lerp(target.prev.x, target.pos.x, alpha);
    const tz = lerp(target.prev.z, target.pos.z, alpha);
    const len = Math.hypot(tx - x, tz - z);
    if (len < 0.1) return;
    const d = this.dummy;
    d.position.set(x, 1.0, z);
    d.rotation.set(0, yawFromDir(tx - x, tz - z), 0);
    d.scale.set(0.06, 0.06, len);
    // Haz estable: intensidad constante.
    this.color.copy(HEAL).multiplyScalar(0.7);
    this.push(this.heal, this.color);
  }

  dispose(): void {
    for (const m of this.all) {
      this.scene.remove(m);
      m.geometry.dispose();
      (m.material as Material).dispose();
      m.dispose();
    }
    this.chevrons.dispose();
  }
}
