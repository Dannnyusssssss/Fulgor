/**
 * Overlay de depuración (solo con ?debug): FPS, enemigos y proyectiles vivos, destellos concedidos en el último
 * segundo y controles para ajustar en vivo los parámetros de combate. Sin ?debug no se crea ni consume CPU.
 */
import { BALANCE } from '../data/balance';
import { TEXTS } from '../data/texts';
import type { Tuning } from '../game/tuning';
import type { World } from '../game/world';
import { el, setText, slider, toggle } from './dom';

interface Param {
  label: string;
  min: number;
  max: number;
  step: number;
  get: (t: Tuning) => number;
  set: (t: Tuning, v: number) => void;
}

const PARAMS: Param[] = [
  {
    label: 'Velocidad',
    min: 2,
    max: 12,
    step: 0.1,
    get: (t) => t.player.speed,
    set: (t, v) => (t.player.speed = v),
  },
  {
    label: 'Aceleración',
    min: 4,
    max: 40,
    step: 1,
    get: (t) => t.player.acceleration,
    set: (t, v) => (t.player.acceleration = v),
  },
  {
    label: 'Esquiva: velocidad',
    min: 6,
    max: 30,
    step: 0.5,
    get: (t) => t.player.dodge.speed,
    set: (t, v) => (t.player.dodge.speed = v),
  },
  {
    label: 'Esquiva: duración',
    min: 0.1,
    max: 0.5,
    step: 0.01,
    get: (t) => t.player.dodge.duration,
    set: (t, v) => (t.player.dodge.duration = v),
  },
  {
    label: 'Esquiva: recarga',
    min: 0.2,
    max: 3,
    step: 0.05,
    get: (t) => t.player.dodge.cooldown,
    set: (t, v) => (t.player.dodge.cooldown = v),
  },
  {
    label: 'Pulsador: intervalo',
    min: 0.05,
    max: 0.5,
    step: 0.01,
    get: (t) => t.weapons.pulsador.fireInterval,
    set: (t, v) => (t.weapons.pulsador.fireInterval = v),
  },
  {
    label: 'Pulsador: daño',
    min: 1,
    max: 40,
    step: 1,
    get: (t) => t.weapons.pulsador.damage,
    set: (t, v) => (t.weapons.pulsador.damage = v),
  },
  {
    label: 'Pulsador: velocidad',
    min: 10,
    max: 120,
    step: 1,
    get: (t) => t.weapons.pulsador.projectileSpeed,
    set: (t, v) => (t.weapons.pulsador.projectileSpeed = v),
  },
  {
    label: 'Calor por disparo',
    min: 1,
    max: 30,
    step: 0.5,
    get: (t) => t.weapons.pulsador.heatPerShot,
    set: (t, v) => (t.weapons.pulsador.heatPerShot = v),
  },
  {
    label: 'Enfriado / s',
    min: 5,
    max: 100,
    step: 1,
    get: (t) => t.weapons.pulsador.coolRate,
    set: (t, v) => (t.weapons.pulsador.coolRate = v),
  },
  {
    label: 'Zumbador: velocidad',
    min: 1,
    max: 10,
    step: 0.1,
    get: (t) => t.zumbador.speed,
    set: (t, v) => (t.zumbador.speed = v),
  },
  {
    label: 'Zumbador: vida',
    min: 5,
    max: 120,
    step: 1,
    get: (t) => t.zumbador.health,
    set: (t, v) => (t.zumbador.health = v),
  },
  {
    label: 'Zumbador: aviso (s)',
    min: BALANCE.telegraph.minSeconds,
    max: 1.5,
    step: 0.01,
    get: (t) => t.zumbador.windupSeconds,
    set: (t, v) => (t.zumbador.windupSeconds = v),
  },
  {
    label: 'Zumbador: embestida',
    min: 6,
    max: 30,
    step: 0.5,
    get: (t) => t.zumbador.dashSpeed,
    set: (t, v) => (t.zumbador.dashSpeed = v),
  },
];

export class DebugOverlay {
  private readonly root = el('div', 'debug');
  private readonly stats = el('pre', 'debug-stats', '');
  private frames = 0;
  private acc = 0;
  private fps = 0;

  constructor(parent: HTMLElement, tuning: Tuning, getWorld: () => World) {
    this.root.append(el('div', 'debug-title', TEXTS.debug.title), this.stats);
    this.root.append(
      toggle(
        TEXTS.debug.god,
        () => getWorld().god,
        (v) => (getWorld().god = v),
        TEXTS.settings.on,
        TEXTS.settings.off,
      ),
    );
    for (const p of PARAMS) {
      this.root.append(
        slider(
          p.label,
          p.min,
          p.max,
          p.step,
          () => p.get(tuning),
          (v) => p.set(tuning, v),
          (v) => v.toFixed(2),
        ),
      );
    }
    parent.append(this.root);
  }

  update(
    dt: number,
    world: World,
    flashesInWindow: number,
    render: {
      calls: number;
      geometries: number;
      textures: number;
      programs: number;
      pixelRatio: number;
    },
  ): void {
    this.frames++;
    this.acc += dt;
    if (this.acc < 0.25) return;
    this.fps = this.frames / this.acc;
    this.frames = 0;
    this.acc = 0;
    setText(
      this.stats,
      `${TEXTS.debug.fps}: ${this.fps.toFixed(0)}\n` +
        `${TEXTS.debug.enemies}: ${world.enemies.activeCount}\n` +
        `${TEXTS.debug.projectiles}: ${world.projectiles.activeCount}\n` +
        `${TEXTS.debug.flashes}: ${flashesInWindow}
` +
        `${TEXTS.debug.drawCalls}: ${render.calls}
` +
        `${TEXTS.debug.geometries}: ${render.geometries}
` +
        `${TEXTS.debug.textures}: ${render.textures}
` +
        `${TEXTS.debug.programs}: ${render.programs}
` +
        `${TEXTS.debug.pixelRatio}: ${render.pixelRatio.toFixed(2)}`,
    );
  }
}
