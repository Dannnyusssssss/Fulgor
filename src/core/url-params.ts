/**
 * Lectura validada de los parámetros de depuración de la URL (documentados en docs/DEBUG.md).
 * Cualquier valor desconocido se ignora.
 */
export interface DebugParams {
  debug: boolean;
  god: boolean;
}

const MAX_SEARCH_LENGTH = 200;

function isOn(value: string | null): boolean {
  return value === '' || value === '1' || value === 'true';
}

export function parseDebugParams(search: string): DebugParams {
  const result: DebugParams = { debug: false, god: false };
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
  return result;
}
