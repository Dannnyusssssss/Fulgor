/**
 * Formato del guardado (clave única `fulgor:v1`) y su validación campo por campo.
 * Cualquier dato ausente, de otro tipo o fuera de rango se reemplaza por el valor por defecto.
 */
import { BALANCE, type Quality } from '../data/balance';
import { META } from '../data/meta';

export interface Settings {
  muted: boolean;
  reduceFlashes: boolean;
  reduceMotion: boolean;
  sensitivity: number;
  invertY: boolean;
  fov: number;
  quality: Quality;
}

export interface SaveData {
  version: number;
  settings: Settings;
  progress: {
    unlockedArenas: string[];
  };
  /** Mejores puntuaciones por arena. */
  best: Record<string, number>;
  /** Última semilla usada (32 bits sin signo) o null. */
  lastSeed: number | null;
}

/** Tope de tamaño del texto guardado que se acepta leer (evita procesar datos enormes o maliciosos). */
export const MAX_SAVE_LENGTH = 64 * 1024;
const MAX_ID_LENGTH = 40;
const MAX_ARENAS = 32;
const MAX_SCORE = 1e9;
const ID_PATTERN = /^[a-z0-9-]+$/;

export function defaultSettings(prefersReducedMotion: boolean): Settings {
  return {
    muted: false,
    reduceFlashes: prefersReducedMotion,
    reduceMotion: prefersReducedMotion,
    sensitivity: BALANCE.camera.sensitivityDefault,
    invertY: false,
    fov: BALANCE.camera.fovDefault,
    quality: 'medium',
  };
}

export function defaultSave(prefersReducedMotion: boolean): SaveData {
  return {
    version: META.saveVersion,
    settings: defaultSettings(prefersReducedMotion),
    progress: { unlockedArenas: ['hangar-cobalto'] },
    best: {},
    lastSeed: null,
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function num(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : fallback;
}

function isId(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= MAX_ID_LENGTH && ID_PATTERN.test(v);
}

export function parseSettings(raw: unknown, prefersReducedMotion: boolean): Settings {
  const d = defaultSettings(prefersReducedMotion);
  if (!isRecord(raw)) return d;
  const cam = BALANCE.camera;
  const q = raw['quality'];
  return {
    muted: bool(raw['muted'], d.muted),
    reduceFlashes: bool(raw['reduceFlashes'], d.reduceFlashes),
    reduceMotion: bool(raw['reduceMotion'], d.reduceMotion),
    sensitivity: num(raw['sensitivity'], cam.sensitivityMin, cam.sensitivityMax, d.sensitivity),
    invertY: bool(raw['invertY'], d.invertY),
    fov: num(raw['fov'], cam.fovMin, cam.fovMax, d.fov),
    quality: q === 'low' || q === 'medium' || q === 'high' ? q : d.quality,
  };
}

/** Lee un guardado desde texto. Nunca lanza: si el texto está corrupto devuelve los valores por defecto. */
export function parseSave(text: string | null, prefersReducedMotion: boolean): SaveData {
  const d = defaultSave(prefersReducedMotion);
  if (typeof text !== 'string' || text.length === 0 || text.length > MAX_SAVE_LENGTH) return d;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return d;
  }
  if (!isRecord(raw)) return d;

  const unlocked: string[] = [...d.progress.unlockedArenas];
  const progress = raw['progress'];
  if (isRecord(progress) && Array.isArray(progress['unlockedArenas'])) {
    for (const id of progress['unlockedArenas'].slice(0, MAX_ARENAS)) {
      if (isId(id) && !unlocked.includes(id)) unlocked.push(id);
    }
  }

  const best: Record<string, number> = {};
  const rawBest = raw['best'];
  if (isRecord(rawBest)) {
    let count = 0;
    for (const [k, v] of Object.entries(rawBest)) {
      if (count >= MAX_ARENAS) break;
      if (!isId(k)) continue;
      const score = num(v, 0, MAX_SCORE, -1);
      if (score >= 0) {
        best[k] = Math.floor(score);
        count++;
      }
    }
  }

  const seed = raw['lastSeed'];
  const lastSeed =
    typeof seed === 'number' && Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff
      ? seed
      : null;

  return {
    version: META.saveVersion,
    settings: parseSettings(raw['settings'], prefersReducedMotion),
    progress: { unlockedArenas: unlocked },
    best,
    lastSeed,
  };
}

export function serializeSave(data: SaveData): string {
  return JSON.stringify(data);
}
