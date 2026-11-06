/**
 * Pantallas en DOM: inicio (instrucciones y aviso), ajustes, pausa, derrota, avisos breves y errores.
 * Todo se maneja con teclado (botones nativos) y sin depender de hover.
 */
import { BALANCE, type Quality } from '../data/balance';
import { META } from '../data/meta';
import { TEXTS } from '../data/texts';
import type { Settings } from '../save/schema';
import { button, el, setText, setVisible, slider, toggle } from './dom';

export interface SettingsHost {
  get(): Settings;
  update(patch: Partial<Settings>): void;
}

const QUALITIES: Quality[] = ['low', 'medium', 'high'];
const QUALITY_LABEL: Record<Quality, string> = {
  low: TEXTS.settings.qualityLow,
  medium: TEXTS.settings.qualityMedium,
  high: TEXTS.settings.qualityHigh,
};

/** Interruptores de accesibilidad que aparecen en inicio, ajustes y pausa. */
function comfortToggles(host: SettingsHost): HTMLElement[] {
  const t = TEXTS.settings;
  return [
    toggle(
      t.reduceFlashes,
      () => host.get().reduceFlashes,
      (v) => host.update({ reduceFlashes: v }),
      t.on,
      t.off,
    ),
    toggle(
      t.reduceMotion,
      () => host.get().reduceMotion,
      (v) => host.update({ reduceMotion: v }),
      t.on,
      t.off,
    ),
  ];
}

abstract class Panel {
  readonly root: HTMLElement;
  constructor(parent: HTMLElement, className: string) {
    this.root = el('div', `screen ${className}`);
    this.root.hidden = true;
    parent.append(this.root);
  }
  show(): void {
    setVisible(this.root, true);
    const first = this.root.querySelector<HTMLElement>('button');
    first?.focus({ preventScroll: true });
  }
  hide(): void {
    setVisible(this.root, false);
  }
  get visible(): boolean {
    return !this.root.hidden;
  }
}

export class StartScreen extends Panel {
  constructor(parent: HTMLElement, host: SettingsHost, onPlay: () => void, onSettings: () => void) {
    super(parent, 'screen-start');
    const card = el('div', 'panel');
    card.append(el('h1', 'title', META.title), el('p', 'subtitle', TEXTS.start.subtitle));
    const actions = el('div', 'actions');
    actions.append(
      button(TEXTS.start.play, onPlay, 'btn btn-primary'),
      button(TEXTS.start.settings, onSettings),
    );
    card.append(actions);

    const cols = el('div', 'columns');
    const controls = el('section', 'block');
    controls.append(el('h2', '', TEXTS.start.controlsTitle));
    const list = el('ul', 'controls');
    for (const line of TEXTS.start.controls) list.append(el('li', '', line));
    controls.append(list);
    const notice = el('section', 'block notice');
    notice.append(el('h2', '', TEXTS.start.noticeTitle), el('p', '', TEXTS.start.notice));
    for (const t of comfortToggles(host)) notice.append(t);
    cols.append(controls, notice);
    card.append(cols);
    this.root.append(card);
  }
}

export class SettingsScreen extends Panel {
  private readonly body = el('div', 'settings-body');
  constructor(
    parent: HTMLElement,
    private readonly host: SettingsHost,
    private readonly onBack: () => void,
  ) {
    super(parent, 'screen-settings');
    const card = el('div', 'panel');
    card.append(el('h1', 'title-small', TEXTS.settings.title), this.body);
    this.root.append(card);
    this.root.addEventListener('keydown', (ev) => {
      if (ev.code === 'Escape') {
        ev.stopPropagation();
        this.onBack();
      }
    });
  }

  /** Se reconstruye al abrir para reflejar los valores actuales. */
  override show(): void {
    const t = TEXTS.settings;
    const cam = BALANCE.camera;
    const h = this.host;
    this.body.replaceChildren(
      toggle(
        t.muted,
        () => h.get().muted,
        (v) => h.update({ muted: v }),
        t.on,
        t.off,
      ),
      ...comfortToggles(h),
      slider(
        t.sensitivity,
        cam.sensitivityMin,
        cam.sensitivityMax,
        0.05,
        () => h.get().sensitivity,
        (v) => h.update({ sensitivity: v }),
        (v) => v.toFixed(2),
      ),
      toggle(
        t.invertY,
        () => h.get().invertY,
        (v) => h.update({ invertY: v }),
        t.on,
        t.off,
      ),
      slider(
        t.fov,
        cam.fovMin,
        cam.fovMax,
        1,
        () => h.get().fov,
        (v) => h.update({ fov: Math.round(v) }),
        (v) => `${Math.round(v)}°`,
      ),
      this.qualityRow(),
      button(t.back, this.onBack, 'btn btn-primary'),
    );
    super.show();
  }

  private qualityRow(): HTMLElement {
    const row = el('div', 'setting-row');
    row.append(el('span', 'setting-label', TEXTS.settings.quality));
    const group = el('div', 'segmented');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', TEXTS.settings.quality);
    const buttons: HTMLButtonElement[] = [];
    const refresh = (): void => {
      QUALITIES.forEach((q, i) =>
        buttons[i]?.setAttribute('aria-pressed', this.host.get().quality === q ? 'true' : 'false'),
      );
    };
    for (const q of QUALITIES) {
      const b = button(
        QUALITY_LABEL[q],
        () => {
          this.host.update({ quality: q });
          refresh();
        },
        'btn btn-seg',
      );
      buttons.push(b);
      group.append(b);
    }
    refresh();
    row.append(group);
    return row;
  }
}

export class PauseScreen extends Panel {
  private readonly toggles = el('div', 'pause-toggles');
  constructor(
    parent: HTMLElement,
    private readonly host: SettingsHost,
    onResume: () => void,
    onSettings: () => void,
    onQuit: () => void,
  ) {
    super(parent, 'screen-pause');
    const card = el('div', 'panel panel-narrow');
    card.append(el('h1', 'title-small', TEXTS.pause.title), el('p', 'hint', TEXTS.clickToContinue));
    const actions = el('div', 'actions actions-column');
    actions.append(
      button(TEXTS.pause.resume, onResume, 'btn btn-primary'),
      button(TEXTS.pause.settings, onSettings),
      button(TEXTS.pause.quit, onQuit),
    );
    card.append(actions, this.toggles);
    this.root.append(card);
    // Un clic fuera de los botones también continúa (es un gesto del jugador: permite pedir la captura del puntero).
    this.root.addEventListener('click', (ev) => {
      if (ev.target === this.root) onResume();
    });
  }

  override show(): void {
    this.toggles.replaceChildren(...comfortToggles(this.host));
    super.show();
  }
}

export class DefeatScreen extends Panel {
  private readonly score = el('p', 'result', '');
  private readonly wave = el('p', 'result', '');
  constructor(parent: HTMLElement, onRetry: () => void, onQuit: () => void) {
    super(parent, 'screen-defeat');
    const card = el('div', 'panel panel-narrow');
    card.append(el('h1', 'title-small', TEXTS.defeat.title), this.score, this.wave);
    const actions = el('div', 'actions actions-column');
    actions.append(
      button(TEXTS.defeat.retry, onRetry, 'btn btn-primary'),
      button(TEXTS.defeat.quit, onQuit),
    );
    card.append(actions);
    this.root.append(card);
  }

  setResult(points: number, wave: number): void {
    setText(this.score, `${TEXTS.defeat.score}: ${points}`);
    setText(this.wave, `${TEXTS.defeat.wave}: ${Math.max(1, wave)}`);
  }
}

/** Velo de "Haz clic para jugar / continuar". */
export class ClickOverlay extends Panel {
  private readonly label = el('p', 'click-label', '');
  constructor(parent: HTMLElement, onClick: () => void) {
    super(parent, 'screen-click');
    this.root.append(this.label);
    this.root.addEventListener('click', onClick);
  }
  showWith(text: string): void {
    setText(this.label, text);
    super.show();
  }
}

/** Aviso breve no bloqueante (por ejemplo, si no se pudo capturar el puntero). */
export class Notice {
  private readonly root = el('div', 'notice-toast');
  private timer = 0;
  constructor(parent: HTMLElement) {
    this.root.hidden = true;
    this.root.setAttribute('role', 'status');
    parent.append(this.root);
  }
  show(text: string, seconds = 5): void {
    setText(this.root, text);
    setVisible(this.root, true);
    this.timer = seconds;
  }
  update(dt: number): void {
    if (this.timer <= 0) return;
    this.timer -= dt;
    if (this.timer <= 0) setVisible(this.root, false);
  }
}

/** Mensaje de error a pantalla completa (sin enlaces externos). */
export class ErrorScreen extends Panel {
  private readonly message = el('p', 'error-message', '');
  constructor(parent: HTMLElement) {
    super(parent, 'screen-error');
    const card = el('div', 'panel panel-narrow');
    card.append(el('h1', 'title-small', META.title), this.message);
    this.root.append(card);
  }
  showMessage(text: string): void {
    setText(this.message, text);
    setVisible(this.root, true);
  }
}
