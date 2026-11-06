/**
 * Colisiones contra la arena: movimiento de círculos con deslizamiento y lanzamiento de segmentos
 * (colisión continua de proyectiles, línea de visión y cámara).
 */
import {
  circleCirclePenetration,
  circleRectPenetration,
  segmentCircleT,
  segmentRectT,
  type Penetration,
  type Vec2,
} from '../core/math';
import type { Arena } from './arena';

const pen: Penetration = { nx: 0, nz: 0, depth: 0 };
const RESOLVE_ITERATIONS = 4;

/** Saca un círculo de todos los obstáculos que toca. Devuelve true si hubo contacto. */
export function resolveCircle(arena: Arena, pos: Vec2, radius: number): boolean {
  let touched = false;
  for (let iter = 0; iter < RESOLVE_ITERATIONS; iter++) {
    let any = false;
    const n = arena.obstacleHash.query(pos.x, pos.z, radius, arena.scratch);
    for (let i = 0; i < n; i++) {
      const o = arena.obstacles[arena.scratch[i] ?? 0];
      if (o === undefined) continue;
      const hit =
        o.kind === 'rect'
          ? circleRectPenetration(pos.x, pos.z, radius, o.rect, pen)
          : circleCirclePenetration(pos.x, pos.z, radius, o.circle, pen);
      if (hit) {
        // Empujar hacia fuera a lo largo de la normal: la componente tangente se conserva (deslizamiento).
        pos.x += pen.nx * (pen.depth + 1e-5);
        pos.z += pen.nz * (pen.depth + 1e-5);
        any = true;
        touched = true;
      }
    }
    if (!any) break;
  }
  // Red de seguridad: nunca fuera del área interior.
  const inner = arena.inner;
  if (pos.x < inner.minX + radius) pos.x = inner.minX + radius;
  if (pos.x > inner.maxX - radius) pos.x = inner.maxX - radius;
  if (pos.z < inner.minZ + radius) pos.z = inner.minZ + radius;
  if (pos.z > inner.maxZ - radius) pos.z = inner.maxZ - radius;
  return touched;
}

/**
 * Mueve un círculo (dx, dz) con deslizamiento. Divide el movimiento en sub-pasos más cortos que el radio
 * para que ni a alta velocidad se atraviese una cobertura. Devuelve true si tocó algún obstáculo.
 */
export function moveCircle(
  arena: Arena,
  pos: Vec2,
  radius: number,
  dx: number,
  dz: number,
): boolean {
  const dist = Math.sqrt(dx * dx + dz * dz);
  const maxStep = radius * 0.5;
  const steps = dist > maxStep ? Math.ceil(dist / maxStep) : 1;
  const sx = dx / steps;
  const sz = dz / steps;
  let touched = false;
  for (let i = 0; i < steps; i++) {
    pos.x += sx;
    pos.z += sz;
    if (resolveCircle(arena, pos, radius)) touched = true;
  }
  return touched;
}

/**
 * Primer instante t ∈ [0, 1] en que un círculo de radio `radius` que viaja de A a B toca un obstáculo
 * de altura mayor que `minHeight`, o -1 si el camino está libre. Los rectángulos se amplían con `radius`.
 */
export function sweepObstacles(
  arena: Arena,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  radius: number,
  minHeight = 0,
): number {
  const mx = (ax + bx) / 2;
  const mz = (az + bz) / 2;
  const half = Math.sqrt((bx - ax) * (bx - ax) + (bz - az) * (bz - az)) / 2;
  const n = arena.obstacleHash.query(mx, mz, half + radius, arena.scratch);
  let best = -1;
  for (let i = 0; i < n; i++) {
    const o = arena.obstacles[arena.scratch[i] ?? 0];
    if (o === undefined || o.height <= minHeight) continue;
    const t =
      o.kind === 'rect'
        ? segmentRectT(ax, az, bx, bz, o.rect, radius)
        : segmentCircleT(ax, az, bx, bz, o.circle.x, o.circle.z, o.circle.r + radius);
    if (t >= 0 && (best < 0 || t < best)) best = t;
  }
  return best;
}

/** ¿Hay línea de visión libre entre A y B para un cuerpo de radio `radius`? */
export function hasLineOfSight(
  arena: Arena,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  radius: number,
): boolean {
  return sweepObstacles(arena, ax, az, bx, bz, radius) < 0;
}

/** ¿El círculo está libre de obstáculos (para validar puntos de aparición)? */
export function isCircleFree(arena: Arena, x: number, z: number, radius: number): boolean {
  const inner = arena.inner;
  if (x - radius < inner.minX || x + radius > inner.maxX) return false;
  if (z - radius < inner.minZ || z + radius > inner.maxZ) return false;
  const n = arena.obstacleHash.query(x, z, radius, arena.scratch);
  for (let i = 0; i < n; i++) {
    const o = arena.obstacles[arena.scratch[i] ?? 0];
    if (o === undefined) continue;
    const hit =
      o.kind === 'rect'
        ? circleRectPenetration(x, z, radius, o.rect, pen)
        : circleCirclePenetration(x, z, radius, o.circle, pen);
    if (hit) return false;
  }
  return true;
}
