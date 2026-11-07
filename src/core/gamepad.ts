/**
 * Mando (lógica pura): zona muerta radial, curva de respuesta y mapeo de botones del diseño estándar
 * de la Gamepad API. Recibe una "foto" del mando (ejes y botones) y produce el estado de juego,
 * con detección de pulsaciones (solo verdaderas el primer frame).
 *
 * Mapeo: stick izquierdo mueve; stick derecho gira la cámara; gatillo derecho dispara; gatillo izquierdo apunta;
 * A o B esquivan; X ventila; Y o LB activan la habilidad; cruceta izquierda/arriba/derecha = armas 1/2/3
 * (y opciones 1/2/3 en la pantalla de mejoras); RB cambia de hombro; Start pausa.
 */
export const PAD = {
  deadzone: 0.18,
  /** Gatillos: a partir de este valor cuentan como pulsados. */
  triggerThreshold: 0.3,
  /** Exponente de la curva del stick de cámara (más precisión cerca del centro). */
  lookCurve: 2,
  /** El stick de cámara gira hasta 1,4 veces lo que giran las flechas. */
  lookSpeed: 1.4,
  axes: { moveX: 0, moveY: 1, lookX: 2, lookY: 3 },
  buttons: {
    a: 0,
    b: 1,
    x: 2,
    y: 3,
    lb: 4,
    rb: 5,
    lt: 6,
    rt: 7,
    start: 9,
    up: 12,
    left: 14,
    right: 15,
  },
} as const;

export interface PadSnapshot {
  axes: readonly number[];
  /** Valor analógico de cada botón (0–1). */
  buttons: readonly number[];
}

export interface PadState {
  connected: boolean;
  /** Movimiento local: +1 derecha / +1 adelante. */
  moveX: number;
  moveZ: number;
  /** Giro de cámara: +1 derecha / +1 arriba (ya con zona muerta y curva). */
  lookX: number;
  lookY: number;
  fire: boolean;
  aim: boolean;
  dodge: boolean;
  vent: boolean;
  ability: boolean;
  /** 0 = sin cambio; 1, 2 o 3. */
  weapon: number;
  shoulder: boolean;
  pause: boolean;
}

export function createPadState(): PadState {
  return {
    connected: false,
    moveX: 0,
    moveZ: 0,
    lookX: 0,
    lookY: 0,
    fire: false,
    aim: false,
    dodge: false,
    vent: false,
    ability: false,
    weapon: 0,
    shoulder: false,
    pause: false,
  };
}

function finite(v: number | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/**
 * Zona muerta radial con reescalado: dentro del radio vale 0; fuera, la magnitud va de 0 a 1 sin salto.
 * Escribe el resultado en `out` (x, y).
 */
export function radialDeadzone(
  x: number,
  y: number,
  deadzone: number,
  out: { x: number; y: number },
): { x: number; y: number } {
  const fx = finite(x);
  const fy = finite(y);
  const mag = Math.hypot(fx, fy);
  if (mag <= deadzone || mag === 0) {
    out.x = 0;
    out.y = 0;
    return out;
  }
  const clamped = Math.min(1, mag);
  const scaled = (clamped - deadzone) / (1 - deadzone);
  out.x = (fx / mag) * scaled;
  out.y = (fy / mag) * scaled;
  return out;
}

/** Curva de respuesta conservando el signo. */
export function curve(v: number, exponent: number): number {
  return Math.sign(v) * Math.pow(Math.abs(v), exponent);
}

/** Traduce el mando a estado de juego, con flancos de pulsación. Guarda el estado anterior para los flancos. */
export class PadMapper {
  private readonly prev = new Float32Array(17);
  private readonly tmp = { x: 0, y: 0 };

  private held(s: PadSnapshot, i: number, threshold = 0.5): boolean {
    return finite(s.buttons[i]) >= threshold;
  }

  private pressed(s: PadSnapshot, i: number): boolean {
    return this.held(s, i) && (this.prev[i] ?? 0) < 0.5;
  }

  /** `snapshot` null = sin mando: todo a cero. */
  update(snapshot: PadSnapshot | null, out: PadState): PadState {
    if (snapshot === null) {
      Object.assign(out, createPadState());
      this.prev.fill(0);
      return out;
    }
    const s = snapshot;
    const b = PAD.buttons;
    out.connected = true;
    radialDeadzone(
      s.axes[PAD.axes.moveX] ?? 0,
      s.axes[PAD.axes.moveY] ?? 0,
      PAD.deadzone,
      this.tmp,
    );
    out.moveX = this.tmp.x;
    // En el mando, arriba es negativo.
    out.moveZ = -this.tmp.y;
    radialDeadzone(
      s.axes[PAD.axes.lookX] ?? 0,
      s.axes[PAD.axes.lookY] ?? 0,
      PAD.deadzone,
      this.tmp,
    );
    out.lookX = curve(this.tmp.x, PAD.lookCurve);
    out.lookY = -curve(this.tmp.y, PAD.lookCurve);
    out.fire = this.held(s, b.rt, PAD.triggerThreshold);
    out.aim = this.held(s, b.lt, PAD.triggerThreshold);
    out.dodge = this.pressed(s, b.a) || this.pressed(s, b.b);
    out.vent = this.pressed(s, b.x);
    out.ability = this.pressed(s, b.y) || this.pressed(s, b.lb);
    out.weapon = this.pressed(s, b.left)
      ? 1
      : this.pressed(s, b.up)
        ? 2
        : this.pressed(s, b.right)
          ? 3
          : 0;
    out.shoulder = this.pressed(s, b.rb);
    out.pause = this.pressed(s, b.start);
    for (let i = 0; i < this.prev.length; i++) this.prev[i] = finite(s.buttons[i]);
    return out;
  }
}
