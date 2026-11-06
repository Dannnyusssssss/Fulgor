/**
 * Indicadores en el borde de la pantalla para enemigos fuera de la vista.
 * Flecha que apunta hacia el enemigo; marca de texto derecha (no gira) para lo importante:
 * "!" si está avisando un ataque y "+" si es un Reparador (objetivo prioritario). Forma y texto, no solo color.
 */
import { Vector3, type PerspectiveCamera } from 'three';
import { EnemyKind, EnemyState } from '../game/enemies/types';
import type { World } from '../game/world';
import { el, setText, setVisible } from './dom';

const MAX_INDICATORS = 12;
/** Distancia de la marca a la punta de la flecha, hacia el centro de la pantalla. */
const MARK_OFFSET = 26;

type Mark = '' | '!' | '+';

interface Indicator {
  node: HTMLElement;
  arrow: HTMLElement;
  mark: HTMLElement;
  x: number;
  y: number;
  angle: number;
  kind: Mark;
  shown: boolean;
}

export class OffscreenIndicators {
  private readonly root = el('div', 'indicators');
  private readonly items: Indicator[] = [];
  private readonly v = new Vector3();

  constructor(parent: HTMLElement) {
    for (let i = 0; i < MAX_INDICATORS; i++) {
      const node = el('div', 'indicator');
      const arrow = el('div', 'indicator-arrow');
      const mark = el('div', 'indicator-mark', '');
      node.append(arrow, mark);
      setVisible(node, false);
      setVisible(mark, false);
      this.root.append(node);
      this.items.push({ node, arrow, mark, x: -1, y: -1, angle: 999, kind: '', shown: false });
    }
    this.root.setAttribute('aria-hidden', 'true');
    parent.append(this.root);
  }

  update(
    world: World,
    camera: PerspectiveCamera,
    width: number,
    height: number,
    enabled: boolean,
  ): void {
    let used = 0;
    if (enabled) {
      // Primero los que avisan un ataque y los Reparadores, para que nunca se queden sin indicador.
      for (let pass = 0; pass < 2; pass++) {
        for (const e of world.enemies.items) {
          if (used >= MAX_INDICATORS) break;
          if (!e.active || e.state === EnemyState.Materializing) continue;
          const warn = e.state === EnemyState.Windup || e.state === EnemyState.Track;
          const healer = e.kind === EnemyKind.Reparador;
          const important = warn || healer;
          if ((pass === 0) !== important) continue;
          this.v.set(e.pos.x, 0.9, e.pos.z).applyMatrix4(camera.matrixWorldInverse);
          const behind = this.v.z > 0;
          this.v.applyMatrix4(camera.projectionMatrix);
          let nx = this.v.x;
          let ny = this.v.y;
          if (behind) {
            nx = -nx;
            ny = -ny;
          }
          if (!behind && Math.abs(nx) <= 0.95 && Math.abs(ny) <= 0.95) continue;
          // Punto en una elipse cerca del borde, en la dirección del enemigo.
          let angle = Math.atan2(ny, nx);
          if (!Number.isFinite(angle)) angle = 0;
          const x = width / 2 + Math.cos(angle) * width * 0.44;
          const y = height / 2 - Math.sin(angle) * height * 0.42;
          this.place(used++, x, y, angle, warn ? '!' : healer ? '+' : '');
        }
      }
    }
    for (let i = used; i < MAX_INDICATORS; i++) {
      const it = this.items[i];
      if (it && it.shown) {
        it.shown = false;
        setVisible(it.node, false);
      }
    }
  }

  private place(i: number, x: number, y: number, angle: number, kind: Mark): void {
    const it = this.items[i];
    if (!it) return;
    if (!it.shown) {
      it.shown = true;
      setVisible(it.node, true);
    }
    // Solo se escribe en el DOM si cambió de forma apreciable.
    if (Math.abs(it.x - x) > 1.5 || Math.abs(it.y - y) > 1.5) {
      it.x = x;
      it.y = y;
      it.node.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
    if (Math.abs(it.angle - angle) > 0.03 || it.kind !== kind) {
      it.angle = angle;
      const scale = kind === '!' ? 1.35 : 1;
      it.arrow.style.transform = `rotate(${(-angle).toFixed(3)}rad) scale(${scale})`;
      const mx = -Math.cos(angle) * MARK_OFFSET;
      const my = Math.sin(angle) * MARK_OFFSET;
      it.mark.style.transform = `translate(${mx.toFixed(1)}px, ${my.toFixed(1)}px)`;
    }
    if (it.kind !== kind) {
      it.kind = kind;
      it.node.classList.toggle('is-warn', kind === '!');
      it.node.classList.toggle('is-healer', kind === '+');
      setText(it.mark, kind);
      setVisible(it.mark, kind !== '');
    }
  }
}
