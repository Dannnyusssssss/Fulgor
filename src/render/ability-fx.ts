/**
 * Efectos del Rayo y de las habilidades del jugador: haz continuo, anillo de la Onda, burbuja de la Barrera
 * y holograma del Señuelo.
 * El haz es un brillo continuo y estable mientras se dispara (nunca un pulso por disparo).
 * La Onda pide permiso a FlashBudget: si no se concede, se dibuja con poca intensidad y sin pulso.
 * La Barrera y el Señuelo son formas estables que se desvanecen poco a poco, sin parpadeo.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  RingGeometry,
  type Scene,
} from 'three';
import type { FlashBudget } from '../core/flash-budget';
import { BALANCE } from '../data/balance';
import { GameEvent, type EventRecord } from '../game/events';
import { BeamHit } from '../game/systems/weapon-system';
import type { World } from '../game/world';
import { disposeTree } from './arena-mesh';

const BEAM_COLOR = new Color(0x8ff6ff);
const BEAM_BLOCKED_COLOR = new Color(0x9fe8ff);
const ONDA_COLOR = new Color(0x7ff0ff);
const BARRIER_COLOR = new Color(0x5fe3ff);
const DECOY_COLOR = new Color(0x9ff3ff);
/** Tras el último pulso, el haz se mantiene visible este tiempo (cubre el intervalo entre pulsos). */
const BEAM_HOLD = 0.09;
const BEAM_HEIGHT = 0.78;

function additive(color: Color, opacity = 1): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
}

export class AbilityEffects {
  private readonly root = new Group();
  private readonly beam: Mesh;
  private readonly beamTip: Mesh;
  private readonly beamMat: MeshBasicMaterial;
  private readonly tipMat: MeshBasicMaterial;
  private beamAge = 999;
  private readonly onda: Mesh;
  private readonly ondaMat: MeshBasicMaterial;
  private ondaAge = 999;
  private ondaDur = 0.4;
  private ondaRadius = 1;
  private ondaIntensity = 1;
  private readonly bubble: Mesh;
  private readonly bubbleMat: MeshBasicMaterial;
  private readonly decoy = new Group();
  private readonly decoyMat: MeshBasicMaterial;
  private readonly decoyRing: Mesh;
  private decoySpin = 0;

  constructor(
    private readonly scene: Scene,
    private readonly budget: FlashBudget,
  ) {
    // Haz: caja unitaria que se estira hacia -z.
    const beamGeo = new BoxGeometry(1, 1, 1);
    beamGeo.translate(0, 0, -0.5);
    this.beamMat = additive(BEAM_COLOR, 0.85);
    this.beam = new Mesh(beamGeo, this.beamMat);
    this.tipMat = additive(BEAM_COLOR, 0.6);
    this.beamTip = new Mesh(new IcosahedronGeometry(0.16, 0), this.tipMat);

    // Onda: anillo plano que se expande hasta el radio de la habilidad.
    const ring = new RingGeometry(0.9, 1, 40);
    ring.rotateX(-Math.PI / 2);
    this.ondaMat = additive(ONDA_COLOR, 0);
    this.onda = new Mesh(ring, this.ondaMat);

    // Barrera: burbuja facetada alrededor de Chispa (su opacidad baja con la absorción que queda).
    this.bubbleMat = additive(BARRIER_COLOR, 0);
    this.bubble = new Mesh(new IcosahedronGeometry(0.95, 1), this.bubbleMat);

    // Señuelo: holograma de Chispa simplificado (octaedro alargado + anillo en el suelo).
    this.decoyMat = additive(DECOY_COLOR, 0.5);
    const body = new Mesh(new OctahedronGeometry(0.4, 0), this.decoyMat);
    body.scale.set(0.9, 1.5, 0.9);
    body.position.y = 0.75;
    const ringGeo = new RingGeometry(0.5, 0.6, 24);
    ringGeo.rotateX(-Math.PI / 2);
    this.decoyRing = new Mesh(ringGeo, this.decoyMat);
    this.decoyRing.position.y = 0.04;
    this.decoy.add(body, this.decoyRing);

    for (const m of [this.beam, this.beamTip, this.onda, this.bubble, this.decoy]) {
      m.visible = false;
      this.root.add(m);
    }
    scene.add(this.root);
  }

  handle(e: EventRecord, now: number): void {
    switch (e.type) {
      case GameEvent.BeamPulse: {
        this.beamAge = 0;
        const len = Math.max(0.1, e.c);
        this.beam.position.set(e.x, BEAM_HEIGHT, e.z);
        this.beam.rotation.set(0, Math.atan2(-e.a, -e.b), 0);
        this.beam.scale.set(0.07, 0.07, len);
        const hit = e.d !== BeamHit.None;
        this.beamTip.visible = hit;
        this.beamTip.position.set(e.x + e.a * len, BEAM_HEIGHT, e.z + e.b * len);
        this.tipMat.color.copy(e.d === BeamHit.Blocked ? BEAM_BLOCKED_COLOR : BEAM_COLOR);
        break;
      }
      case GameEvent.AbilityOnda: {
        const full = this.budget.request(now) === 'full';
        this.ondaAge = 0;
        this.ondaDur = full ? 0.4 : BALANCE.fx.dimmedSeconds + 0.1;
        this.ondaIntensity = full ? 0.9 : 0.35;
        this.ondaRadius = e.a;
        this.onda.position.set(e.x, 0.06, e.z);
        break;
      }
      default:
        break;
    }
  }

  update(world: World, px: number, pz: number, dt: number): void {
    const reduced = this.budget.isReduced();
    // Haz: visible mientras siguen llegando pulsos; intensidad estable.
    this.beamAge += dt;
    const beamOn = this.beamAge < BEAM_HOLD;
    this.beam.visible = beamOn;
    if (!beamOn) this.beamTip.visible = false;
    this.beamMat.opacity = reduced ? 0.45 : 0.85;

    // Onda: el anillo crece y se apaga.
    this.ondaAge += dt;
    const ondaOn = this.ondaAge < this.ondaDur;
    this.onda.visible = ondaOn;
    if (ondaOn) {
      const t = this.ondaAge / this.ondaDur;
      const r = this.ondaRadius * (0.25 + 0.75 * t);
      this.onda.scale.set(r, 1, r);
      this.ondaMat.opacity = this.ondaIntensity * (1 - t);
    }

    // Barrera: opacidad proporcional a lo que le queda; sin pulsos.
    const p = world.player;
    const barrierOn = p.barrierTimer > 0 && p.barrier > 0;
    this.bubble.visible = barrierOn;
    if (barrierOn) {
      this.bubble.position.set(px, 0.8, pz);
      const frac = p.barrier / Math.max(1, p.barrierMax);
      // En el último segundo se desvanece despacio para avisar de que se acaba.
      const fade = Math.min(1, p.barrierTimer);
      this.bubbleMat.opacity = (0.12 + 0.18 * frac) * fade;
    }

    // Señuelo: gira despacio y se desvanece en su último segundo.
    const d = world.ability.decoy;
    this.decoy.visible = d.alive && d.timer > 0;
    if (this.decoy.visible) {
      this.decoySpin += dt * 1.2;
      this.decoy.position.set(d.pos.x, 0, d.pos.z);
      this.decoy.rotation.y = this.decoySpin;
      this.decoyMat.opacity = 0.5 * Math.min(1, d.timer);
    }
  }

  clear(): void {
    this.beamAge = 999;
    this.ondaAge = 999;
    for (const m of [this.beam, this.beamTip, this.onda, this.bubble, this.decoy])
      m.visible = false;
  }

  dispose(): void {
    this.scene.remove(this.root);
    disposeTree(this.root);
  }
}
