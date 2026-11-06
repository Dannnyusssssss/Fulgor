/**
 * Cálculo puro del "brazo" de la cámara en tercera persona: dónde va el pivote sobre el hombro y hasta qué
 * distancia puede alejarse la cámara sin atravesar paredes ni coberturas. El render solo suaviza el resultado.
 */
import { rightInto, vec2 } from '../core/math';
import type { Arena } from './arena';
import { sweepObstacles } from './collision';

export interface BoomInput {
  /** Posición del personaje en el plano. */
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  /** Desplazamiento lateral con signo (+ hombro derecho, - hombro izquierdo). */
  shoulder: number;
  /** Distancia deseada detrás del pivote. */
  distance: number;
  pivotHeight: number;
  padding: number;
  minDistance: number;
}

export interface BoomResult {
  pivotX: number;
  pivotZ: number;
  /** Distancia permitida (≤ la deseada). */
  distance: number;
}

/** Margen vertical: un obstáculo tapa la cámara si su altura supera la de la cámara menos este margen. */
const HEIGHT_MARGIN = 0.15;
const right = vec2();

/** Altura de la cámara a una distancia dada del pivote. */
export function cameraHeight(pivotHeight: number, pitch: number, distance: number): number {
  return pivotHeight - Math.sin(pitch) * distance;
}

export function computeBoom(arena: Arena, input: BoomInput, out: BoomResult): BoomResult {
  rightInto(right, input.yaw);

  // 1) Del centro del personaje al hombro: si hay una pared al lado, el pivote se acerca al centro.
  let px = input.x + right.x * input.shoulder;
  let pz = input.z + right.z * input.shoulder;
  const tShoulder = sweepObstacles(
    arena,
    input.x,
    input.z,
    px,
    pz,
    input.padding,
    input.pivotHeight - HEIGHT_MARGIN,
  );
  if (tShoulder >= 0) {
    px = input.x + (px - input.x) * tShoulder;
    pz = input.z + (pz - input.z) * tShoulder;
  }

  // 2) Del pivote hacia atrás: la cámara se acerca si un obstáculo lo bastante alto queda en medio.
  const cosP = Math.cos(input.pitch);
  const backX = Math.sin(input.yaw) * cosP;
  const backZ = Math.cos(input.yaw) * cosP;
  const cx = px + backX * input.distance;
  const cz = pz + backZ * input.distance;
  const camY = cameraHeight(input.pivotHeight, input.pitch, input.distance);
  const minH = Math.min(input.pivotHeight, camY) - HEIGHT_MARGIN;
  const t = sweepObstacles(arena, px, pz, cx, cz, input.padding, minH);

  out.pivotX = px;
  out.pivotZ = pz;
  out.distance = t >= 0 ? Math.max(input.minDistance, input.distance * t) : input.distance;
  return out;
}
