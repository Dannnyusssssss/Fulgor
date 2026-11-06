/**
 * Efectos visuales: fragmentos de luz de las máquinas desactivadas, impactos y luces dinámicas.
 * Todo efecto de luz fuerte pide permiso a FlashBudget: si lo concede se muestra con pulso;
 * si no (o con "Reducir destellos"), se muestra como un cambio de color estable, pequeño y sin pulso.
 * El destello del disparo es un brillo suave continuo, nunca un pulso por disparo.
 */
import {
  AdditiveBlending,
  Color,
  DynamicDrawUsage,
  IcosahedronGeometry,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  PointLight,
  TetrahedronGeometry,
  type Scene,
} from 'three';
import type { FlashBudget } from '../core/flash-budget';
import { damp, forwardInto, rightInto, vec2 } from '../core/math';
import { BALANCE, type Quality } from '../data/balance';
import { GameEvent, type EventRecord } from '../game/events';
import type { PlayerState } from '../game/player';

const IMPACT_CAPACITY = 48;
const FRAGMENT_CAPACITY: number = BALANCE.quality.high.fragments;
const FRAG_COLOR = new Color(0xff6fb0);
const FRAG_COLOR_ALT = new Color(0x8ff3ff);
const IMPACT_COLOR = new Color(0x9ff8ff);
const BURST_COLOR = new Color(0xff8ac4);

/** Generador visual simple (solo afecta al aspecto de las partículas, nunca a la partida). */
class VisualRandom {
  private s = 0x2545f491;
  next(): number {
    this.s ^= this.s << 13;
    this.s ^= this.s >>> 17;
    this.s ^= this.s << 5;
    return (this.s >>> 0) / 4294967296;
  }
}

export interface FxSettings {
  reduceMotion: boolean;
  quality: Quality;
}

export class Effects {
  private readonly fragments: InstancedMesh;
  private readonly impacts: InstancedMesh;
  private readonly dummy = new Object3D();
  private readonly color = new Color();
  private readonly rand = new VisualRandom();

  // Fragmentos: estructura de arreglos con tamaño fijo.
  private readonly fx = new Float32Array(FRAGMENT_CAPACITY);
  private readonly fy = new Float32Array(FRAGMENT_CAPACITY);
  private readonly fz = new Float32Array(FRAGMENT_CAPACITY);
  private readonly fvx = new Float32Array(FRAGMENT_CAPACITY);
  private readonly fvy = new Float32Array(FRAGMENT_CAPACITY);
  private readonly fvz = new Float32Array(FRAGMENT_CAPACITY);
  private readonly flife = new Float32Array(FRAGMENT_CAPACITY);
  private readonly fspin = new Float32Array(FRAGMENT_CAPACITY);
  private readonly falt = new Uint8Array(FRAGMENT_CAPACITY);
  private fragCursor = 0;

  // Impactos.
  private readonly ix = new Float32Array(IMPACT_CAPACITY);
  private readonly iy = new Float32Array(IMPACT_CAPACITY);
  private readonly iz = new Float32Array(IMPACT_CAPACITY);
  private readonly iage = new Float32Array(IMPACT_CAPACITY);
  private readonly idur = new Float32Array(IMPACT_CAPACITY);
  private readonly isize0 = new Float32Array(IMPACT_CAPACITY);
  private readonly isize1 = new Float32Array(IMPACT_CAPACITY);
  private readonly iint = new Float32Array(IMPACT_CAPACITY);
  private readonly iburst = new Uint8Array(IMPACT_CAPACITY);
  private impactCursor = 0;

  // Luces: un grupo fijo (el número de luces no cambia nunca, así no se recompilan shaders).
  private readonly lights: PointLight[] = [];
  private readonly lightAge: Float32Array;
  private lightCursor = 0;
  private readonly muzzle: PointLight;
  private muzzleLevel = 0;
  private sinceShot = 999;

  private settings: FxSettings = { reduceMotion: false, quality: 'medium' };

  constructor(
    private readonly scene: Scene,
    private readonly budget: FlashBudget,
  ) {
    this.fragments = new InstancedMesh(
      new TetrahedronGeometry(0.1, 0),
      new MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
      FRAGMENT_CAPACITY,
    );
    this.impacts = new InstancedMesh(
      new IcosahedronGeometry(1, 0),
      new MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
      IMPACT_CAPACITY,
    );
    const white = new Color(0xffffff);
    for (const m of [this.fragments, this.impacts]) {
      m.instanceMatrix.setUsage(DynamicDrawUsage);
      for (let i = 0; i < m.instanceMatrix.count; i++) m.setColorAt(i, white);
      m.count = 0;
      m.frustumCulled = false;
      scene.add(m);
    }
    this.flife.fill(0);
    this.iage.fill(1);
    this.idur.fill(1);

    const burstLights = Math.max(1, BALANCE.fx.lightPool - 1);
    this.lightAge = new Float32Array(burstLights).fill(999);
    for (let i = 0; i < burstLights; i++) {
      const l = new PointLight(0xff7ab8, 0, 7, 2);
      this.lights.push(l);
      scene.add(l);
    }
    this.muzzle = new PointLight(0x6ff0ff, 0, 4, 2);
    scene.add(this.muzzle);
  }

  setSettings(settings: FxSettings): void {
    this.settings = settings;
  }

  /** Procesa un evento de la simulación. `now` es el reloj del render en segundos. */
  handle(e: EventRecord, now: number): void {
    switch (e.type) {
      case GameEvent.Shot:
        this.sinceShot = 0;
        break;
      case GameEvent.ProjectileHitWall:
      case GameEvent.ProjectileHitEnemy: {
        const full = this.budget.request(now) === 'full';
        if (full) this.spawnImpact(e.x, 0.8, e.z, 0.18, 0.45, 0.14, 1, false);
        else this.spawnImpact(e.x, 0.8, e.z, 0.16, 0.16, BALANCE.fx.dimmedSeconds, 0.35, false);
        break;
      }
      case GameEvent.EnemyDestroyed: {
        this.spawnFragments(e.x, 0.85, e.z);
        const full = this.budget.request(now) === 'full';
        if (full) {
          this.spawnImpact(e.x, 0.85, e.z, 0.4, 1.0, 0.22, 0.9, true);
          this.pulseLight(e.x, 1.2, e.z);
        } else {
          this.spawnImpact(e.x, 0.85, e.z, 0.45, 0.45, BALANCE.fx.dimmedSeconds, 0.3, true);
        }
        break;
      }
      case GameEvent.PlayerDefeated: {
        // Chispa también se deshace en fragmentos de luz (sin sangre ni imágenes explícitas).
        this.spawnFragments(e.x, 0.8, e.z);
        if (this.budget.request(now) === 'full') this.pulseLight(e.x, 1.2, e.z);
        break;
      }
      default:
        break;
    }
  }

  private spawnImpact(
    x: number,
    y: number,
    z: number,
    s0: number,
    s1: number,
    dur: number,
    intensity: number,
    burst: boolean,
  ): void {
    const i = this.impactCursor;
    this.impactCursor = (this.impactCursor + 1) % IMPACT_CAPACITY;
    this.ix[i] = x;
    this.iy[i] = y;
    this.iz[i] = z;
    this.iage[i] = 0;
    this.idur[i] = dur;
    this.isize0[i] = s0;
    this.isize1[i] = s1;
    this.iint[i] = intensity;
    this.iburst[i] = burst ? 1 : 0;
  }

  private spawnFragments(x: number, y: number, z: number): void {
    const q = BALANCE.quality[this.settings.quality];
    const limit = this.settings.reduceMotion ? Math.floor(q.fragments / 2) : q.fragments;
    const count = this.settings.reduceMotion
      ? Math.ceil(BALANCE.fx.fragmentsPerDeath / 2)
      : BALANCE.fx.fragmentsPerDeath;
    for (let k = 0; k < count; k++) {
      // Búfer circular dentro del límite de la calidad: si se llena, se reemplazan los más antiguos.
      const i = this.fragCursor % limit;
      this.fragCursor = (this.fragCursor + 1) % limit;
      const a = this.rand.next() * Math.PI * 2;
      const sp = 1.2 + this.rand.next() * 2.2;
      this.fx[i] = x;
      this.fy[i] = y;
      this.fz[i] = z;
      this.fvx[i] = Math.cos(a) * sp;
      this.fvz[i] = Math.sin(a) * sp;
      this.fvy[i] = 0.8 + this.rand.next() * 1.8;
      this.flife[i] = BALANCE.fx.fragmentLifetime * (0.6 + this.rand.next() * 0.4);
      this.fspin[i] = this.rand.next() * 6;
      this.falt[i] = this.rand.next() < 0.3 ? 1 : 0;
    }
  }

  private pulseLight(x: number, y: number, z: number): void {
    const l = this.lights[this.lightCursor];
    if (l === undefined) return;
    l.position.set(x, y, z);
    this.lightAge[this.lightCursor] = 0;
    this.lightCursor = (this.lightCursor + 1) % this.lights.length;
  }

  update(dt: number, player: PlayerState, px: number, pz: number, firing: boolean): void {
    const d = this.dummy;
    // Fragmentos: suben un poco, frenan y se encogen (se "deshacen" en luz).
    let nf = 0;
    for (let i = 0; i < FRAGMENT_CAPACITY; i++) {
      const life = this.flife[i] ?? 0;
      if (life <= 0) continue;
      const nl = life - dt;
      this.flife[i] = nl;
      if (nl <= 0) continue;
      const drag = Math.exp(-2.5 * dt);
      this.fvx[i] = (this.fvx[i] ?? 0) * drag;
      this.fvz[i] = (this.fvz[i] ?? 0) * drag;
      this.fvy[i] = ((this.fvy[i] ?? 0) - 1.5 * dt) * drag;
      this.fx[i] = (this.fx[i] ?? 0) + (this.fvx[i] ?? 0) * dt;
      this.fy[i] = Math.max(0.05, (this.fy[i] ?? 0) + (this.fvy[i] ?? 0) * dt);
      this.fz[i] = (this.fz[i] ?? 0) + (this.fvz[i] ?? 0) * dt;
      const t = nl / BALANCE.fx.fragmentLifetime;
      d.position.set(this.fx[i] ?? 0, this.fy[i] ?? 0, this.fz[i] ?? 0);
      const spin = (this.fspin[i] ?? 0) + nl * 5;
      d.rotation.set(spin, spin * 0.7, 0);
      d.scale.setScalar(Math.max(0.05, t));
      d.updateMatrix();
      this.fragments.setMatrixAt(nf, d.matrix);
      this.color.copy(this.falt[i] ? FRAG_COLOR_ALT : FRAG_COLOR).multiplyScalar(0.4 + 0.6 * t);
      this.fragments.setColorAt(nf, this.color);
      nf++;
    }
    this.fragments.count = nf;
    this.fragments.instanceMatrix.needsUpdate = true;
    if (this.fragments.instanceColor) this.fragments.instanceColor.needsUpdate = true;

    // Impactos: los concedidos crecen y se apagan rápido; los atenuados son un brillo pequeño y estable que se desvanece.
    let ni = 0;
    for (let i = 0; i < IMPACT_CAPACITY; i++) {
      const dur = this.idur[i] ?? 1;
      const age = (this.iage[i] ?? 1) + dt;
      this.iage[i] = age;
      if (age >= dur) continue;
      const t = age / dur;
      const size = (this.isize0[i] ?? 0) + ((this.isize1[i] ?? 0) - (this.isize0[i] ?? 0)) * t;
      d.position.set(this.ix[i] ?? 0, this.iy[i] ?? 0, this.iz[i] ?? 0);
      d.rotation.set(0, 0, 0);
      d.scale.setScalar(size);
      d.updateMatrix();
      this.impacts.setMatrixAt(ni, d.matrix);
      this.color
        .copy(this.iburst[i] ? BURST_COLOR : IMPACT_COLOR)
        .multiplyScalar((this.iint[i] ?? 0) * (1 - t));
      this.impacts.setColorAt(ni, this.color);
      ni++;
    }
    this.impacts.count = ni;
    this.impacts.instanceMatrix.needsUpdate = true;
    if (this.impacts.instanceColor) this.impacts.instanceColor.needsUpdate = true;

    // Luces de las desactivaciones concedidas: caída rápida y suave.
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i];
      if (l === undefined) continue;
      const age = (this.lightAge[i] ?? 999) + dt;
      this.lightAge[i] = age;
      l.intensity = age < 0.3 ? 6 * (1 - age / 0.3) : 0;
    }

    // Brillo del arma: sube y baja suave mientras se dispara (nunca un pulso por disparo).
    // Con "Reducir destellos" no hay luz dinámica.
    this.sinceShot += dt;
    const reduced = this.budget.isReduced();
    const target = !reduced && firing && this.sinceShot < 0.3 ? 1 : 0;
    this.muzzleLevel = damp(this.muzzleLevel, target, 8, dt);
    forwardInto(fwd, player.yaw);
    rightInto(right, player.yaw);
    this.muzzle.position.set(
      px + fwd.x * 0.75 + right.x * 0.38,
      0.8,
      pz + fwd.z * 0.75 + right.z * 0.38,
    );
    this.muzzle.intensity = this.muzzleLevel * 1.5;
  }

  /** Borra todos los efectos en curso (al reiniciar o salir de la partida). */
  clear(): void {
    this.flife.fill(0);
    this.iage.fill(1);
    this.lightAge.fill(999);
    for (const l of this.lights) l.intensity = 0;
    this.muzzle.intensity = 0;
    this.muzzleLevel = 0;
    this.fragments.count = 0;
    this.impacts.count = 0;
  }

  dispose(): void {
    for (const m of [this.fragments, this.impacts]) {
      this.scene.remove(m);
      m.geometry.dispose();
      (m.material as MeshBasicMaterial).dispose();
      m.dispose();
    }
    for (const l of this.lights) {
      this.scene.remove(l);
      l.dispose();
    }
    this.scene.remove(this.muzzle);
    this.muzzle.dispose();
  }
}

const fwd = vec2();
const right = vec2();
