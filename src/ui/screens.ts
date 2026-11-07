/**
 * Pantallas en DOM: inicio (instrucciones y aviso), selección de arena, ajustes, pausa, resultados, avisos y errores.
 * Todo se maneja con teclado (botones nativos) y sin depender de hover.
 */
import { ABILITY_ORDER, type AbilityId } from '../data/abilities';
import { BALANCE, type Quality } from '../data/balance';
import { DIFFICULTY_ORDER, type Difficulty } from '../data/difficulty';
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
      slider(
        t.volume,
        0,
        1,
        0.05,
        () => h.get().volume,
        (v) => h.update({ volume: v }),
        (v) => `${Math.round(v * 100)} %`,
      ),
      slider(
        t.musicVolume,
        0,
        1,
        0.05,
        () => h.get().musicVolume,
        (v) => h.update({ musicVolume: v }),
        (v) => `${Math.round(v * 100)} %`,
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
      toggle(
        t.aimAssist,
        () => h.get().aimAssist,
        (v) => h.update({ aimAssist: v }),
        t.on,
        t.off,
      ),
      toggle(
        t.autoFire,
        () => h.get().autoFire,
        (v) => h.update({ autoFire: v }),
        t.on,
        t.off,
      ),
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

/** Datos que la pantalla de selección necesita del progreso guardado. */
export interface SelectHost {
  arenas(): readonly { id: string; unlocked: boolean; completed: boolean }[];
  best(arena: string, difficulty: Difficulty): number;
  selection(): { arena: string; difficulty: Difficulty };
  select(arena: string, difficulty: Difficulty): void;
  ability(): AbilityId;
  selectAbility(id: AbilityId): void;
}

/** Selección de arena y dificultad, toda con botones (teclado y ratón). */
export class SelectScreen extends Panel {
  private readonly list = el('div', 'arena-list');
  private readonly difficulties = el('div', 'segmented');
  private readonly abilities = el('div', 'segmented');
  private readonly abilityDesc = el('p', 'hint ability-desc', '');
  constructor(
    parent: HTMLElement,
    private readonly host: SelectHost,
    private readonly onStart: () => void,
    onBack: () => void,
  ) {
    super(parent, 'screen-select');
    const card = el('div', 'panel');
    card.append(el('h1', 'title-small', TEXTS.select.title), this.list);
    const diffRow = el('div', 'setting-row');
    diffRow.append(el('span', 'setting-label', TEXTS.select.difficulty), this.difficulties);
    this.difficulties.setAttribute('role', 'group');
    this.difficulties.setAttribute('aria-label', TEXTS.select.difficulty);
    const actions = el('div', 'actions');
    actions.append(
      button(TEXTS.select.start, onStart, 'btn btn-primary'),
      button(TEXTS.select.back, onBack),
    );
    const abilityRow = el('div', 'setting-row');
    abilityRow.append(el('span', 'setting-label', TEXTS.select.ability), this.abilities);
    this.abilities.setAttribute('role', 'group');
    this.abilities.setAttribute('aria-label', TEXTS.select.ability);
    card.append(diffRow, abilityRow, this.abilityDesc, actions);
    this.root.append(card);
    this.root.addEventListener('keydown', (ev) => {
      if (ev.code === 'Escape') {
        ev.stopPropagation();
        onBack();
      }
    });
  }

  override show(): void {
    this.refresh();
    super.show();
  }

  private refresh(): void {
    const sel = this.host.selection();
    const arenas = this.host.arenas();
    const items: HTMLElement[] = [];
    arenas.forEach((a, i) => {
      const name = TEXTS.arenas[a.id] ?? a.id;
      const b = el('button', 'btn arena-card');
      b.type = 'button';
      b.setAttribute('aria-pressed', a.id === sel.arena ? 'true' : 'false');
      b.append(el('span', 'arena-name', name));
      if (a.unlocked) {
        b.append(el('span', 'arena-desc', TEXTS.arenaDescriptions[a.id] ?? ''));
        const best = this.host.best(a.id, sel.difficulty);
        const meta = `${TEXTS.select.best}: ${best}${a.completed ? ` · ${TEXTS.select.completed}` : ''}`;
        b.append(el('span', 'arena-meta', meta));
        b.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.host.select(a.id, this.host.selection().difficulty);
          this.refresh();
          this.focusArena(i);
        });
        // Doble clic o Enter sobre la arena ya elegida empieza la partida.
        b.addEventListener('dblclick', () => this.onStart());
      } else {
        const prev = arenas[i - 1];
        const prevName = prev ? (TEXTS.arenas[prev.id] ?? prev.id) : '';
        b.disabled = true;
        b.append(el('span', 'arena-desc', `${TEXTS.select.locked} ${prevName}`));
      }
      items.push(b);
    });
    this.list.replaceChildren(...items);

    const diffButtons: HTMLButtonElement[] = [];
    for (const d of DIFFICULTY_ORDER) {
      const b = button(
        TEXTS.difficulties[d],
        () => {
          this.host.select(this.host.selection().arena, d);
          this.refresh();
          this.difficulties.querySelectorAll('button')[DIFFICULTY_ORDER.indexOf(d)]?.focus();
        },
        'btn btn-seg',
      );
      b.setAttribute('aria-pressed', d === sel.difficulty ? 'true' : 'false');
      diffButtons.push(b);
    }
    this.difficulties.replaceChildren(...diffButtons);

    // Habilidad de la partida: una de tres, con su descripción debajo.
    const current = this.host.ability();
    const abilityButtons = ABILITY_ORDER.map((id, i) => {
      const b = button(
        TEXTS.abilities[id],
        () => {
          this.host.selectAbility(id);
          this.refresh();
          this.abilities.querySelectorAll('button')[i]?.focus();
        },
        'btn btn-seg',
      );
      b.setAttribute('aria-pressed', id === current ? 'true' : 'false');
      return b;
    });
    this.abilities.replaceChildren(...abilityButtons);
    setText(this.abilityDesc, TEXTS.abilityDescriptions[current]);
  }

  private focusArena(i: number): void {
    this.list.querySelectorAll('button')[i]?.focus();
  }
}

export interface ResultInfo {
  victory: boolean;
  points: number;
  best: number;
  newRecord: boolean;
  wave: number;
  bestCombo: number;
  /** Nombre de la arena desbloqueada, o null. */
  unlocked: string | null;
  /** Nombres de las armas desbloqueadas en esta partida. */
  unlockedWeapons: readonly string[];
}

/** Resultados de la partida (victoria o derrota). Solo ofrece acciones internas. */
export class ResultsScreen extends Panel {
  private readonly title = el('h1', 'title-small', '');
  private readonly record = el('p', 'result result-record', TEXTS.results.newRecord);
  private readonly lines = el('div', 'results-lines');
  private readonly unlocked = el('p', 'result result-unlocked', '');
  private readonly unlockedWeapon = el('p', 'result result-unlocked', '');
  constructor(parent: HTMLElement, onRetry: () => void, onChoose: () => void, onQuit: () => void) {
    super(parent, 'screen-results');
    const card = el('div', 'panel panel-narrow');
    const actions = el('div', 'actions actions-column');
    actions.append(
      button(TEXTS.results.retry, onRetry, 'btn btn-primary'),
      button(TEXTS.results.chooseArena, onChoose),
      button(TEXTS.results.quit, onQuit),
    );
    card.append(this.title, this.record, this.lines, this.unlocked, this.unlockedWeapon, actions);
    this.root.append(card);
  }

  setResult(r: ResultInfo): void {
    setText(this.title, r.victory ? TEXTS.results.victoryTitle : TEXTS.defeat.title);
    setVisible(this.record, r.newRecord);
    this.lines.replaceChildren(
      el('p', 'result', `${TEXTS.results.points}: ${r.points}`),
      el('p', 'result', `${TEXTS.results.best}: ${r.best}`),
      el('p', 'result', `${TEXTS.results.wave}: ${Math.max(1, r.wave)}`),
      el('p', 'result', `${TEXTS.results.bestCombo}: ${r.bestCombo}`),
    );
    setVisible(this.unlocked, r.unlocked !== null);
    setText(this.unlocked, r.unlocked !== null ? `${TEXTS.results.unlocked} ${r.unlocked}` : '');
    const weapons = r.unlockedWeapons.join(', ');
    setVisible(this.unlockedWeapon, weapons.length > 0);
    setText(
      this.unlockedWeapon,
      weapons.length > 0 ? `${TEXTS.results.unlockedWeapon} ${weapons}` : '',
    );
  }
}

/** Una opción de la pantalla de mejoras, ya traducida. */
export interface PerkOption {
  name: string;
  description: string;
  /** Nivel actual y máximo (antes de elegirla). */
  level: number;
  maxLevel: number;
}

/**
 * Elección de mejora entre oleadas: 3 tarjetas que se eligen con 1, 2 o 3, con Enter sobre la tarjeta enfocada
 * o con un clic (el clic es un gesto del jugador y permite volver a capturar el puntero).
 */
export class PerkScreen extends Panel {
  private readonly cards = el('div', 'perk-cards');
  constructor(
    parent: HTMLElement,
    private readonly onChoose: (choice: number) => void,
  ) {
    super(parent, 'screen-perks');
    const card = el('div', 'panel');
    card.append(
      el('h1', 'title-small', TEXTS.perkScreen.title),
      el('p', 'hint', TEXTS.perkScreen.hint),
      this.cards,
    );
    this.root.append(card);
  }

  showOptions(options: readonly PerkOption[]): void {
    const items = options.map((o, i) => {
      const b = el('button', 'btn perk-card');
      b.type = 'button';
      b.append(
        el('span', 'perk-key', String(i + 1)),
        el('span', 'perk-name', o.name),
        el('span', 'perk-desc', o.description),
        el('span', 'perk-level', `${TEXTS.perkScreen.level} ${o.level + 1}/${o.maxLevel}`),
      );
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.onChoose(i + 1);
      });
      return b;
    });
    this.cards.replaceChildren(...items);
    this.show();
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
