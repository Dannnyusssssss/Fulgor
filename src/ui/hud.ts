/**
 * HUD en DOM: vida, escudo, calor, esquiva, oleada y puntos, más avisos visuales (vida baja, sobrecalentamiento,
 * oleada nueva) para que el juego se pueda jugar sin sonido. Solo toca el DOM cuando un valor cambia.
 */
import { BALANCE } from '../data/balance';
import { WEAPON_ORDER } from '../data/weapons';
import { TEXTS } from '../data/texts';
import { GameEvent, type EventRecord } from '../game/events';
import { DirectorPhase } from '../game/director';
import { EnemyKind } from '../game/enemies/types';
import { comboMultiplier } from '../game/score';
import { activeWeaponDef, activeWeaponState, type World } from '../game/world';
import { el, setText, setVisible } from './dom';

interface Bar {
  root: HTMLElement;
  fill: HTMLElement;
  value: HTMLElement;
  last: number;
}

function makeBar(label: string, kind: string): Bar {
  const root = el('div', `bar bar-${kind}`);
  const name = el('span', 'bar-label', label);
  const track = el('div', 'bar-track');
  const fill = el('div', 'bar-fill');
  track.append(fill);
  const value = el('span', 'bar-value', '');
  root.append(name, track, value);
  return { root, fill, value, last: -1 };
}

function setBar(bar: Bar, fraction: number, text: string): void {
  // Se redondea a 0,5 % para no tocar el DOM por cambios invisibles.
  const f = Math.round(Math.min(1, Math.max(0, fraction)) * 200) / 200;
  if (f !== bar.last) {
    bar.last = f;
    bar.fill.style.transform = `scaleX(${f})`;
  }
  setText(bar.value, text);
}

export class Hud {
  readonly root = el('div', 'hud');
  private readonly health = makeBar(TEXTS.hud.health, 'health');
  private readonly shield = makeBar(TEXTS.hud.shield, 'shield');
  private readonly heat = makeBar(TEXTS.hud.heat, 'heat');
  private readonly dodge = makeBar(TEXTS.hud.dodgeCooldown, 'dodge');
  private readonly ability = makeBar('', 'ability');
  private readonly barrier = makeBar(TEXTS.hud.barrier, 'barrier');
  /** Ranuras de armas: número y nombre; la activa con borde y en negrita, las bloqueadas atenuadas. */
  private readonly slots = WEAPON_ORDER.map((id, i) =>
    el('div', 'hud-slot', `${i + 1} ${TEXTS.weapons[id]}`),
  );
  private readonly slotClass = WEAPON_ORDER.map(() => '');
  private readonly heatState = el('div', 'heat-state', '');
  private readonly wave = el('div', 'hud-wave', '');
  private readonly score = el('div', 'hud-score', '');
  private readonly combo = el('div', 'hud-combo', '');
  private readonly banner = el('div', 'hud-banner', '');
  private readonly lowHealth = el('div', 'hud-low', TEXTS.hud.lowHealth);
  private readonly mute = el('div', 'hud-mute', '');
  private readonly autoFire = el('div', 'hud-autofire', TEXTS.hud.autoFireOn);
  private readonly vignette = el('div', 'vignette');
  /** Barra del jefe: nombre, fase (texto) y vida. */
  private readonly boss = el('div', 'hud-boss');
  private readonly bossBar = makeBar(TEXTS.hud.boss, 'boss');
  private readonly bossPhase = el('div', 'hud-boss-phase', '');
  private bannerTimer = 0;
  private hitLevel = 0;
  private lastVignette = -1;
  private lastClass = '';
  private reduceFlashes = false;

  constructor(parent: HTMLElement) {
    const topLeft = el('div', 'hud-top-left');
    topLeft.append(this.health.root, this.shield.root, this.barrier.root);
    setVisible(this.barrier.root, false);
    const topRight = el('div', 'hud-top-right');
    topRight.append(this.wave, this.score, this.combo);
    const bottom = el('div', 'hud-bottom');
    const weapons = el('div', 'hud-weapons');
    weapons.append(...this.slots);
    bottom.append(weapons, this.heatState, this.heat.root, this.dodge.root, this.ability.root);
    this.boss.append(this.bossBar.root, this.bossPhase);
    setVisible(this.boss, false);
    this.root.append(
      this.vignette,
      this.boss,
      topLeft,
      topRight,
      this.banner,
      this.lowHealth,
      bottom,
      this.mute,
    );
    bottom.append(this.autoFire);
    setVisible(this.autoFire, false);
    this.root.setAttribute('aria-hidden', 'true');
    setVisible(this.lowHealth, false);
    setVisible(this.banner, false);
    parent.append(this.root);
  }

  setVisible(visible: boolean): void {
    setVisible(this.root, visible);
  }

  setMuted(muted: boolean): void {
    setText(this.mute, muted ? TEXTS.hud.mutedOn : TEXTS.hud.mutedOff);
  }

  /** Indicador de disparo automático encendido (texto, no solo color). */
  setAutoFire(on: boolean): void {
    setVisible(this.autoFire, on);
  }

  setReduceFlashes(reduce: boolean): void {
    this.reduceFlashes = reduce;
  }

  onEvent(e: EventRecord): void {
    if (e.type === GameEvent.WaveStart) {
      const bossWave = e.c === 1;
      setText(this.banner, bossWave ? TEXTS.hud.bossIncoming : `${TEXTS.hud.waveIncoming} ${e.a}`);
      setVisible(this.banner, true);
      this.bannerTimer = 2.2;
    } else if (e.type === GameEvent.WaveCleared) {
      const bonus = e.b > 0 ? ` · ${TEXTS.hud.cleanBonus}${e.b}` : '';
      setText(this.banner, `${TEXTS.hud.waveCleared}${bonus}`);
      setVisible(this.banner, true);
      this.bannerTimer = 2.4;
    } else if (e.type === GameEvent.BossPhase) {
      setText(this.banner, `${TEXTS.hud.bossPhaseBanner} · ${TEXTS.hud.bossPhase} ${e.a}/3`);
      setVisible(this.banner, true);
      this.bannerTimer = 2;
    } else if (e.type === GameEvent.PlayerHit) {
      // Nivel continuo: varios golpes seguidos mantienen la viñeta, no la hacen parpadear.
      this.hitLevel = Math.min(1, this.hitLevel + 0.45);
    }
  }

  update(world: World, dt: number): void {
    const p = world.player;
    // Jefe: barra visible solo mientras está en la arena.
    let boss = null;
    for (const e of world.enemies.items) {
      if (e.active && e.kind === EnemyKind.Coloso) {
        boss = e;
        break;
      }
    }
    setVisible(this.boss, boss !== null);
    if (boss !== null) {
      setBar(this.bossBar, boss.health / boss.maxHealth, `${Math.ceil(Math.max(0, boss.health))}`);
      setText(this.bossPhase, `${TEXTS.hud.bossPhase} ${boss.phase}/3`);
    }
    const w = activeWeaponState(world);
    const def = activeWeaponDef(world);
    setBar(this.health, p.health / p.maxHealth, String(Math.ceil(p.health)));
    setBar(this.shield, p.shield / p.maxShield, String(Math.ceil(p.shield)));
    setBar(this.heat, w.heat / def.maxHeat, `${Math.round((w.heat / def.maxHeat) * 100)}%`);
    const dodgeMax = world.tuning.player.dodge.cooldown;
    const dodgeFrac = dodgeMax > 0 ? 1 - p.dodgeCooldown / dodgeMax : 1;
    setBar(this.dodge, dodgeFrac, p.dodgeCooldown <= 0 ? TEXTS.hud.dodgeReady : '');

    // Ranuras de armas (solo cambia el DOM si cambia el estado).
    this.slots.forEach((slot, i) => {
      const unlocked = world.unlockedWeapons[i] === true;
      const cls = `hud-slot${i === world.activeWeapon ? ' is-active' : ''}${unlocked ? '' : ' is-locked'}`;
      if (this.slotClass[i] !== cls) {
        this.slotClass[i] = cls;
        slot.className = cls;
        const id = WEAPON_ORDER[i];
        if (id !== undefined) {
          setText(slot, `${i + 1} ${unlocked ? TEXTS.weapons[id] : TEXTS.hud.locked}`);
        }
      }
    });

    // Habilidad: barra de recarga con su nombre; "lista" cuando se puede usar.
    const a = world.ability;
    setText(this.ability.root.firstElementChild as HTMLElement, TEXTS.abilities[a.id]);
    const abilityFrac = a.cooldownMax > 0 ? 1 - a.cooldown / a.cooldownMax : 1;
    setBar(
      this.ability,
      a.cooldown <= 0 ? 1 : abilityFrac,
      a.cooldown <= 0 ? TEXTS.hud.abilityReady : `${Math.ceil(a.cooldown)} s`,
    );
    const hasBarrier = p.barrierTimer > 0 && p.barrier > 0;
    setVisible(this.barrier.root, hasBarrier);
    if (hasBarrier) {
      setBar(this.barrier, p.barrier / Math.max(1, p.barrierMax), String(Math.ceil(p.barrier)));
    }

    let heatText = '';
    if (w.overheated) heatText = TEXTS.hud.overheated;
    else if (w.ventTimer > 0) heatText = TEXTS.hud.venting;
    setText(this.heatState, heatText);

    const cls = `hud ${w.overheated ? 'is-overheated' : ''} ${p.health / p.maxHealth <= BALANCE.player.lowHealthFraction ? 'is-low' : ''}`;
    if (cls !== this.lastClass) {
      this.lastClass = cls;
      this.root.className = cls;
    }
    setVisible(
      this.lowHealth,
      p.alive && p.health / p.maxHealth <= BALANCE.player.lowHealthFraction,
    );

    const s = world.director;
    // En Resistencia no hay total de oleadas.
    const total = world.mode === 'endless' ? '' : `/${world.waves.length}`;
    setText(this.wave, `${TEXTS.hud.wave} ${Math.max(1, s.wave)}${total}`);
    setText(this.score, `${TEXTS.hud.score} ${world.score.points}`);
    const combo = world.score.combo;
    setText(this.combo, combo > 1 ? `${TEXTS.hud.combo}${comboMultiplier(combo).toFixed(1)}` : '');

    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) setVisible(this.banner, false);
    } else if (s.phase === DirectorPhase.Rest && s.wave > 0 && !world.defeated) {
      setText(this.banner, `${TEXTS.hud.rest} ${Math.ceil(Math.max(0, s.timer))}`);
      setVisible(this.banner, true);
    } else {
      setVisible(this.banner, false);
    }

    // Viñeta de daño: sube rápido y baja despacio; opacidad baja (con "Reducir destellos", aún más baja).
    this.hitLevel = Math.max(0, this.hitLevel - dt * 1.1);
    const maxOpacity = this.reduceFlashes ? 0.22 : 0.38;
    const v = Math.round(this.hitLevel * maxOpacity * 100) / 100;
    if (v !== this.lastVignette) {
      this.lastVignette = v;
      this.vignette.style.opacity = String(v);
    }
  }

  reset(): void {
    this.hitLevel = 0;
    this.bannerTimer = 0;
    setVisible(this.banner, false);
  }
}
