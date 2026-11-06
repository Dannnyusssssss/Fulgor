import { describe, expect, it } from 'vitest';
import { META } from '../src/data/meta';
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
    s.best['hangar-cobalto'] = 1200;
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
    expect(s.best).toEqual({ 'otra-arena': 300 });
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
});
