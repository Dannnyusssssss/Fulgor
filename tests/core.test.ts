import { describe, expect, it } from 'vitest';
import { FixedTimestep } from '../src/core/loop';
import { Rng, createStreams, deriveSeed } from '../src/core/rng';
import { Pool, type Poolable } from '../src/core/pool';
import { SpatialHash } from '../src/core/spatial-hash';
import { parseDebugParams } from '../src/core/url-params';

describe('FixedTimestep', () => {
  it('simula un paso por cada 1/60 s acumulado', () => {
    const ts = new FixedTimestep(1 / 60, 0.25);
    expect(ts.advance(1 / 120)).toBe(0);
    expect(ts.advance(1 / 120)).toBe(1);
    expect(ts.advance(3 / 60)).toBe(3);
  });

  it('da el mismo número de pasos con 30 o 144 FPS', () => {
    const a = new FixedTimestep(1 / 60, 0.25);
    const b = new FixedTimestep(1 / 60, 0.25);
    let stepsA = 0;
    let stepsB = 0;
    for (let i = 0; i < 30; i++) stepsA += a.advance(1 / 30);
    for (let i = 0; i < 144; i++) stepsB += b.advance(1 / 144);
    expect(stepsA).toBe(60);
    expect(Math.abs(stepsB - 60)).toBeLessThanOrEqual(1);
  });

  it('recorta los frames largos para no entrar en espiral', () => {
    const ts = new FixedTimestep(1 / 60, 0.25);
    expect(ts.advance(5)).toBe(15);
  });

  it('ignora tiempos inválidos y calcula alpha', () => {
    const ts = new FixedTimestep(1 / 60, 0.25);
    expect(ts.advance(Number.NaN)).toBe(0);
    expect(ts.advance(-1)).toBe(0);
    ts.advance(1 / 120);
    expect(ts.alpha).toBeCloseTo(0.5, 5);
    ts.reset();
    expect(ts.alpha).toBe(0);
  });
});

describe('Rng', () => {
  it('es reproducible con la misma semilla', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('cambia con otra semilla', () => {
    expect(new Rng(1).next()).not.toBe(new Rng(2).next());
  });

  it('respeta los rangos', () => {
    const r = new Rng(7);
    for (let i = 0; i < 2000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      const n = r.int(2, 5);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(5);
      expect(Number.isInteger(n)).toBe(true);
    }
  });

  it('los flujos derivados son independientes: consumir uno no altera los otros', () => {
    const s1 = createStreams(99);
    const s2 = createStreams(99);
    for (let i = 0; i < 500; i++) s1.combat.next();
    for (let i = 0; i < 20; i++) expect(s1.waves.next()).toBe(s2.waves.next());
    expect(s1.perks.getState()).toEqual(s2.perks.getState());
  });

  it('cada flujo tiene una semilla distinta', () => {
    expect(deriveSeed(5, 'waves')).not.toBe(deriveSeed(5, 'combat'));
    expect(deriveSeed(5, 'waves')).not.toBe(deriveSeed(6, 'waves'));
  });
});

interface Item extends Poolable {
  value: number;
}

describe('Pool', () => {
  const make = (n: number): Pool<Item> =>
    new Pool<Item>(n, (index) => ({ active: false, index, value: 0 }));

  it('entrega índices bajos primero y se llena', () => {
    const pool = make(3);
    expect(pool.acquire()?.index).toBe(0);
    expect(pool.acquire()?.index).toBe(1);
    expect(pool.acquire()?.index).toBe(2);
    expect(pool.acquire()).toBeNull();
    expect(pool.activeCount).toBe(3);
  });

  it('reutiliza objetos liberados y no se corrompe con una doble liberación', () => {
    const pool = make(2);
    const a = pool.acquire();
    expect(a).not.toBeNull();
    if (!a) return;
    pool.release(a);
    pool.release(a);
    expect(pool.activeCount).toBe(0);
    expect(pool.acquire()).toBe(a);
    expect(pool.acquire()).not.toBe(a);
    expect(pool.acquire()).toBeNull();
  });

  it('clear libera todo', () => {
    const pool = make(4);
    pool.acquire();
    pool.acquire();
    pool.clear();
    expect(pool.activeCount).toBe(0);
    expect(pool.items.every((i) => !i.active)).toBe(true);
  });
});

describe('SpatialHash', () => {
  it('encuentra elementos cercanos y no los lejanos', () => {
    const hash = new SpatialHash(-20, -20, 40, 40, 2, 16);
    hash.insert(0, 0, 0, 0.5);
    hash.insert(1, 10, 10, 0.5);
    hash.insert(2, 1, 1, 0.5);
    const out: number[] = [];
    const n = hash.query(0, 0, 1.5, out);
    const found = out.slice(0, n).sort();
    expect(found).toContain(0);
    expect(found).toContain(2);
    expect(found).not.toContain(1);
  });

  it('no devuelve duplicados aunque un elemento ocupe varias celdas', () => {
    const hash = new SpatialHash(-10, -10, 20, 20, 1, 4);
    hash.insert(3, 0, 0, 3);
    const out: number[] = [];
    expect(hash.query(0, 0, 3, out)).toBe(1);
  });

  it('clear vacía la rejilla y los rectángulos cubren su área', () => {
    const hash = new SpatialHash(-10, -10, 20, 20, 1, 4);
    hash.insertBox(1, -5, -1, 5, 1);
    const out: number[] = [];
    expect(hash.query(4.5, 0, 0.1, out)).toBe(1);
    hash.clear();
    expect(hash.query(4.5, 0, 0.1, out)).toBe(0);
  });

  it('rechaza índices fuera de rango y recorta posiciones fuera del área', () => {
    const hash = new SpatialHash(0, 0, 10, 10, 1, 2);
    expect(hash.insert(5, 1, 1, 0.1)).toBe(false);
    expect(hash.insert(0, 100, 100, 0.1)).toBe(true);
    const out: number[] = [];
    expect(hash.query(9.9, 9.9, 0.1, out)).toBe(1);
  });
});

describe('parseDebugParams', () => {
  it('lee debug y god', () => {
    const off = {
      debug: false,
      god: false,
      stress: false,
      arena: null,
      wave: null,
      endless: false,
    };
    expect(parseDebugParams('?debug')).toEqual({ ...off, debug: true });
    expect(parseDebugParams('?debug=1&god=true')).toEqual({ ...off, debug: true, god: true });
    expect(parseDebugParams('?arena=jardin-cristal&wave=10&stress')).toEqual({
      ...off,
      stress: true,
      arena: 'jardin-cristal',
      wave: 10,
    });
    // Resistencia: ?mode=resistencia y oleada inicial de hasta 99.
    expect(parseDebugParams('?mode=resistencia&wave=42')).toEqual({
      ...off,
      endless: true,
      wave: 42,
    });
  });

  it('ignora valores desconocidos, cadenas vacías y cadenas demasiado largas', () => {
    const off = {
      debug: false,
      god: false,
      stress: false,
      arena: null,
      wave: null,
      endless: false,
    };
    expect(parseDebugParams('?debug=no&god=2')).toEqual(off);
    expect(parseDebugParams('')).toEqual(off);
    expect(parseDebugParams('?debug&x=' + 'a'.repeat(300))).toEqual(off);
    expect(parseDebugParams('?<script>')).toEqual(off);
    expect(parseDebugParams('?arena=../x&wave=100')).toEqual(off);
    expect(parseDebugParams('?wave=05&mode=oleadas')).toEqual(off);
    expect(parseDebugParams('?wave=0')).toEqual(off);
    expect(parseDebugParams('?wave=3.5&arena=A')).toEqual(off);
  });
});
