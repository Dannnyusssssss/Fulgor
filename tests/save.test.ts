import { describe, expect, it } from 'vitest';
import { META } from '../src/data/meta';
import { recordRun, bestFor, isUnlocked } from '../src/save/progress';
import { defaultSave, parseSave, serializeSave } from '../src/save/schema';
import { loadSave, writeSave, type StorageLike } from '../src/save/storage';

class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

describe('guardado', () => {
  it('sin datos usa los valores por defecto, según prefers-reduced-motion', () => {
    const a = parseSave(null, false);
    expect(a.settings.reduceFlashes).toBe(false);
    expect(a.settings.reduceMotion).toBe(false);
    const b = parseSave(null, true);
    expect(b.settings.reduceFlashes).toBe(true);
    expect(b.settings.reduceMotion).toBe(true);
    expect(b.progress.unlockedArenas).toContain('hangar-cobalto');
  });

  it('ida y vuelta sin pérdidas', () => {
    const s = defaultSave(false);
    s.settings.fov = 90;
    s.settings.quality = 'high';
    s.settings.muted = true;
    s.best['hangar-cobalto:hard'] = 1200;
    s.progress.completed.push('hangar-cobalto:easy');
    s.progress.lastArena = 'fundicion-ambar';
    s.progress.lastDifficulty = 'hard';
    s.lastSeed = 123456;
    expect(parseSave(serializeSave(s), false)).toEqual(s);
  });

  it('un guardado corrupto no rompe nada', () => {
    for (const bad of ['{', 'null', '[]', '42', '"texto"', '{"settings": 5}', 'x'.repeat(100000)]) {
      expect(parseSave(bad, false)).toEqual(defaultSave(false));
    }
  });

  it('valida campo por campo: tipos, rangos y valores no finitos', () => {
    const raw = JSON.stringify({
      settings: {
        muted: 'sí',
        reduceFlashes: true,
        sensitivity: 1e9,
        fov: 75.5,
        quality: 'ultra',
        invertY: 1,
      },
      best: { 'hangar-cobalto': -5, '<script>': 10, 'otra-arena': 300.7 },
      progress: { unlockedArenas: ['hangar-cobalto', 7, 'fundicion-ambar', '../x'] },
      lastSeed: 1.5,
    });
    const s = parseSave(raw, false);
    expect(s.settings.muted).toBe(false);
    expect(s.settings.reduceFlashes).toBe(true);
    expect(s.settings.sensitivity).toBe(1);
    expect(s.settings.fov).toBe(75.5);
    expect(s.settings.quality).toBe('medium');
    expect(s.settings.invertY).toBe(false);
    // Las claves sin dificultad (formato del Hito 1) se migran a Normal.
    expect(s.best).toEqual({ 'otra-arena:normal': 300 });
    expect(s.progress.unlockedArenas).toEqual(['hangar-cobalto', 'fundicion-ambar']);
    expect(s.lastSeed).toBeNull();
  });

  it('un valor no finito (escrito como texto) se rechaza', () => {
    const s = parseSave('{"settings":{"fov":1e400}}', false);
    expect(s.settings.fov).toBe(defaultSave(false).settings.fov);
  });

  it('usa una sola clave con el prefijo del juego', () => {
    const mem = new MemoryStorage();
    const s = defaultSave(false);
    expect(writeSave(mem, s)).toBe(true);
    expect([...mem.data.keys()]).toEqual([META.saveKey]);
    expect(META.saveKey.startsWith('fulgor:')).toBe(true);
    expect(loadSave(mem, false)).toEqual(s);
  });

  it('tolera almacenamiento ausente, acceso denegado y cuota llena', () => {
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(loadSave(null, false)).toEqual(defaultSave(false));
    expect(loadSave(throwing, false)).toEqual(defaultSave(false));
    expect(writeSave(null, defaultSave(false))).toBe(false);
    expect(writeSave(throwing, defaultSave(false))).toBe(false);
  });

  it('migra un guardado real del Hito 1 conservando ajustes y marca', () => {
    const old = JSON.stringify({
      version: 1,
      settings: {
        muted: true,
        reduceFlashes: true,
        reduceMotion: false,
        sensitivity: 1.4,
        invertY: false,
        fov: 80,
        quality: 'low',
      },
      progress: { unlockedArenas: ['hangar-cobalto'] },
      best: { 'hangar-cobalto': 2500 },
      lastSeed: 42,
    });
    const s = parseSave(old, false);
    expect(s.settings.muted).toBe(true);
    expect(s.settings.fov).toBe(80);
    expect(s.best).toEqual({ 'hangar-cobalto:normal': 2500 });
    expect(s.progress.completed).toEqual([]);
    expect(s.progress.lastDifficulty).toBe('normal');
    expect(s.lastSeed).toBe(42);
  });

  it('valida las claves de progreso y la última dificultad', () => {
    const s = parseSave(
      JSON.stringify({
        progress: {
          completed: ['hangar-cobalto:easy', 'hangar-cobalto:ultra', 5, 'x:normal:hard'],
          lastArena: '../../',
          lastDifficulty: 'imposible',
        },
        best: { 'hangar-cobalto:hard': 10, 'hangar-cobalto:ultra': 99 },
      }),
      false,
    );
    expect(s.progress.completed).toEqual(['hangar-cobalto:easy']);
    expect(s.progress.lastArena).toBe('hangar-cobalto');
    expect(s.progress.lastDifficulty).toBe('normal');
    expect(s.best).toEqual({ 'hangar-cobalto:hard': 10 });
  });
});

describe('progreso', () => {
  it('mejor marca por arena y dificultad, y nuevo récord', () => {
    const s = defaultSave(false);
    expect(recordRun(s, 'hangar-cobalto', 'normal', 500, false)).toEqual({
      newRecord: true,
      best: 500,
      unlocked: null,
    });
    expect(recordRun(s, 'hangar-cobalto', 'normal', 300, false).newRecord).toBe(false);
    expect(bestFor(s, 'hangar-cobalto', 'normal')).toBe(500);
    expect(bestFor(s, 'hangar-cobalto', 'hard')).toBe(0);
  });

  it('completar una arena en cualquier dificultad desbloquea la siguiente, una sola vez', () => {
    const s = defaultSave(false);
    expect(isUnlocked(s, 'fundicion-ambar')).toBe(false);
    expect(recordRun(s, 'hangar-cobalto', 'normal', 100, false).unlocked).toBeNull();
    expect(recordRun(s, 'hangar-cobalto', 'easy', 100, true).unlocked).toBe('fundicion-ambar');
    expect(isUnlocked(s, 'fundicion-ambar')).toBe(true);
    expect(recordRun(s, 'hangar-cobalto', 'hard', 100, true).unlocked).toBeNull();
    expect(recordRun(s, 'fundicion-ambar', 'normal', 100, true).unlocked).toBe('jardin-cristal');
    expect(recordRun(s, 'jardin-cristal', 'normal', 100, true).unlocked).toBeNull();
    expect(s.progress.completed).toContain('hangar-cobalto:easy');
    // El progreso sobrevive a guardar y cargar.
    expect(parseSave(serializeSave(s), false)).toEqual(s);
  });
});
