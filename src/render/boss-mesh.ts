/**
 * Vista del Coloso: modelo procedural low-poly, avisos de sus ataques y orbes.
 * - Barrido: sector fijo en el suelo durante el aviso (con una línea en el borde donde empieza el haz)
 *   y, al atacar, el haz recorriendo el sector.
 * - Ráfaga: líneas fijas en abanico durante el aviso.
 * - Orbes: anillo estable con un relleno que crece hasta el momento del golpe; en la fase 3, zona rayada activa.
 * - Cambio de fase: anillo estable alrededor del Coloso.
 * Los colores de fase cambian de forma estable (sin parpadeo). El golpe de cada orbe pide permiso a FlashBudget.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DodecahedronGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  RingGeometry,
  type Scene,
} from 'three';
import type { FlashBudget } from '../core/flash-budget';
import { lerp, wrapAngle } from '../core/math';
import { BALANCE } from '../data/balance';
import { COLOSO } from '../data/enemies';
import { ZoneState } from '../game/boss-zones';
import { sweepObstacles } from '../game/collision';
import { ColosoAttack } from '../game/enemies/coloso';
import { EnemyKind, EnemyState, type Enemy } from '../game/enemies/types';
import { GameEvent, type EventRecord } from '../game/events';
import type { World } from '../game/world';
import { disposeTree } from './arena-mesh';

/** Colores de cada fase (forma estable: cambian de golpe solo al cambiar de fase, tras la pausa). */
const PHASE_COLORS = [new Color(0xffb340), new Color(0xff7a2e), new Color(0xff3d7a)];
const TELEGRAPH = new Color(0xffd23f);
const BEAM = new Color(0xffe08a);
const ZONE_WARN = new Color(0xffd23f);
const ZONE_ACTIVE = new Color(0xff3d9a);
const SHIFT = new Color(0x9ff3ff);
const WHITE = new Color(0xffffff);
const ZONE_CAPACITY: number = BALANCE.boss.zoneCapacity;
const IMPACT_CAPACITY = 8;

function glow(opacity = 1): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
}

export class BossView {
  private readonly root = new Group();
  private readonly model = new Group();
  private readonly bodyMat: MeshStandardMaterial;
  private readonly accentMat: MeshBasicMaterial;
  private readonly portal: Mesh;
  private readonly shiftRing: Mesh;
  private readonly sector: Mesh;
  private readonly sectorMat: MeshBasicMaterial;
  private readonly sectorEdge: Mesh;
  private readonly beam: Mesh;
  private readonly beamMat: MeshBasicMaterial;
  private readonly volley: InstancedMesh;
  private readonly zoneRings: InstancedMesh;
  private readonly zoneFills: InstancedMesh;
  private readonly impacts: InstancedMesh;
  private readonly dummy = new Object3D();
  private readonly color = new Color();
  private readonly impactX = new Float32Array(IMPACT_CAPACITY);
  private readonly impactZ = new Float32Array(IMPACT_CAPACITY);
  private readonly impactR = new Float32Array(IMPACT_CAPACITY);
  private readonly impactAge = new Float32Array(IMPACT_CAPACITY).fill(9);
  private readonly impactDur = new Float32Array(IMPACT_CAPACITY).fill(1);
  private readonly impactInt = new Float32Array(IMPACT_CAPACITY);
  private impactCursor = 0;

  constructor(
    private readonly scene: Scene,
    private readonly budget: FlashBudget,
  ) {
    const r = COLOSO.radius;
    this.bodyMat = new MeshStandardMaterial({
      color: 0x2a2f45,
      roughness: 0.6,
      metalness: 0.5,
      flatShading: true,
    });
    this.accentMat = new MeshBasicMaterial({ color: PHASE_COLORS[0] ?? WHITE });

    // Base octogonal, torso facetado, hombros y cabeza con visor (mira hacia -z).
    const base = new Mesh(new CylinderGeometry(r * 0.85, r, 0.7, 8), this.bodyMat);
    base.position.y = 0.35;
    const torso = new Mesh(new DodecahedronGeometry(r * 0.75, 0), this.bodyMat);
    torso.scale.set(1.15, 1, 0.9);
    torso.position.y = 1.55;
    const shoulderGeo = new BoxGeometry(0.7, 0.6, 0.9);
    const shoulderL = new Mesh(shoulderGeo, this.bodyMat);
    const shoulderR = new Mesh(shoulderGeo, this.bodyMat);
    shoulderL.position.set(-r * 0.95, 1.95, 0);
    shoulderR.position.set(r * 0.95, 1.95, 0);
    const head = new Mesh(new BoxGeometry(0.8, 0.5, 0.7), this.bodyMat);
    head.position.set(0, 2.45, -0.1);
    const visor = new Mesh(new BoxGeometry(0.62, 0.12, 0.08), this.accentMat);
    visor.position.set(0, 2.48, -0.47);
    const core = new Mesh(new DodecahedronGeometry(0.28, 0), this.accentMat);
    core.position.set(0, 1.6, -r * 0.62);
    const ringBand = new Mesh(
      new CylinderGeometry(r * 0.9, r * 0.9, 0.08, 8, 1, true),
      this.accentMat,
    );
    ringBand.position.y = 0.72;
    this.model.add(base, torso, shoulderL, shoulderR, head, visor, core, ringBand);

    // Portal y anillo de cambio de fase: tamaño y brillo constantes.
    const portalGeo = new RingGeometry(r * 1.4, r * 1.6, 40);
    portalGeo.rotateX(-Math.PI / 2);
    const portalMat = glow(0.7);
    portalMat.color.set(0xb38cff);
    this.portal = new Mesh(portalGeo, portalMat);
    this.portal.position.y = 0.04;
    const shiftMat = glow(0.55);
    shiftMat.color.copy(SHIFT);
    this.shiftRing = new Mesh(portalGeo, shiftMat);
    this.shiftRing.position.y = 0.05;

    // Sector del barrido (mismo tamaño que el ataque) y línea del borde donde empieza el haz.
    const arc = COLOSO.sweepHalfAngle;
    const sectorGeo = new RingGeometry(r, COLOSO.sweepRange, 32, 1, Math.PI / 2 - arc, arc * 2);
    sectorGeo.rotateX(-Math.PI / 2);
    this.sectorMat = glow(0.3);
    this.sector = new Mesh(sectorGeo, this.sectorMat);
    this.sector.position.y = 0.03;
    const edgeGeo = new BoxGeometry(0.16, 0.02, COLOSO.sweepRange - r);
    edgeGeo.translate(0, 0, -(COLOSO.sweepRange + r) / 2);
    const edgeMat = glow(0.8);
    edgeMat.color.copy(TELEGRAPH);
    this.sectorEdge = new Mesh(edgeGeo, edgeMat);
    this.sectorEdge.position.y = 0.04;

    // Haz del barrido: caja unitaria estirada hacia -z.
    const beamGeo = new BoxGeometry(1, 1, 1);
    beamGeo.translate(0, 0, -0.5);
    this.beamMat = glow(0.9);
    this.beamMat.color.copy(BEAM);
    this.beam = new Mesh(beamGeo, this.beamMat);

    // Líneas de la ráfaga (una por proyectil).
    const stripGeo = new BoxGeometry(1, 1, 1);
    stripGeo.translate(0, 0, -0.5);
    this.volley = new InstancedMesh(stripGeo, glow(0.7), Math.max(1, COLOSO.volleyCount));

    // Orbes: anillo de borde estable + relleno.
    const ringGeo = new RingGeometry(0.9, 1, 36);
    ringGeo.rotateX(-Math.PI / 2);
    this.zoneRings = new InstancedMesh(ringGeo, glow(0.9), ZONE_CAPACITY);
    const fillGeo = new CircleGeometry(1, 36);
    fillGeo.rotateX(-Math.PI / 2);
    this.zoneFills = new InstancedMesh(fillGeo, glow(0.4), ZONE_CAPACITY);
    this.impacts = new InstancedMesh(fillGeo, glow(1), IMPACT_CAPACITY);
    for (const m of [this.volley, this.zoneRings, this.zoneFills, this.impacts]) {
      m.instanceMatrix.setUsage(DynamicDrawUsage);
      for (let i = 0; i < m.instanceMatrix.count; i++) m.setColorAt(i, WHITE);
      m.count = 0;
      m.frustumCulled = false;
    }

    this.root.add(
      this.model,
      this.portal,
      this.shiftRing,
      this.sector,
      this.sectorEdge,
      this.beam,
      this.volley,
      this.zoneRings,
      this.zoneFills,
      this.impacts,
    );
    for (const o of [
      this.model,
      this.portal,
      this.shiftRing,
      this.sector,
      this.sectorEdge,
      this.beam,
    ]) {
      o.visible = false;
    }
    scene.add(this.root);
  }

  handle(e: EventRecord, now: number): void {
    if (e.type !== GameEvent.ZoneImpact) return;
    // Golpe del orbe: disco que se apaga rápido si el presupuesto lo concede; si no, tenue y estable.
    const full = this.budget.request(now) === 'full';
    const i = this.impactCursor;
    this.impactCursor = (i + 1) % IMPACT_CAPACITY;
    this.impactX[i] = e.x;
    this.impactZ[i] = e.z;
    this.impactR[i] = e.a;
    this.impactAge[i] = 0;
    this.impactDur[i] = full ? 0.3 : BALANCE.fx.dimmedSeconds;
    this.impactInt[i] = full ? 0.8 : 0.3;
  }

  private findBoss(world: World): Enemy | null {
    for (const e of world.enemies.items) if (e.active && e.kind === EnemyKind.Coloso) return e;
    return null;
  }

  update(world: World, alpha: number, dt: number): void {
    const boss = this.findBoss(world);
    this.model.visible = boss !== null;
    this.portal.visible = false;
    this.shiftRing.visible = false;
    this.sector.visible = false;
    this.sectorEdge.visible = false;
    this.beam.visible = false;
    this.volley.count = 0;
    if (boss !== null) this.updateBoss(world, boss, alpha);
    this.updateZones(world);
    this.updateImpacts(dt);
  }

  private updateBoss(world: World, e: Enemy, alpha: number): void {
    const x = lerp(e.prev.x, e.pos.x, alpha);
    const z = lerp(e.prev.z, e.pos.z, alpha);
    const progress = e.stateDuration > 0 ? 1 - Math.max(0, e.stateTimer) / e.stateDuration : 1;
    const materializing = e.state === EnemyState.Materializing;
    this.model.position.set(x, 0, z);
    this.model.rotation.y = e.yaw;
    const s = materializing ? 0.3 + 0.7 * progress : 1;
    this.model.scale.setScalar(s);
    // Color de fase y un aclarado suave al recibir daño.
    const hurt = Math.max(0, 1 - e.sinceHurt / 0.25);
    this.accentMat.color.copy(PHASE_COLORS[Math.min(2, Math.max(0, e.phase - 1))] ?? WHITE);
    this.bodyMat.emissive.setRGB(hurt * 0.25, hurt * 0.25, hurt * 0.3);

    if (materializing) {
      this.portal.visible = true;
      this.portal.position.set(x, 0.04, z);
      return;
    }
    if (e.state === EnemyState.Shift) {
      this.shiftRing.visible = true;
      this.shiftRing.position.set(x, 0.05, z);
      return;
    }
    const warning = e.state === EnemyState.Windup;
    if (e.attack === ColosoAttack.Sweep && (warning || e.state === EnemyState.Dash)) {
      // Sector fijo centrado en la dirección del ataque.
      const center = e.sweepFrom + wrapAngle(e.sweepTo - e.sweepFrom) / 2;
      this.sector.visible = true;
      this.sector.position.set(e.pos.x, 0.03, e.pos.z);
      this.sector.rotation.y = center;
      this.sectorMat.color.copy(TELEGRAPH);
      this.sectorMat.opacity = warning ? 0.12 + 0.25 * progress : 0.1;
      if (warning) {
        this.sectorEdge.visible = true;
        this.sectorEdge.position.set(e.pos.x, 0.04, e.pos.z);
        this.sectorEdge.rotation.y = e.sweepFrom;
      } else {
        // Haz: hasta la primera pared o cobertura.
        const dx = -Math.sin(e.sweepAngle);
        const dz = -Math.cos(e.sweepAngle);
        const range = world.tuning.coloso.sweepRange;
        const t = sweepObstacles(
          world.arena,
          e.pos.x,
          e.pos.z,
          e.pos.x + dx * range,
          e.pos.z + dz * range,
          0.05,
        );
        const len = (t >= 0 ? t : 1) * range;
        this.beam.visible = true;
        this.beam.position.set(e.pos.x, 1.0, e.pos.z);
        this.beam.rotation.set(0, e.sweepAngle, 0);
        this.beam.scale.set(0.35, 0.35, len);
        this.beamMat.opacity = this.budget.isReduced() ? 0.5 : 0.9;
      }
      return;
    }
    if (warning && e.attack === ColosoAttack.Volley) {
      const def = world.tuning.coloso;
      const n = Math.max(1, Math.min(this.volley.instanceMatrix.count, def.volleyCount));
      const base = Math.atan2(-e.dir.x, -e.dir.z);
      const d = this.dummy;
      this.color.copy(TELEGRAPH).multiplyScalar(0.35 + 0.65 * progress);
      for (let k = 0; k < n; k++) {
        const yaw = base + (n > 1 ? -def.volleySpread / 2 + (def.volleySpread * k) / (n - 1) : 0);
        d.position.set(e.pos.x, 0.03, e.pos.z);
        d.rotation.set(0, yaw, 0);
        d.scale.set(0.3, 0.02, 10);
        d.updateMatrix();
        this.volley.setMatrixAt(k, d.matrix);
        this.volley.setColorAt(k, this.color);
      }
      this.volley.count = n;
      this.volley.instanceMatrix.needsUpdate = true;
      if (this.volley.instanceColor) this.volley.instanceColor.needsUpdate = true;
      return;
    }
    if (warning && e.attack === ColosoAttack.Summon) {
      this.shiftRing.visible = true;
      this.shiftRing.position.set(x, 0.05, z);
    }
  }

  private updateZones(world: World): void {
    const d = this.dummy;
    let nr = 0;
    let nf = 0;
    for (const zone of world.bossZones.items) {
      if (!zone.active || nr >= ZONE_CAPACITY) continue;
      const warn = zone.state === ZoneState.Warn;
      // Borde: siempre visible y estable.
      d.position.set(zone.x, 0.045, zone.z);
      d.rotation.set(0, 0, 0);
      d.scale.set(zone.radius, 1, zone.radius);
      d.updateMatrix();
      this.zoneRings.setMatrixAt(nr, d.matrix);
      this.zoneRings.setColorAt(nr++, warn ? ZONE_WARN : ZONE_ACTIVE);
      // Relleno: en el aviso crece hasta el borde justo cuando cae; activo, relleno completo tenue.
      const progress = warn ? 1 - Math.max(0, zone.timer) / Math.max(1e-6, zone.warnDuration) : 1;
      const fr = zone.radius * (warn ? Math.max(0.05, progress) : 1);
      d.position.set(zone.x, 0.035, zone.z);
      d.scale.set(fr, 1, fr);
      d.updateMatrix();
      this.zoneFills.setMatrixAt(nf, d.matrix);
      this.color.copy(warn ? ZONE_WARN : ZONE_ACTIVE).multiplyScalar(warn ? 0.35 : 0.45);
      this.zoneFills.setColorAt(nf++, this.color);
    }
    for (const [m, n] of [
      [this.zoneRings, nr],
      [this.zoneFills, nf],
    ] as const) {
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  private updateImpacts(dt: number): void {
    const d = this.dummy;
    let n = 0;
    for (let i = 0; i < IMPACT_CAPACITY; i++) {
      const age = (this.impactAge[i] ?? 9) + dt;
      this.impactAge[i] = age;
      const dur = this.impactDur[i] ?? 1;
      if (age >= dur) continue;
      const t = age / dur;
      const r = this.impactR[i] ?? 1;
      d.position.set(this.impactX[i] ?? 0, 0.06, this.impactZ[i] ?? 0);
      d.rotation.set(0, 0, 0);
      d.scale.set(r, 1, r);
      d.updateMatrix();
      this.impacts.setMatrixAt(n, d.matrix);
      this.color.copy(ZONE_ACTIVE).multiplyScalar((this.impactInt[i] ?? 0) * (1 - t));
      this.impacts.setColorAt(n++, this.color);
    }
    this.impacts.count = n;
    this.impacts.instanceMatrix.needsUpdate = true;
    if (this.impacts.instanceColor) this.impacts.instanceColor.needsUpdate = true;
  }

  clear(): void {
    this.impactAge.fill(9);
  }

  dispose(): void {
    this.scene.remove(this.root);
    disposeTree(this.root);
  }
}
