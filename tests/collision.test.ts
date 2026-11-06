import { describe, expect, it } from 'vitest';
import { vec2 } from '../src/core/math';
import { ARENAS, HANGAR_COBALTO } from '../src/data/arenas';
import { BALANCE } from '../src/data/balance';
import { createArena } from '../src/game/arena';
import { hasLineOfSight, isCircleFree, moveCircle, sweepObstacles } from '../src/game/collision';

const arena = createArena(HANGAR_COBALTO);

describe('moveCircle', () => {
  it('se mueve libremente donde no hay obstáculos', () => {
    const p = vec2(0, 4);
    expect(moveCircle(arena, p, 0.45, 1, 0)).toBe(false);
    expect(p.x).toBeCloseTo(1);
    expect(p.z).toBeCloseTo(4);
  });

  it('se detiene contra una caja y desliza a lo largo de ella', () => {
    // Caja en (-8, -8) de 4 × 1.2: cara norte en z = -7.4. Nos acercamos en diagonal.
    const p = vec2(-8, -6.5);
    moveCircle(arena, p, 0.45, 0.6, -1.0);
    expect(p.z).toBeGreaterThanOrEqual(-7.4 + 0.45 - 1e-3);
    // Conserva la componente tangente: avanzó en x.
    expect(p.x).toBeGreaterThan(-8 + 0.5);
  });

  it('no atraviesa una cobertura ni a muy alta velocidad', () => {
    // Columna en (4.5, 0) de radio 0.9. Un salto de 20 m en un solo paso.
    const p = vec2(4.5, 6);
    moveCircle(arena, p, 0.45, 0, -20);
    expect(p.z).toBeGreaterThan(0.9);
  });

  it('nunca sale de las paredes exteriores', () => {
    const p = vec2(0, 4);
    moveCircle(arena, p, 0.45, 500, 500);
    expect(p.x).toBeLessThanOrEqual(18 - 0.45 + 1e-6);
    expect(p.z).toBeLessThanOrEqual(18 - 0.45 + 1e-6);
  });

  it('desliza sobre la esquina sin quedarse atascado ni cruzarla', () => {
    const p = vec2(-10.3, -6.5);
    for (let i = 0; i < 60; i++) moveCircle(arena, p, 0.45, 0, -0.1);
    // O bien rodeó la esquina (x < -10 - r) o bien sigue al norte de la caja.
    const insideBox = p.x > -10 && p.x < -6 && p.z > -8.6 && p.z < -7.4;
    expect(insideBox).toBe(false);
  });
});

describe('colisión continua', () => {
  it('un proyectil a 200 m/s no atraviesa una pared delgada', () => {
    // Un paso de 1/60 s a 200 m/s recorre 3.3 m; la caja tiene 1.2 m de fondo.
    const t = sweepObstacles(arena, -8, -4, -8, -4 - 200 / 60, 0.1);
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThan(1);
    const hitZ = -4 + t * (-200 / 60);
    expect(hitZ).toBeCloseTo(-7.4 + 0.1, 3);
  });

  it('un proyectil no atraviesa la pared exterior aunque cruce más de su grosor en un paso', () => {
    const t = sweepObstacles(arena, 0, 17, 0, 25, 0.1);
    expect(t).toBeGreaterThan(0);
    expect(17 + t * 8).toBeCloseTo(18 - 0.1, 3);
  });

  it('el camino libre devuelve -1', () => {
    expect(sweepObstacles(arena, 0, 4, 0, 6, 0.1)).toBe(-1);
  });

  it('las coberturas bajas no tapan la cámara pero las columnas sí', () => {
    // Por encima de la caja baja (1.4 m): la cámara a 1.6 m pasa.
    expect(sweepObstacles(arena, -8, -6, -8, -10, 0.3, 1.6)).toBe(-1);
    expect(sweepObstacles(arena, 4.5, 3, 4.5, -3, 0.3, 1.6)).toBeGreaterThan(0);
  });

  it('línea de visión', () => {
    expect(hasLineOfSight(arena, 0, 4, 0, 8, 0.5)).toBe(true);
    expect(hasLineOfSight(arena, 4.5, 3, 4.5, -3, 0.5)).toBe(false);
  });
});

describe('datos de arenas', () => {
  for (const def of ARENAS) {
    const a = createArena(def);
    it(`${def.id}: el jugador y las apariciones no están dentro de paredes ni coberturas`, () => {
      expect(isCircleFree(a, def.playerSpawn.x, def.playerSpawn.z, BALANCE.player.radius)).toBe(
        true,
      );
      for (const s of def.enemySpawns) expect(isCircleFree(a, s.x, s.z, 0.6)).toBe(true);
    });

    it(`${def.id}: las coberturas están dentro del área jugable`, () => {
      for (const c of def.covers) {
        expect(Math.abs(c.x)).toBeLessThan(def.width / 2);
        expect(Math.abs(c.z)).toBeLessThan(def.depth / 2);
      }
    });
  }
});
