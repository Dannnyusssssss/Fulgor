/**
 * Estado de entrada puro (sin DOM): recibe teclas, botones y movimiento del ratón desde un adaptador
 * y los traduce a acciones. El adaptador del navegador vive en `ui/input-dom.ts`.
 */
import { ACTIONS, BINDINGS, type Action } from '../data/controls';

/** Orden que recibe la simulación en cada paso fijo. */
export interface PlayerCommand {
  /** Movimiento local: +1 derecha, -1 izquierda. */
  moveX: number;
  /** Movimiento local: +1 adelante, -1 atrás. */
  moveZ: number;
  /** Dirección horizontal de la cámara (hacia donde se dispara). */
  yaw: number;
  fire: boolean;
  aim: boolean;
  /** Pulsaciones (solo verdaderas en el primer paso tras pulsar). */
  dodge: boolean;
  vent: boolean;
  /** Habilidad (Q), pulsación. */
  ability: boolean;
  /** Cambio de arma: 0 = sin cambio; 1, 2 o 3 = ranura elegida (pulsación). */
  weapon: number;
  /** Mejora elegida en la pantalla de mejoras: 0 = ninguna; 1, 2 o 3 = opción. */
  perk: number;
}

export function emptyCommand(): PlayerCommand {
  return {
    moveX: 0,
    moveZ: 0,
    yaw: 0,
    fire: false,
    aim: false,
    dodge: false,
    vent: false,
    ability: false,
    weapon: 0,
    perk: 0,
  };
}

export class InputMapper {
  /** Códigos actualmente pulsados. */
  private readonly heldCodes = new Set<string>();
  /** Cuántos códigos mantienen pulsada cada acción (una acción puede tener varias teclas). */
  private readonly heldCount = new Map<Action, number>();
  /** Acciones pulsadas desde la última vez que se consultaron. */
  private readonly pressed = new Set<Action>();
  private lookX = 0;
  private lookY = 0;

  constructor(
    /** Tope de movimiento del ratón por evento, para ignorar saltos anómalos. */
    private readonly maxLookPerEvent: number,
  ) {
    for (const a of ACTIONS) this.heldCount.set(a, 0);
  }

  /** Registra una pulsación. Devuelve la acción asociada o null si el código no es del juego. */
  press(code: string): Action | null {
    const action = BINDINGS[code];
    if (action === undefined) return null;
    if (this.heldCodes.has(code)) return action; // repetición automática del teclado: se ignora
    this.heldCodes.add(code);
    const n = this.heldCount.get(action) ?? 0;
    if (n === 0) this.pressed.add(action);
    this.heldCount.set(action, n + 1);
    return action;
  }

  release(code: string): Action | null {
    const action = BINDINGS[code];
    if (action === undefined) return null;
    if (!this.heldCodes.delete(code)) return action;
    const n = this.heldCount.get(action) ?? 0;
    this.heldCount.set(action, Math.max(0, n - 1));
    return action;
  }

  /** Suelta todo (al perder el foco o pausar): evita teclas "pegadas". */
  releaseAll(): void {
    this.heldCodes.clear();
    for (const a of ACTIONS) this.heldCount.set(a, 0);
    this.pressed.clear();
    this.lookX = 0;
    this.lookY = 0;
  }

  isHeld(action: Action): boolean {
    return (this.heldCount.get(action) ?? 0) > 0;
  }

  /** Devuelve true una sola vez por pulsación. */
  consumePressed(action: Action): boolean {
    return this.pressed.delete(action);
  }

  /** Acumula movimiento del ratón, recortado por evento. */
  addLook(dx: number, dy: number): void {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    const m = this.maxLookPerEvent;
    this.lookX += dx > m ? m : dx < -m ? -m : dx;
    this.lookY += dy > m ? m : dy < -m ? -m : dy;
  }

  /** Devuelve y vacía el movimiento acumulado del ratón (en píxeles). */
  consumeLook(out: { x: number; y: number }): void {
    out.x = this.lookX;
    out.y = this.lookY;
    this.lookX = 0;
    this.lookY = 0;
  }

  /** Eje de giro con flechas: -1 izquierda, +1 derecha. */
  turnAxisX(): number {
    return (this.isHeld('turnRight') ? 1 : 0) - (this.isHeld('turnLeft') ? 1 : 0);
  }

  /** Eje de inclinación con flechas: +1 arriba, -1 abajo. */
  turnAxisY(): number {
    return (this.isHeld('turnUp') ? 1 : 0) - (this.isHeld('turnDown') ? 1 : 0);
  }

  /** Rellena la orden de la simulación para un paso fijo. */
  fillCommand(out: PlayerCommand, yaw: number): PlayerCommand {
    out.moveX = (this.isHeld('moveRight') ? 1 : 0) - (this.isHeld('moveLeft') ? 1 : 0);
    out.moveZ = (this.isHeld('moveForward') ? 1 : 0) - (this.isHeld('moveBack') ? 1 : 0);
    out.yaw = yaw;
    out.fire = this.isHeld('fire');
    out.aim = this.isHeld('aim');
    out.dodge = this.consumePressed('dodge');
    out.vent = this.consumePressed('vent');
    out.ability = this.consumePressed('ability');
    // Si se pulsan varias ranuras en el mismo paso, gana la última de la lista.
    let weapon = 0;
    if (this.consumePressed('weapon1')) weapon = 1;
    if (this.consumePressed('weapon2')) weapon = 2;
    if (this.consumePressed('weapon3')) weapon = 3;
    out.weapon = weapon;
    out.perk = 0;
    return out;
  }
}
