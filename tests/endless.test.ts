import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { emptyCommand } from '../src/core/input';
import { ARENAS } from '../src/data/arenas';
import { BALANCE } from '../src/data/balance';
import { DIFFICULTIES, DIFFICULTY_ORDER } from '../src/data/difficulty';
import { composeWave, DirectorPhase, MAX_WAVE_SIZE } from '../src/game/director';
import {
  endlessBossHealth,
  endlessBudget,
  endlessWaveDef,
  isEndlessBossWave,
} from '../src/game/endless';
import { EnemyKind } from '../src/game/enemies/types';
import { GameEvent } from '../src/game/events';
import { createTuning } from '../src/game/tuning';
import { createWorld, stepWorld, worldFingerprint } from '../src/game/world';
import {
  bestEndlessFor,
  isEndlessUnlocked,
  recordEndlessRun,
  recordRun,
} from '../src/save/progress';
import { defaultSave, parseSave, serializeSave } from '../src/save/schema';
import { botCommand } from './bot';

const E = BALANCE.endless;
const HANGAR = ARENAS[0];

describe('curva de Resistencia', () => {
  it('el presupuesto crece y se detiene en el tope', () => {
    let prev = 0;
    for (let n = 1; n <= 200; n++) {
      const b = endlessBudget(n);
      expect(b).toBeGreaterThanOrEqual(prev);
      expect(b).toBeLessThanOrEqual(E.maxBudget);
      prev = b;
    }
    expect(endlessBudget(1)).toBe(E.baseBudget);
    expect(endlessBudget(200)).toBe(E.maxBudget);
  });

  it('el Coloso sale cada 10 oleadas y solo entonces', () => {
    for (let n = 1; n <= 60; n++) {
      const def = endlessWaveDef(n);
      const boss = n % E.bossEvery === 0;
      expect(isEndlessBossWave(n), `oleada ${n}`).toBe(boss);
      expect(def.boss === true, `oleada ${n}`).toBe(boss);
      expect((def.required?.coloso ?? 0) > 0, `oleada ${n}`).toBe(boss);
      expect(def.weights.coloso ?? 0).toBe(0);
    }
  });

  it('la vida del Coloso sube en cada aparición, con tope', () => {
    expect(endlessBossHealth(10)).toBe(1);
    expect(endlessBossHealth(20)).toBeCloseTo(1 + E.bossHealthPerCycle);
    expect(endlessBossHealth(30)).toBeGreaterThan(endlessBossHealth(20));
    expect(endlessBossHealth(10000)).toBe(E.bossHealthMax);
  });

  it('las primeras oleadas presentan los tipos poco a poco', () => {
    expect(Object.keys(endlessWaveDef(1).weights)).toEqual(['zumbador']);
    expect(endlessWaveDef(E.introWave.reparador).weights.reparador).toBeGreaterThan(0);
    expect(endlessWaveDef(E.introWave.reparador - 1).weights.reparador ?? 0).toBe(0);
  });

  it('ninguna composición supera la cola del director ni los máximos por tipo, en ninguna dificultad', () => {
    const tuning = createTuning();
    const out = new Uint8Array(MAX_WAVE_SIZE);
    for (const d of DIFFICULTY_ORDER) {
      const rng = new Rng(7);
      for (let n = 1; n <= 120; n++) {
        const def = endlessWaveDef(n);
        const len = composeWave(def, DIFFICULTIES[d].budgetMultiplier, tuning, rng, out);
        expect(len).toBeLessThanOrEqual(MAX_WAVE_SIZE);
        // Con el tope de presupuesto, la oleada cabe sin recortes.
        expect(Math.round(E.maxBudget * DIFFICULTIES[d].budgetMultiplier)).toBeLessThan(
          MAX_WAVE_SIZE,
        );
        const kinds = [...out.slice(0, len)];
        const countOf = (k: number): number => kinds.filter((x) => x === k).length;
        expect(countOf(EnemyKind.Blindado)).toBeLessThanOrEqual(E.limits.blindado.cap);
        expect(countOf(EnemyKind.Reparador)).toBeLessThanOrEqual(E.limits.reparador.cap);
        expect(countOf(EnemyKind.Vigia)).toBeLessThanOrEqual(E.limits.vigia.cap);
        expect(countOf(EnemyKind.Coloso)).toBe(isEndlessBossWave(n) ? 1 : 0);
        if (isEndlessBossWave(n)) expect(out[0]).toBe(EnemyKind.Coloso);
      }
    }
  });
});

describe('mundo en Resistencia', () => {
  if (HANGAR === undefined) throw new Error('sin arenas');

  it(
    'pasa de la oleada 10 sin victoria y respeta el tope de enemigos vivos',
    { timeout: 120000 },
    () => {
      // Invulnerable: este test comprueba el director, no la supervivencia.
      const w = createWorld({
        seed: 5,
        arena: HANGAR,
        mode: 'endless',
        god: true,
        difficulty: 'hard',
      });
      const cmd = emptyCommand();
      let bossSpawns = 0;
      let maxAlive = 0;
      for (let i = 0; i < 60 * 60 * 25 && w.director.wave < 12; i++) {
        stepWorld(w, botCommand(w, cmd));
        maxAlive = Math.max(maxAlive, w.enemies.activeCount);
        w.events.drain((e) => {
          if (e.type === GameEvent.EnemySpawn && e.b === EnemyKind.Coloso) bossSpawns++;
        });
      }
      expect(w.director.wave).toBeGreaterThanOrEqual(12);
      expect(w.victory).toBe(false);
      expect(bossSpawns).toBe(1);
      // El Coloso puede llamar apoyo por encima del tope del director, pero con su propio tope.
      expect(maxAlive).toBeLessThanOrEqual(w.diff.maxAlive + 4);
    },
  );

  it('la oleada 20 lleva un Coloso con más vida que el de la oleada 10', () => {
    const vida = (wave: number): number => {
      const w = createWorld({
        seed: 1,
        arena: HANGAR,
        mode: 'endless',
        startWave: wave,
        god: true,
      });
      for (let i = 0; i < 60 * 10; i++) {
        stepWorld(w, emptyCommand());
        for (const e of w.enemies.items)
          if (e.active && e.kind === EnemyKind.Coloso) return e.maxHealth;
      }
      return 0;
    };
    const v10 = vida(10);
    expect(v10).toBeGreaterThan(0);
    expect(vida(20)).toBeCloseTo(v10 * endlessBossHealth(20));
  });

  it('misma semilla y mismas órdenes, mismo estado', () => {
    const run = (): string => {
      const w = createWorld({ seed: 99, arena: HANGAR, mode: 'endless', startWave: 14 });
      const cmd = emptyCommand();
      for (let i = 0; i < 60 * 40; i++) {
        stepWorld(w, botCommand(w, cmd));
        w.events.clear();
      }
      return worldFingerprint(w);
    };
    expect(run()).toBe(run());
  });

  it('en el modo Oleadas la oleada inicial se limita a la última de la arena', () => {
    const w = createWorld({ seed: 1, arena: HANGAR, startWave: 40 });
    expect(w.director.wave).toBe(BALANCE.director.wavesPerArena - 1);
    const e = createWorld({ seed: 1, arena: HANGAR, mode: 'endless', startWave: 40 });
    expect(e.director.wave).toBe(39);
    expect(e.director.phase).toBe(DirectorPhase.Rest);
  });

  /**
   * El jugador automático supera la primera oleada del Coloso en cada arena, sin quedarse atascado.
   * Jardín de Cristal en Fácil con la semilla 11 es la regresión de un Reparador solitario que huía sin fin.
   */
  for (const arena of ARENAS) {
    for (const difficulty of ['easy', 'normal'] as const) {
      it(
        `el jugador automático pasa la oleada 10 · ${arena.id} · ${difficulty}`,
        { timeout: 180000 },
        () => {
          const w = createWorld({ seed: 11, arena, mode: 'endless', difficulty });
          const cmd = emptyCommand();
          // Tope de 15 minutos de juego para 11 oleadas: si se supera, alguna oleada se quedó atascada.
          for (let i = 0; i < 60 * 60 * 15 && !w.defeated && w.director.wave < 11; i++) {
            stepWorld(w, botCommand(w, cmd));
            w.events.clear();
          }
          const summary = `oleada ${w.director.wave}, t=${w.time.toFixed(0)}s, derrota ${w.defeated}`;
          expect(w.director.wave, summary).toBeGreaterThanOrEqual(11);
        },
      );
    }
  }
});

describe('progreso de Resistencia', () => {
  it('se desbloquea al completar la arena en Oleadas, en cualquier dificultad', () => {
    const s = defaultSave(false);
    expect(isEndlessUnlocked(s, 'hangar-cobalto')).toBe(false);
    recordRun(s, 'hangar-cobalto', 'easy', 100, false, 6);
    expect(isEndlessUnlocked(s, 'hangar-cobalto')).toBe(false);
    recordRun(s, 'hangar-cobalto', 'easy', 100, true, 10);
    expect(isEndlessUnlocked(s, 'hangar-cobalto')).toBe(true);
    expect(isEndlessUnlocked(s, 'fundicion-ambar')).toBe(false);
  });

  it('guarda la mejor puntuación y la mejor oleada por separado', () => {
    const s = defaultSave(false);
    let r = recordEndlessRun(s, 'hangar-cobalto', 'normal', 5000, 14);
    expect(r).toMatchObject({ newRecord: true, best: 5000, bestWave: 14 });
    // Menos puntos pero más oleadas: la oleada sube, la puntuación no.
    r = recordEndlessRun(s, 'hangar-cobalto', 'normal', 3000, 16);
    expect(r).toMatchObject({ newRecord: false, best: 5000, bestWave: 16 });
    expect(bestEndlessFor(s, 'hangar-cobalto', 'normal')).toEqual({ points: 5000, wave: 16 });
    expect(bestEndlessFor(s, 'hangar-cobalto', 'hard')).toEqual({ points: 0, wave: 0 });
    // No cuenta como arena completada ni toca las marcas del modo Oleadas.
    expect(s.progress.completed).toEqual([]);
    expect(s.best).toEqual({});
  });

  it('ida y vuelta, guardado antiguo y datos corruptos', () => {
    const s = defaultSave(false);
    s.progress.lastMode = 'endless';
    s.bestEndless['jardin-cristal:hard'] = 777;
    s.bestEndlessWave['jardin-cristal:hard'] = 23;
    expect(parseSave(serializeSave(s), false)).toEqual(s);

    // Guardado del Hito 3 (sin campos de Resistencia): valores por defecto.
    const old = JSON.parse(serializeSave(defaultSave(false))) as Record<string, unknown>;
    delete old['bestEndless'];
    delete old['bestEndlessWave'];
    delete (old['progress'] as Record<string, unknown>)['lastMode'];
    const a = parseSave(JSON.stringify(old), false);
    expect(a.progress.lastMode).toBe('waves');
    expect(a.bestEndless).toEqual({});

    // Corrupto: claves y valores inválidos se descartan uno a uno.
    const bad = JSON.parse(serializeSave(defaultSave(false))) as Record<string, unknown>;
    bad['bestEndless'] = {
      'hangar-cobalto:normal': 1200.7,
      'hangar-cobalto:imposible': 5,
      '../x:normal': 5,
      'fundicion-ambar:easy': -3,
      'jardin-cristal:hard': Number.MAX_VALUE,
    };
    bad['bestEndlessWave'] = { 'hangar-cobalto:normal': 'veinte', 'fundicion-ambar:easy': 9 };
    (bad['progress'] as Record<string, unknown>)['lastMode'] = 'infinito';
    const b = parseSave(JSON.stringify(bad), false);
    expect(b.bestEndless).toEqual({ 'hangar-cobalto:normal': 1200 });
    expect(b.bestEndlessWave).toEqual({ 'fundicion-ambar:easy': 9 });
    expect(b.progress.lastMode).toBe('waves');
  });
});
