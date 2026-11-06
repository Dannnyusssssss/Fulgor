/**
 * Arranque: lee los ajustes guardados y los parámetros de depuración, y lanza la aplicación.
 */
import './styles.css';
import { parseDebugParams } from './core/url-params';
import { META } from './data/meta';
import { browserStorage, loadSave } from './save/storage';
import { startApp } from './ui/app';

document.title = META.title;

/** Semilla de 32 bits para cada partida. Solo la capa de arranque usa una fuente aleatoria del navegador. */
function newSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] ?? 1;
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

const canvas = document.getElementById('game-canvas');
const ui = document.getElementById('ui');
if (canvas instanceof HTMLCanvasElement && ui instanceof HTMLElement) {
  const storage = browserStorage();
  startApp({
    canvas,
    uiRoot: ui,
    save: loadSave(storage, prefersReducedMotion()),
    storage,
    debug: parseDebugParams(window.location.search),
    newSeed,
  });
}
