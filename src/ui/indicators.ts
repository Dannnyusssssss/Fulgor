/**
 * Indicadores en el borde de la pantalla para enemigos fuera de la vista que pueden atacar.
 * Forma de flecha; los que están avisando un ataque muestran además "!" (forma y texto, no solo color).
 */
import { Vector3, type PerspectiveCamera } from 'three';
import { EnemyState } from '../game/enemies/types';
import type { World } from '../game/world';
import { el, setVisible } from './dom';

const MAX_INDICATORS = 12;

interface Indicator {
  node: HTMLElement;
  mark: HTMLElement;
  x: number;
  y: number;
  angle: number;
  warn: boolean;
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
      const mark = el('div', 'indicator-mark', '!');
      node.append(arrow, mark);
      setVisible(node, false);
      setVisible(mark, false);
      this.root.append(node);
      this.items.push({ node, mark, x: -1, y: -1, angle: 0, warn: false, shown: false });
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
      for (const e of world.enemies.items) {
        if (used >= MAX_INDICATORS) break;
        if (!e.active || e.state === EnemyState.Materializing) continue;
        this.v.set(e.pos.x, 0.9, e.pos.z).applyMatrix4(camera.matrixWorldInverse);
        const behind = this.v.z > 0;
        this.v.applyMatrix4(camera.projectionMatrix);
        let nx = this.v.x;
        let ny = this.v.y;
        if (behind) {
          nx = -nx;
          ny = -ny;
        }
        const onScreen = !behind && Math.abs(nx) <= 0.95 && Math.abs(ny) <= 0.95;
        if (onScreen) continue;
        // Punto en una elipse cerca del borde, en la dirección del enemigo.
        let angle = Math.atan2(ny, nx);
        if (!Number.isFinite(angle)) angle = 0;
        const x = width / 2 + Math.cos(angle) * width * 0.44;
        const y = height / 2 - Math.sin(angle) * height * 0.42;
        this.place(used++, x, y, angle, e.state === EnemyState.Windup);
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

  private place(i: number, x: number, y: number, angle: number, warn: boolean): void {
    const it = this.items[i];
    if (!it) return;
    if (!it.shown) {
      it.shown = true;
      setVisible(it.node, true);
    }
    // Solo se escribe en el DOM si se movió de forma apreciable.
    if (Math.abs(it.x - x) > 1.5 || Math.abs(it.y - y) > 1.5 || Math.abs(it.angle - angle) > 0.03) {
      it.x = x;
      it.y = y;
      it.angle = angle;
      it.node.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${(-angle).toFixed(3)}rad)`;
    }
    if (it.warn !== warn) {
      it.warn = warn;
      it.node.classList.toggle('is-warn', warn);
      setVisible(it.mark, warn);
    }
  }
}
