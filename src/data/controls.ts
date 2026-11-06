/**
 * Mapeo de teclas y botones a acciones. Se usan códigos físicos (`KeyboardEvent.code`),
 * así WASD queda en la misma posición en cualquier distribución de teclado.
 * Ctrl y Tab no se usan como teclas de juego.
 */
export type Action =
  | 'moveForward'
  | 'moveBack'
  | 'moveLeft'
  | 'moveRight'
  | 'turnLeft'
  | 'turnRight'
  | 'turnUp'
  | 'turnDown'
  | 'fire'
  | 'aim'
  | 'dodge'
  | 'vent'
  | 'ability'
  | 'weapon1'
  | 'weapon2'
  | 'weapon3'
  | 'shoulder'
  | 'pause'
  | 'mute';

export const ACTIONS: readonly Action[] = [
  'moveForward',
  'moveBack',
  'moveLeft',
  'moveRight',
  'turnLeft',
  'turnRight',
  'turnUp',
  'turnDown',
  'fire',
  'aim',
  'dodge',
  'vent',
  'ability',
  'weapon1',
  'weapon2',
  'weapon3',
  'shoulder',
  'pause',
  'mute',
];

/** Códigos de entrada a acción. Los botones del ratón usan los códigos `Mouse0` (izquierdo) y `Mouse2` (derecho). */
export const BINDINGS: Readonly<Record<string, Action>> = {
  KeyW: 'moveForward',
  KeyS: 'moveBack',
  KeyA: 'moveLeft',
  KeyD: 'moveRight',
  ArrowLeft: 'turnLeft',
  ArrowRight: 'turnRight',
  ArrowUp: 'turnUp',
  ArrowDown: 'turnDown',
  Space: 'fire',
  Mouse0: 'fire',
  Mouse2: 'aim',
  ShiftLeft: 'dodge',
  ShiftRight: 'dodge',
  KeyR: 'vent',
  KeyQ: 'ability',
  Digit1: 'weapon1',
  Digit2: 'weapon2',
  Digit3: 'weapon3',
  KeyC: 'shoulder',
  KeyP: 'pause',
  Escape: 'pause',
  KeyM: 'mute',
};

/** Únicas teclas a las que se les impide la acción por defecto del navegador, y solo mientras se juega. */
export const PREVENT_DEFAULT_CODES: ReadonlySet<string> = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Space',
]);
