/**
 * Arena en tiempo de ejecución: obstáculos de colisión (paredes y coberturas) y su hash espacial.
 */
import type { Circle, Rect } from '../core/math';
import { SpatialHash } from '../core/spatial-hash';
import type { ArenaDef } from '../data/arenas';

/** Obstáculo sólido: rectángulo o círculo, con altura (solo importa para la cámara). */
export type Obstacle =
  { kind: 'rect'; rect: Rect; height: number } | { kind: 'circle'; circle: Circle; height: number };

export interface Arena {
  readonly def: ArenaDef;
  readonly obstacles: readonly Obstacle[];
  /** Hash de obstáculos estáticos (se construye una vez). */
  readonly obstacleHash: SpatialHash;
  /** Límites exteriores incluidas las paredes. */
  readonly bounds: Rect;
  /** Límites interiores (área jugable). */
  readonly inner: Rect;
  /** Buffer reutilizable para consultas. */
  readonly scratch: number[];
}

const OBSTACLE_CELL = 2;

export function createArena(def: ArenaDef): Arena {
  const hw = def.width / 2;
  const hd = def.depth / 2;
  const t = def.wallThickness;
  const h = def.wallHeight;
  const obstacles: Obstacle[] = [
    // Cuatro paredes exteriores (más gruesas por fuera para que nada las cruce).
    { kind: 'rect', rect: { minX: -hw - t, minZ: -hd - t, maxX: hw + t, maxZ: -hd }, height: h },
    { kind: 'rect', rect: { minX: -hw - t, minZ: hd, maxX: hw + t, maxZ: hd + t }, height: h },
    { kind: 'rect', rect: { minX: -hw - t, minZ: -hd, maxX: -hw, maxZ: hd }, height: h },
    { kind: 'rect', rect: { minX: hw, minZ: -hd, maxX: hw + t, maxZ: hd }, height: h },
  ];
  for (const c of def.covers) {
    if (c.kind === 'box') {
      obstacles.push({
        kind: 'rect',
        rect: {
          minX: c.x - c.width / 2,
          minZ: c.z - c.depth / 2,
          maxX: c.x + c.width / 2,
          maxZ: c.z + c.depth / 2,
        },
        height: c.height,
      });
    } else {
      obstacles.push({ kind: 'circle', circle: { x: c.x, z: c.z, r: c.radius }, height: c.height });
    }
  }
  const bounds: Rect = { minX: -hw - t, minZ: -hd - t, maxX: hw + t, maxZ: hd + t };
  const hash = new SpatialHash(
    bounds.minX,
    bounds.minZ,
    bounds.maxX - bounds.minX,
    bounds.maxZ - bounds.minZ,
    OBSTACLE_CELL,
    obstacles.length,
    obstacles.length * 128,
  );
  obstacles.forEach((o, i) => {
    if (o.kind === 'rect') hash.insertBox(i, o.rect.minX, o.rect.minZ, o.rect.maxX, o.rect.maxZ);
    else hash.insert(i, o.circle.x, o.circle.z, o.circle.r);
  });
  return {
    def,
    obstacles,
    obstacleHash: hash,
    bounds,
    inner: { minX: -hw, minZ: -hd, maxX: hw, maxZ: hd },
    scratch: new Array<number>(obstacles.length).fill(0),
  };
}
