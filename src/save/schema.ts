/**
 * Formato del guardado (clave única `fulgor:v1`) y su validación campo por campo.
 * Cualquier dato ausente, de otro tipo o fuera de rango se reemplaza por el valor por defecto.
 */
import { isAbilityId, type AbilityId } from '../data/abilities';
import { BALANCE, type Quality } from '../data/balance';
import { isDifficulty, type Difficulty } from '../data/difficulty';
import { META } from '../data/meta';
import { isGameMode, type GameMode } from '../data/modes';
import { isWeaponId, WEAPON_ORDER, WEAPON_UNLOCKS, type WeaponId } from '../data/weapons';

export interface Settings {
  muted: boolean;
  /** Volumen general y de la música (0–1). */
  volume: number;
  musicVolume: number;
  reduceFlashes: boolean;
  reduceMotion: boolean;
  sensitivity: number;
  invertY: boolean;
  fov: number;
  quality: Quality;
  /** Asistencias: apuntado asistido y disparo automático (alternar con una pulsación). */
  aimAssist: boolean;
  autoFire: boolean;
  /** Resolución dinámica y la escala que alcanzó (se guarda para empezar la próxima vez desde ahí). */
  dynamicResolution: boolean;
  renderScale: number;
}

export interface SaveData {
  version: number;
  settings: Settings;
  progress: {
    unlockedArenas: string[];
    /** Arenas completadas, como `arena:dificultad`. */
    completed: string[];
    /** Última arena y dificultad elegidas (para la pantalla de selección). */
    lastArena: string;
    lastDifficulty: Difficulty;
    /** Armas desbloqueadas (el Pulsador siempre). */
    unlockedWeapons: WeaponId[];
    /** Última habilidad elegida. */
    lastAbility: AbilityId;
    /** Último modo elegido (Oleadas o Resistencia). */
    lastMode: GameMode;
  };
  /** Mejores puntuaciones por `arena:dificultad`. */
  best: Record<string, number>;
  /** Modo Resistencia: mejores puntuaciones y mejor oleada alcanzada, por `arena:dificultad`. */
  bestEndless: Record<string, number>;
  bestEndlessWave: Record<string, number>;
  /** Última semilla usada (32 bits sin signo) o null. */
  lastSeed: number | null;
}

/** Tope de tamaño del texto guardado que se acepta leer (evita procesar datos enormes o maliciosos). */
export const MAX_SAVE_LENGTH = 64 * 1024;
const MAX_ID_LENGTH = 40;
const MAX_ARENAS = 32;
const MAX_ENTRIES = MAX_ARENAS * 3;
const MAX_SCORE = 1e9;
/** Oleada más alta que se acepta leer de un guardado (Resistencia). */
const MAX_WAVE = 100000;
const ID_PATTERN = /^[a-z0-9-]+$/;
const RESULT_KEY_PATTERN = /^[a-z0-9-]+:(easy|normal|hard)$/;
export const FIRST_ARENA = 'hangar-cobalto';

/** Clave de marcas y arenas completadas. */
export function resultKey(arena: string, difficulty: Difficulty): string {
  return `${arena}:${difficulty}`;
}

export function defaultSettings(prefersReducedMotion: boolean): Settings {
  return {
    muted: false,
    volume: 0.6,
    musicVolume: 0.6,
    reduceFlashes: prefersReducedMotion,
    reduceMotion: prefersReducedMotion,
    sensitivity: BALANCE.camera.sensitivityDefault,
    invertY: false,
    fov: BALANCE.camera.fovDefault,
    quality: 'medium',
    aimAssist: false,
    autoFire: false,
    dynamicResolution: false,
    renderScale: 1,
  };
}

export function defaultSave(prefersReducedMotion: boolean): SaveData {
  return {
    version: META.saveVersion,
    settings: defaultSettings(prefersReducedMotion),
    progress: {
      unlockedArenas: [FIRST_ARENA],
      completed: [],
      lastArena: FIRST_ARENA,
      lastDifficulty: 'normal',
      unlockedWeapons: ['pulsador'],
      lastAbility: 'onda',
      lastMode: 'waves',
    },
    best: {},
    bestEndless: {},
    bestEndlessWave: {},
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

function isResultKey(v: unknown): v is string {
  return typeof v === 'string' && v.length <= MAX_ID_LENGTH + 8 && RESULT_KEY_PATTERN.test(v);
}

/**
 * Lee un mapa `arena:dificultad` → número entero en [0, max]. Ignora claves con otro formato y valores no válidos,
 * y como mucho acepta MAX_ENTRIES entradas.
 */
function parseResultMap(raw: unknown, max: number): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isRecord(raw)) return out;
  let count = 0;
  for (const [k, v] of Object.entries(raw)) {
    if (count >= MAX_ENTRIES) break;
    if (!isResultKey(k)) continue;
    const n = num(v, 0, max, -1);
    if (n < 0) continue;
    out[k] = Math.floor(n);
    count++;
  }
  return out;
}

export function parseSettings(raw: unknown, prefersReducedMotion: boolean): Settings {
  const d = defaultSettings(prefersReducedMotion);
  if (!isRecord(raw)) return d;
  const cam = BALANCE.camera;
  const q = raw['quality'];
  return {
    muted: bool(raw['muted'], d.muted),
    volume: num(raw['volume'], 0, 1, d.volume),
    musicVolume: num(raw['musicVolume'], 0, 1, d.musicVolume),
    reduceFlashes: bool(raw['reduceFlashes'], d.reduceFlashes),
    reduceMotion: bool(raw['reduceMotion'], d.reduceMotion),
    sensitivity: num(raw['sensitivity'], cam.sensitivityMin, cam.sensitivityMax, d.sensitivity),
    invertY: bool(raw['invertY'], d.invertY),
    fov: num(raw['fov'], cam.fovMin, cam.fovMax, d.fov),
    quality: q === 'low' || q === 'medium' || q === 'high' ? q : d.quality,
    aimAssist: bool(raw['aimAssist'], d.aimAssist),
    autoFire: bool(raw['autoFire'], d.autoFire),
    dynamicResolution: bool(raw['dynamicResolution'], d.dynamicResolution),
    renderScale: num(
      raw['renderScale'],
      BALANCE.dynamicResolution.minScale,
      BALANCE.dynamicResolution.maxScale,
      d.renderScale,
    ),
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
  const completed: string[] = [];
  let lastArena = d.progress.lastArena;
  let lastDifficulty = d.progress.lastDifficulty;
  const weapons: WeaponId[] = [...d.progress.unlockedWeapons];
  let lastAbility = d.progress.lastAbility;
  let lastMode = d.progress.lastMode;
  const progress = raw['progress'];
  if (isRecord(progress)) {
    if (Array.isArray(progress['unlockedArenas'])) {
      for (const id of progress['unlockedArenas'].slice(0, MAX_ARENAS)) {
        if (isId(id) && !unlocked.includes(id)) unlocked.push(id);
      }
    }
    if (Array.isArray(progress['completed'])) {
      for (const k of progress['completed'].slice(0, MAX_ENTRIES)) {
        if (isResultKey(k) && !completed.includes(k)) completed.push(k);
      }
    }
    if (isId(progress['lastArena'])) lastArena = progress['lastArena'];
    if (isDifficulty(progress['lastDifficulty'])) lastDifficulty = progress['lastDifficulty'];
    // Guardados anteriores no tienen estos campos: se quedan los valores por defecto.
    if (Array.isArray(progress['unlockedWeapons'])) {
      for (const id of progress['unlockedWeapons'].slice(0, WEAPON_ORDER.length * 2)) {
        if (isWeaponId(id) && !weapons.includes(id)) weapons.push(id);
      }
    }
    if (isAbilityId(progress['lastAbility'])) lastAbility = progress['lastAbility'];
    if (isGameMode(progress['lastMode'])) lastMode = progress['lastMode'];
  }
  // Compatibilidad: una arena ya completada (guardados del Hito 2) concede las armas que dependen de ella.
  for (const id of WEAPON_ORDER) {
    const rule = WEAPON_UNLOCKS[id];
    if (rule.kind === 'start' || weapons.includes(id)) continue;
    if (completed.some((k) => k.startsWith(`${rule.arena}:`))) weapons.push(id);
  }
  // Orden estable de las ranuras.
  weapons.sort((a, b) => WEAPON_ORDER.indexOf(a) - WEAPON_ORDER.indexOf(b));

  // Marcas: `arena:dificultad`. Las del Hito 1 (solo `arena`) se migran a Normal.
  const best: Record<string, number> = {};
  const rawBest = raw['best'];
  if (isRecord(rawBest)) {
    let count = 0;
    for (const [k, v] of Object.entries(rawBest)) {
      if (count >= MAX_ENTRIES) break;
      const key = isResultKey(k) ? k : isId(k) ? resultKey(k, 'normal') : null;
      if (key === null) continue;
      const score = num(v, 0, MAX_SCORE, -1);
      if (score < 0) continue;
      best[key] = Math.max(best[key] ?? 0, Math.floor(score));
      count++;
    }
  }

  // Marcas de Resistencia (guardados anteriores al Hito 4 no las tienen: quedan vacías).
  const bestEndless = parseResultMap(raw['bestEndless'], MAX_SCORE);
  const bestEndlessWave = parseResultMap(raw['bestEndlessWave'], MAX_WAVE);

  const seed = raw['lastSeed'];
  const lastSeed =
    typeof seed === 'number' && Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff
      ? seed
      : null;

  return {
    version: META.saveVersion,
    settings: parseSettings(raw['settings'], prefersReducedMotion),
    progress: {
      unlockedArenas: unlocked,
      completed,
      lastArena,
      lastDifficulty,
      unlockedWeapons: weapons,
      lastAbility,
      lastMode,
    },
    best,
    bestEndless,
    bestEndlessWave,
    lastSeed,
  };
}

export function serializeSave(data: SaveData): string {
  return JSON.stringify(data);
}
