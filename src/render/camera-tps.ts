/**
 * Cámara en tercera persona sobre el hombro.
 * - La rotación responde al ratón en cada frame de render (sin retraso).
 * - La distancia y el cambio de hombro se suavizan de forma independiente de los FPS.
 * - Si un obstáculo queda en medio, la cámara se acerca de inmediato (nunca atraviesa paredes) y vuelve a alejarse suave.
 * - Nunca se mueve ni gira sola. La única excepción es una sacudida leve de posición (sin giro) al recibir golpes
 *   fuertes, que se apaga con "Reducir movimiento".
 */
import type { PerspectiveCamera } from 'three';
import { clamp, damp, wrapAngle } from '../core/math';
import { BALANCE } from '../data/balance';
import type { Arena } from '../game/arena';
import { cameraHeight, computeBoom, type BoomInput, type BoomResult } from '../game/camera-boom';

const CAM = BALANCE.camera;
/** Desplazamiento máximo de la sacudida (m) y velocidad a la que se apaga (por segundo). */
const SHAKE_METERS = 0.07;
const SHAKE_DECAY = 2.5;

export class ThirdPersonCamera {
  yaw = 0;
  pitch: number = CAM.pitchDefault;
  /** +1 hombro derecho, -1 izquierdo. */
  private side = 1;
  private shoulder: number = CAM.shoulderOffset;
  private nominalDistance: number = CAM.distance;
  private distance: number = CAM.distance;
  private readonly boomIn: BoomInput = {
    x: 0,
    z: 0,
    yaw: 0,
    pitch: 0,
    shoulder: 0,
    distance: 0,
    pivotHeight: CAM.pivotHeight,
    padding: CAM.collisionPadding,
    minDistance: CAM.minDistance,
  };
  private readonly boomOut: BoomResult = { pivotX: 0, pivotZ: 0, distance: 0 };
  /** Nivel de sacudida (0–1), baja solo. */
  private shake = 0;
  private shakeTime = 0;
  private reduceMotion = false;

  constructor(private readonly camera: PerspectiveCamera) {
    camera.rotation.order = 'YXZ';
  }

  /** Con "Reducir movimiento" no hay sacudida. */
  setReduceMotion(reduce: boolean): void {
    this.reduceMotion = reduce;
    if (reduce) this.shake = 0;
  }

  /** Suma una sacudida leve (0–1). */
  addShake(amount: number): void {
    if (this.reduceMotion) return;
    this.shake = Math.min(1, this.shake + Math.max(0, amount));
  }

  /** Gira la cámara un poco (apuntado asistido; el llamador limita la velocidad). */
  addYaw(delta: number): void {
    if (Number.isFinite(delta)) this.yaw = wrapAngle(this.yaw + delta);
  }

  reset(yaw: number): void {
    this.shake = 0;
    this.yaw = yaw;
    this.pitch = CAM.pitchDefault;
    this.side = 1;
    this.shoulder = CAM.shoulderOffset;
    this.nominalDistance = CAM.distance;
    this.distance = CAM.distance;
  }

  /** Aplica el giro del ratón (píxeles) y de las flechas (ejes -1..1) de este frame. */
  applyLook(
    dxPixels: number,
    dyPixels: number,
    axisX: number,
    axisY: number,
    sensitivity: number,
    invertY: boolean,
    dt: number,
  ): void {
    const k = CAM.mouseRadiansPerPixel * sensitivity;
    const inv = invertY ? -1 : 1;
    // Mover el ratón a la derecha gira a la derecha (el yaw crece hacia la izquierda).
    this.yaw = wrapAngle(this.yaw - dxPixels * k - axisX * CAM.arrowYawSpeed * sensitivity * dt);
    this.pitch = clamp(
      this.pitch - dyPixels * k * inv + axisY * CAM.arrowPitchSpeed * sensitivity * dt * inv,
      CAM.pitchMin,
      CAM.pitchMax,
    );
  }

  /** Distancia actual de la cámara al pivote (para ocultar a Chispa si queda demasiado cerca). */
  get currentDistance(): number {
    return this.distance;
  }

  toggleShoulder(): void {
    this.side = -this.side;
  }

  /** Coloca la cámara detrás del personaje (posición ya interpolada). */
  update(arena: Arena, x: number, z: number, aiming: boolean, dt: number): void {
    const targetShoulder = this.side * (aiming ? CAM.shoulderOffsetAim : CAM.shoulderOffset);
    this.shoulder = damp(this.shoulder, targetShoulder, CAM.shoulderSharpness, dt);
    this.nominalDistance = damp(
      this.nominalDistance,
      aiming ? CAM.aimDistance : CAM.distance,
      CAM.distanceSharpness,
      dt,
    );

    const b = this.boomIn;
    b.x = x;
    b.z = z;
    b.yaw = this.yaw;
    b.pitch = this.pitch;
    b.shoulder = this.shoulder;
    b.distance = this.nominalDistance;
    const res = computeBoom(arena, b, this.boomOut);

    // Acercarse es inmediato (para no atravesar nada); alejarse es suave.
    this.distance =
      res.distance < this.distance
        ? res.distance
        : damp(this.distance, res.distance, CAM.distanceSharpness, dt);

    const cosP = Math.cos(this.pitch);
    const camX = res.pivotX + Math.sin(this.yaw) * cosP * this.distance;
    const camZ = res.pivotZ + Math.cos(this.yaw) * cosP * this.distance;
    const camY = Math.max(0.3, cameraHeight(CAM.pivotHeight, this.pitch, this.distance));
    // Sacudida: pequeño desplazamiento de posición que se apaga en menos de medio segundo.
    this.shakeTime += dt;
    this.shake = Math.max(0, this.shake - dt * SHAKE_DECAY);
    const s = this.shake * this.shake * SHAKE_METERS;
    const t = this.shakeTime;
    this.camera.position.set(
      camX + Math.sin(t * 37) * s,
      camY + Math.sin(t * 29 + 1) * s,
      camZ + Math.sin(t * 41 + 2) * s,
    );
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }
}
