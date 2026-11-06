import { describe, expect, it } from 'vitest';
import { emptyCommand } from '../src/core/input';
import { ARENAS } from '../src/data/arenas';
import { DIFFICULTY_ORDER } from '../src/data/difficulty';
import { createWorld } from '../src/game/world';
import { stepWorld } from '../src/game/world';
import { botCommand } from './bot';

/** Tope de tiempo de juego por partida (si se supera, la arena se considera no superable). */
const MAX_SECONDS = 60 * 20;

/**
 * Superabilidad: el jugador automático simple completa las 10 oleadas de cada arena en cada dificultad.
 * Se prueban dos semillas por combinación.
 */
describe('cada arena es superable en todas las dificultades', () => {
  for (const arena of ARENAS) {
    for (const difficulty of DIFFICULTY_ORDER) {
      it(`${arena.id} · ${difficulty}`, { timeout: 120000 }, () => {
        for (const seed of [11, 2026]) {
          const w = createWorld({ seed, arena, difficulty });
          const cmd = emptyCommand();
          const maxSteps = MAX_SECONDS * 60;
          for (let i = 0; i < maxSteps && !w.victory && !w.defeated; i++) {
            stepWorld(w, botCommand(w, cmd));
            w.events.clear();
          }
          const summary = `semilla ${seed}: oleada ${w.director.wave}, vida ${w.player.health.toFixed(0)}, t=${w.time.toFixed(0)}s`;
          expect(w.defeated, summary).toBe(false);
          expect(w.victory, summary).toBe(true);
        }
      });
    }
  }
});
