/**
 * Matemática 2D sobre el plano del suelo (x, z), en metros.
 * Las funciones escriben en objetos de salida para no crear objetos en el bucle caliente.
 *
 * Convención de ángulos: yaw = 0 mira hacia -z; el yaw crece girando a la izquierda (como rotation.y de Three.js).
 */

export interface Vec2 {
  x: number;
  z: number;
}

export interface Circle {
  x: number;
  z: number;
  r: number;
}

/** Rectángulo alineado a los ejes. */
export interface Rect {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export function vec2(x = 0, z = 0): Vec2 {
  return { x, z };
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Lleva un ángulo a (-π, π]. */
export function wrapAngle(angle: number): number {
  let a = angle % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

/** Interpola ángulos por el camino más corto. */
export function lerpAngle(a: number, b: number, t: number): number {
  return a + wrapAngle(b - a) * t;
}

/**
 * Suavizado exponencial independiente de los FPS: el resultado es el mismo con 30 o 144 frames por segundo.
 * `sharpness` alto = sigue al objetivo más rápido.
 */
export function damp(current: number, target: number, sharpness: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-sharpness * dt));
}

export function length(x: number, z: number): number {
  return Math.sqrt(x * x + z * z);
}

export function distSq(ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  return dx * dx + dz * dz;
}

/** Normaliza (x, z) en `out`. Si el vector es nulo, deja (0, 0). */
export function normalizeInto(out: Vec2, x: number, z: number): Vec2 {
  const len = Math.sqrt(x * x + z * z);
  if (len < 1e-9) {
    out.x = 0;
    out.z = 0;
  } else {
    out.x = x / len;
    out.z = z / len;
  }
  return out;
}

/** Dirección hacia delante para un yaw. */
export function forwardInto(out: Vec2, yaw: number): Vec2 {
  out.x = -Math.sin(yaw);
  out.z = -Math.cos(yaw);
  return out;
}

/** Dirección a la derecha para un yaw. */
export function rightInto(out: Vec2, yaw: number): Vec2 {
  out.x = Math.cos(yaw);
  out.z = -Math.sin(yaw);
  return out;
}

/** Yaw que mira en la dirección (x, z). */
export function yawFromDir(x: number, z: number): number {
  return Math.atan2(-x, -z);
}

export interface Penetration {
  /** Normal de salida (unitaria) hacia fuera del obstáculo. */
  nx: number;
  nz: number;
  /** Profundidad de la penetración (> 0 si hay contacto). */
  depth: number;
}

/** Comprueba si un círculo penetra un rectángulo y calcula cómo sacarlo. */
export function circleRectPenetration(
  cx: number,
  cz: number,
  r: number,
  rect: Rect,
  out: Penetration,
): boolean {
  const px = clamp(cx, rect.minX, rect.maxX);
  const pz = clamp(cz, rect.minZ, rect.maxZ);
  const dx = cx - px;
  const dz = cz - pz;
  const d2 = dx * dx + dz * dz;
  if (d2 > 1e-12) {
    if (d2 >= r * r) return false;
    const d = Math.sqrt(d2);
    out.nx = dx / d;
    out.nz = dz / d;
    out.depth = r - d;
    return true;
  }
  // El centro está dentro del rectángulo: sale por el lado más cercano.
  const left = cx - rect.minX;
  const right = rect.maxX - cx;
  const top = cz - rect.minZ;
  const bottom = rect.maxZ - cz;
  const minSide = Math.min(left, right, top, bottom);
  out.nx = 0;
  out.nz = 0;
  if (minSide === left) out.nx = -1;
  else if (minSide === right) out.nx = 1;
  else if (minSide === top) out.nz = -1;
  else out.nz = 1;
  out.depth = minSide + r;
  return true;
}

/** Comprueba si un círculo penetra otro círculo (el obstáculo) y calcula cómo sacarlo. */
export function circleCirclePenetration(
  cx: number,
  cz: number,
  r: number,
  other: Circle,
  out: Penetration,
): boolean {
  const dx = cx - other.x;
  const dz = cz - other.z;
  const rs = r + other.r;
  const d2 = dx * dx + dz * dz;
  if (d2 >= rs * rs) return false;
  const d = Math.sqrt(d2);
  if (d < 1e-9) {
    // Centros coincidentes: se elige una salida fija para que el resultado sea determinista.
    out.nx = 1;
    out.nz = 0;
  } else {
    out.nx = dx / d;
    out.nz = dz / d;
  }
  out.depth = rs - d;
  return true;
}

/**
 * Primer instante t ∈ [0, 1] en que el segmento A→B toca un círculo de radio r.
 * Devuelve 0 si A ya está dentro y -1 si no lo toca.
 */
export function segmentCircleT(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
  r: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const fx = ax - cx;
  const fz = az - cz;
  const c = fx * fx + fz * fz - r * r;
  if (c <= 0) return 0;
  const a = dx * dx + dz * dz;
  if (a < 1e-12) return -1;
  const b = 2 * (fx * dx + fz * dz);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : -1;
}

/**
 * Primer instante t ∈ [0, 1] en que el segmento A→B entra en el rectángulo ampliado `pad` metros
 * (método de las franjas). Devuelve 0 si A ya está dentro y -1 si no lo toca.
 */
export function segmentRectT(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  rect: Rect,
  pad: number,
): number {
  const minX = rect.minX - pad;
  const maxX = rect.maxX + pad;
  const minZ = rect.minZ - pad;
  const maxZ = rect.maxZ + pad;
  if (ax >= minX && ax <= maxX && az >= minZ && az <= maxZ) return 0;
  const dx = bx - ax;
  const dz = bz - az;
  let tMin = 0;
  let tMax = 1;
  if (Math.abs(dx) < 1e-12) {
    if (ax < minX || ax > maxX) return -1;
  } else {
    let t1 = (minX - ax) / dx;
    let t2 = (maxX - ax) / dx;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return -1;
  }
  if (Math.abs(dz) < 1e-12) {
    if (az < minZ || az > maxZ) return -1;
  } else {
    let t1 = (minZ - az) / dz;
    let t2 = (maxZ - az) / dz;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return -1;
  }
  return tMin;
}

/** ¿Está el punto dentro del rectángulo ampliado `pad`? */
export function pointInRect(x: number, z: number, rect: Rect, pad = 0): boolean {
  return (
    x >= rect.minX - pad && x <= rect.maxX + pad && z >= rect.minZ - pad && z <= rect.maxZ + pad
  );
}
