/**
 * Adaptador del navegador para el mando: lee el primer mando conectado con la Gamepad API y lo copia en una
 * "foto" reutilizable (sin crear arreglos en cada frame). El mapeo vive en core/gamepad.ts.
 */
import type { PadSnapshot } from '../core/gamepad';

const MAX_AXES = 4;
const MAX_BUTTONS = 17;

export class GamepadReader {
  private readonly axes = new Array<number>(MAX_AXES).fill(0);
  private readonly buttons = new Array<number>(MAX_BUTTONS).fill(0);
  private readonly snapshot: PadSnapshot = { axes: this.axes, buttons: this.buttons };

  /** Devuelve la foto del mando, o null si no hay ninguno (o el navegador no tiene Gamepad API). */
  read(): PadSnapshot | null {
    let pads: (Gamepad | null)[];
    try {
      if (typeof navigator.getGamepads !== 'function') return null;
      pads = navigator.getGamepads();
    } catch {
      return null;
    }
    let pad: Gamepad | null = null;
    for (const p of pads) {
      if (p !== null && p.connected) {
        pad = p;
        break;
      }
    }
    if (pad === null) return null;
    for (let i = 0; i < MAX_AXES; i++) this.axes[i] = pad.axes[i] ?? 0;
    for (let i = 0; i < MAX_BUTTONS; i++) this.buttons[i] = pad.buttons[i]?.value ?? 0;
    return this.snapshot;
  }
}
