/**
 * Acceso a localStorage con la clave única `fulgor:v1`. Tolera navegadores sin almacenamiento,
 * accesos denegados, datos corruptos y cuota llena: el juego sigue funcionando con los valores en memoria.
 */
import { META } from '../data/meta';
import { parseSave, serializeSave, type SaveData } from './schema';

/** Lo mínimo que se usa de la API Storage (permite probar con un almacenamiento falso). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Devuelve localStorage si se puede usar, o null (por ejemplo en un iframe sin permisos o con cookies bloqueadas). */
export function browserStorage(): StorageLike | null {
  try {
    const s = window.localStorage;
    return s ?? null;
  } catch {
    return null;
  }
}

export function loadSave(storage: StorageLike | null, prefersReducedMotion: boolean): SaveData {
  let text: string | null = null;
  if (storage !== null) {
    try {
      text = storage.getItem(META.saveKey);
    } catch {
      text = null;
    }
  }
  return parseSave(text, prefersReducedMotion);
}

/** Guarda. Devuelve false si no se pudo (sin almacenamiento, acceso denegado o cuota llena). */
export function writeSave(storage: StorageLike | null, data: SaveData): boolean {
  if (storage === null) return false;
  try {
    storage.setItem(META.saveKey, serializeSave(data));
    return true;
  } catch {
    return false;
  }
}
