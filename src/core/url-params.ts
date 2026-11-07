/**
 * Lectura validada de los parámetros de depuración de la URL (documentados en docs/DEBUG.md).
 * Cualquier valor desconocido o fuera de rango se ignora.
 */
export interface DebugParams {
  debug: boolean;
  god: boolean;
  /** Prueba de rendimiento: 60 enemigos y 200 proyectiles. */
  stress: boolean;
  /** Arena inicial (identificador ya validado por formato; quien llama comprueba que exista). */
  arena: string | null;
  /** Oleada inicial (1 a 99; en el modo Oleadas se limita a la última de la arena). */
  wave: number | null;
  /** Fuerza el modo Resistencia (aunque no esté desbloqueado). */
  endless: boolean;
}

const MAX_SEARCH_LENGTH = 200;
const ID_PATTERN = /^[a-z0-9-]{1,40}$/;
// De 1 a 99, sin ceros a la izquierda.
const WAVE_PATTERN = /^[1-9][0-9]?$/;

function isOn(value: string | null): boolean {
  return value === '' || value === '1' || value === 'true';
}

export function parseDebugParams(search: string): DebugParams {
  const result: DebugParams = {
    debug: false,
    god: false,
    stress: false,
    arena: null,
    wave: null,
    endless: false,
  };
  if (typeof search !== 'string' || search.length === 0 || search.length > MAX_SEARCH_LENGTH) {
    return result;
  }
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return result;
  }
  result.debug = isOn(params.get('debug'));
  result.god = isOn(params.get('god'));
  result.stress = isOn(params.get('stress'));
  const arena = params.get('arena');
  if (arena !== null && ID_PATTERN.test(arena)) result.arena = arena;
  const wave = params.get('wave');
  if (wave !== null && WAVE_PATTERN.test(wave)) result.wave = Number(wave);
  result.endless = params.get('mode') === 'resistencia';
  return result;
}
