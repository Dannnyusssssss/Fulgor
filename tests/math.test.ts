import { describe, expect, it } from 'vitest';
import {
  circleCirclePenetration,
  circleRectPenetration,
  damp,
  forwardInto,
  rightInto,
  segmentCircleT,
  segmentRectT,
  vec2,
  wrapAngle,
  yawFromDir,
  type Penetration,
} from '../src/core/math';

const pen = (): Penetration => ({ nx: 0, nz: 0, depth: 0 });

describe('math', () => {
  it('yaw 0 mira hacia -z y la derecha es +x', () => {
    const f = forwardInto(vec2(), 0);
    const r = rightInto(vec2(), 0);
    expect(f.x).toBeCloseTo(0);
    expect(f.z).toBeCloseTo(-1);
    expect(r.x).toBeCloseTo(1);
    expect(r.z).toBeCloseTo(0);
    expect(yawFromDir(f.x, f.z)).toBeCloseTo(0);
    const f2 = forwardInto(vec2(), 1.2);
    expect(yawFromDir(f2.x, f2.z)).toBeCloseTo(1.2);
  });

  it('wrapAngle deja los ángulos en (-π, π]', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(0.5)).toBeCloseTo(0.5);
  });

  it('damp no depende de los FPS', () => {
    let a = 0;
    let b = 0;
    for (let i = 0; i < 30; i++) a = damp(a, 10, 5, 1 / 30);
    for (let i = 0; i < 144; i++) b = damp(b, 10, 5, 1 / 144);
    expect(a).toBeCloseTo(b, 6);
  });

  it('círculo contra rectángulo: contacto lateral, sin contacto y centro dentro', () => {
    const rect = { minX: 0, minZ: 0, maxX: 2, maxZ: 2 };
    const p = pen();
    expect(circleRectPenetration(-0.3, 1, 0.5, rect, p)).toBe(true);
    expect(p.nx).toBeCloseTo(-1);
    expect(p.depth).toBeCloseTo(0.2);
    expect(circleRectPenetration(-0.6, 1, 0.5, rect, p)).toBe(false);
    expect(circleRectPenetration(1.9, 1, 0.5, rect, p)).toBe(true);
    expect(p.nx).toBe(1);
    expect(p.depth).toBeCloseTo(0.6);
  });

  it('círculo contra círculo, incluido el caso de centros coincidentes', () => {
    const p = pen();
    expect(circleCirclePenetration(1.5, 0, 0.5, { x: 0, z: 0, r: 1.2 }, p)).toBe(true);
    expect(p.nx).toBeCloseTo(1);
    expect(p.depth).toBeCloseTo(0.2);
    expect(circleCirclePenetration(0, 0, 0.5, { x: 0, z: 0, r: 1 }, p)).toBe(true);
    expect(p.nx).toBe(1);
    expect(circleCirclePenetration(3, 0, 0.5, { x: 0, z: 0, r: 1 }, p)).toBe(false);
  });

  it('segmento contra círculo', () => {
    expect(segmentCircleT(-5, 0, 5, 0, 0, 0, 1)).toBeCloseTo(0.4);
    expect(segmentCircleT(-5, 3, 5, 3, 0, 0, 1)).toBe(-1);
    expect(segmentCircleT(0, 0, 5, 0, 0, 0, 1)).toBe(0);
    expect(segmentCircleT(-5, 0, -3, 0, 0, 0, 1)).toBe(-1);
  });

  it('segmento contra rectángulo, también un segmento largo que cruza una pared delgada', () => {
    const wall = { minX: 0, minZ: -10, maxX: 0.1, maxZ: 10 };
    expect(segmentRectT(-50, 0, 50, 0, wall, 0)).toBeCloseTo(0.5);
    expect(segmentRectT(-50, 0, -1, 0, wall, 0)).toBe(-1);
    expect(segmentRectT(0.05, 0, 5, 0, wall, 0)).toBe(0);
    expect(segmentRectT(-1, 11, 1, 11, wall, 0)).toBe(-1);
    expect(segmentRectT(-1, 10.2, 1, 10.2, wall, 0.3)).toBeGreaterThan(0);
  });
});
