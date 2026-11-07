/**
 * Controlador de la aplicación: estados (inicio, selección, jugando, pausa, resultados), entrada del navegador,
 * captura del puntero, foco, pérdida de contexto WebGL, bucle de render, cambio de arena, progreso y ajustes guardados.
 */
import type { Mesh } from 'three';
import { AudioEngine } from '../audio/engine';
import { FlashBudget } from '../core/flash-budget';
import { createPadState, PAD, PadMapper } from '../core/gamepad';
import { emptyCommand, InputMapper } from '../core/input';
import { FixedTimestep } from '../core/loop';
import { clamp, damp, lerp } from '../core/math';
import type { DebugParams } from '../core/url-params';
import { ARENAS, arenaById, type ArenaDef } from '../data/arenas';
import { BALANCE } from '../data/balance';
import { PREVENT_DEFAULT_CODES } from '../data/controls';
import type { AbilityId } from '../data/abilities';
import type { Difficulty } from '../data/difficulty';
import { PERKS } from '../data/perks';
import { TEXTS } from '../data/texts';
import { aimAssistDelta } from '../game/aim-assist';
import { DirectorPhase } from '../game/director';
import { GameEvent } from '../game/events';
import { createTuning, type Tuning } from '../game/tuning';
import {
  activeWeaponDef,
  activeWeaponState,
  createWorld,
  stepWorld,
  type World,
} from '../game/world';
import { AbilityEffects } from '../render/ability-fx';
import { buildArenaView, type ArenaView } from '../render/arena-mesh';
import { BossView } from '../render/boss-mesh';
import { ThirdPersonCamera } from '../render/camera-tps';
import { EnemyMeshes } from '../render/enemy-meshes';
import { Effects } from '../render/fx';
import { HazardsView } from '../render/hazards';
import { PickupMeshes } from '../render/pickups';
import { PlayerMesh } from '../render/player-mesh';
import { ProjectileMeshes } from '../render/projectiles';
import { Reticle } from '../render/reticle';
import { GameRenderer } from '../render/scene';
import { bestFor, isUnlocked, recordRun } from '../save/progress';
import type { SaveData, Settings } from '../save/schema';
import { writeSave, type StorageLike } from '../save/storage';
import { DebugOverlay } from './debug-overlay';
import { GamepadReader } from './gamepad-dom';
import { Hud } from './hud';
import { OffscreenIndicators } from './indicators';
import {
  ClickOverlay,
  ErrorScreen,
  Notice,
  PauseScreen,
  PerkScreen,
  ResultsScreen,
  SelectScreen,
  SettingsScreen,
  StartScreen,
  type PerkOption,
  type SelectHost,
  type SettingsHost,
} from './screens';

type AppState = 'menu' | 'select' | 'playing' | 'paused' | 'perks' | 'results' | 'lost-context';

/** Cambio del campo de visión (grados) al esquivar y al apuntar. */
const FOV_DODGE = 4;
const FOV_AIM = -5;

/** Segundos entre el final de la partida y la pantalla de resultados (deja ver el final). */
const END_DELAY = 1.2;
/** Por debajo de esta distancia de cámara, Chispa se oculta para no tapar la vista. */
const CAMERA_HIDE_PLAYER_DISTANCE = 0.9;

export interface AppOptions {
  canvas: HTMLCanvasElement;
  uiRoot: HTMLElement;
  save: SaveData;
  storage: StorageLike | null;
  debug: DebugParams;
  /** Genera una semilla nueva para cada partida (la capa de arranque usa crypto.getRandomValues). */
  newSeed: () => number;
}

export function startApp(opts: AppOptions): void {
  const renderer = GameRenderer.create(opts.canvas, opts.save.settings.quality);
  if (renderer === null) {
    new ErrorScreen(opts.uiRoot).showMessage(TEXTS.errors.noWebgl);
    return;
  }
  new App(opts, renderer).run();
}

class App implements SettingsHost, SelectHost {
  private state: AppState = 'menu';
  private readonly save: SaveData;
  private readonly input = new InputMapper(BALANCE.camera.maxLookPerEvent);
  private readonly timestep = new FixedTimestep(
    1 / BALANCE.sim.stepHz,
    BALANCE.sim.maxFrameSeconds,
  );
  private readonly budget = new FlashBudget(
    BALANCE.flash.maxPerWindow,
    BALANCE.flash.windowSeconds,
  );
  private readonly cmd = emptyCommand();
  /** Audio sintetizado: el contexto se crea con el primer gesto del jugador. */
  private readonly audio = new AudioEngine();
  /** Mando: lectura del navegador y mapeo puro. */
  private readonly padReader = new GamepadReader();
  private readonly padMapper = new PadMapper();
  private readonly pad = createPadState();
  private padConnected = false;
  private padFireWas = false;
  /** Disparo automático encendido (con la asistencia activada). */
  private autoFireOn = false;
  /** Desfase suave del campo de visión (esquiva y apuntado), apagado con "Reducir movimiento". */
  private fovOffset = 0;
  private readonly look = { x: 0, y: 0 };
  private readonly tuning: Tuning = createTuning();
  private world: World;
  private readonly camera: ThirdPersonCamera;
  /** Arena para la que están construidas las mallas actuales. */
  private builtArena: ArenaDef;
  private arenaView: ArenaView;
  private hazardsView: HazardsView;
  private readonly playerMesh: PlayerMesh;
  private readonly enemyMeshes: EnemyMeshes;
  private readonly projectileMeshes: ProjectileMeshes;
  private readonly pickupMeshes: PickupMeshes;
  private readonly fx: Effects;
  private readonly abilityFx: AbilityEffects;
  private readonly bossView: BossView;
  private readonly reticle: Reticle;
  private readonly hud: Hud;
  private readonly indicators: OffscreenIndicators;
  private readonly notice: Notice;
  private readonly start: StartScreen;
  private readonly selectScreen: SelectScreen;
  private readonly settingsScreen: SettingsScreen;
  private readonly pause: PauseScreen;
  private readonly results: ResultsScreen;
  private readonly perkScreen: PerkScreen;
  /** Mejora elegida en la pantalla de mejoras, pendiente de entregar a la simulación (0 = ninguna). */
  private pendingPerk = 0;
  private readonly click: ClickOverlay;
  private readonly error: ErrorScreen;
  private readonly debug: DebugOverlay | null;
  /** Pantalla a la que vuelve "Volver" desde los ajustes. */
  private settingsReturn: 'menu' | 'paused' = 'menu';
  private lastFrame = 0;
  /** Sombras con las que está construida la arena actual. */
  private arenaShadows: boolean;
  private endTimer = 0;
  private pointerLocked = false;
  /** Se pidió la captura del puntero y aún no hay respuesta. */
  private lockPending = false;

  constructor(
    private readonly opts: AppOptions,
    private readonly renderer: GameRenderer,
  ) {
    this.save = opts.save;
    this.applyDebugSelection();
    const s = this.save.settings;
    this.builtArena = this.selectedArena();
    this.world = this.createWorld(this.save.lastSeed ?? 1, this.builtArena);
    const shadows = BALANCE.quality[s.quality].shadows;
    const scene = renderer.scene;
    this.camera = new ThirdPersonCamera(renderer.camera);
    this.arenaView = buildArenaView(scene, this.builtArena, shadows);
    this.hazardsView = new HazardsView(scene, this.builtArena, this.budget);
    this.arenaShadows = shadows;
    this.playerMesh = new PlayerMesh(scene, true);
    this.enemyMeshes = new EnemyMeshes(scene, BALANCE.pools.enemies, true);
    this.projectileMeshes = new ProjectileMeshes(scene, BALANCE.pools.projectiles);
    this.pickupMeshes = new PickupMeshes(scene);
    this.fx = new Effects(scene, this.budget);
    this.abilityFx = new AbilityEffects(scene, this.budget);
    this.bossView = new BossView(scene, this.budget);
    this.reticle = new Reticle(scene);

    const ui = opts.uiRoot;
    this.hud = new Hud(ui);
    this.indicators = new OffscreenIndicators(ui);
    this.notice = new Notice(ui);
    this.start = new StartScreen(
      ui,
      this,
      () => this.showSelect(),
      () => this.openSettings('menu'),
    );
    this.selectScreen = new SelectScreen(
      ui,
      this,
      () => this.startRun(),
      () => this.showMenu(),
    );
    this.settingsScreen = new SettingsScreen(ui, this, () => this.closeSettings());
    this.pause = new PauseScreen(
      ui,
      this,
      () => this.resume(),
      () => this.openSettings('paused'),
      () => this.toMenu(),
    );
    this.results = new ResultsScreen(
      ui,
      () => this.startRun(),
      () => this.showSelect(),
      () => this.toMenu(),
    );
    this.perkScreen = new PerkScreen(ui, (choice) => this.choosePerk(choice));
    this.click = new ClickOverlay(ui, () => this.resume());
    this.error = new ErrorScreen(ui);
    this.debug = opts.debug.debug ? new DebugOverlay(ui, this.tuning, () => this.world) : null;

    this.camera.reset(this.builtArena.playerSpawn.yaw);
    this.applySettings();
    this.bindEvents();
    this.showMenu();
  }

  // ---------- Ajustes ----------

  get(): Settings {
    return this.save.settings;
  }

  update(patch: Partial<Settings>): void {
    Object.assign(this.save.settings, patch);
    this.applySettings();
    this.persist();
  }

  private persist(): void {
    if (!writeSave(this.opts.storage, this.save)) this.notice.show(TEXTS.settings.saveFailed, 4);
  }

  private applySettings(): void {
    const s = this.save.settings;
    this.budget.setReduced(s.reduceFlashes);
    this.renderer.setQuality(s.quality);
    this.renderer.setFov(s.fov);
    const shadows = BALANCE.quality[s.quality].shadows;
    if (shadows !== this.arenaShadows) {
      // Las sombras cambian los shaders: se reconstruye la arena y se recompilan los materiales.
      this.arenaShadows = shadows;
      this.rebuildArena(this.builtArena);
      this.renderer.scene.traverse((obj) => {
        const m = (obj as Partial<Mesh>).material;
        if (Array.isArray(m)) m.forEach((x) => (x.needsUpdate = true));
        else if (m) m.needsUpdate = true;
      });
    }
    this.fx.setSettings({ reduceMotion: s.reduceMotion, quality: s.quality });
    this.hud.setMuted(s.muted);
    this.audio.setLevels({ muted: s.muted, volume: s.volume, musicVolume: s.musicVolume });
    this.camera.setReduceMotion(s.reduceMotion);
    if (!s.autoFire) this.setAutoFire(false);
    this.hud.setReduceFlashes(s.reduceFlashes);
  }

  // ---------- Selección y progreso ----------

  /** ?arena= elige la arena inicial (si existe), aunque esté bloqueada: es solo para depuración. */
  private applyDebugSelection(): void {
    const id = this.opts.debug.arena;
    if (id !== null && arenaById(id) !== undefined) this.save.progress.lastArena = id;
  }

  private selectedArena(): ArenaDef {
    const def = arenaById(this.save.progress.lastArena);
    const allowed =
      def !== undefined && (isUnlocked(this.save, def.id) || this.opts.debug.arena === def.id);
    return allowed && def ? def : (ARENAS[0] as ArenaDef);
  }

  arenas(): readonly { id: string; unlocked: boolean; completed: boolean }[] {
    return ARENAS.map((a) => ({
      id: a.id,
      unlocked: isUnlocked(this.save, a.id) || this.opts.debug.arena === a.id,
      completed: this.save.progress.completed.some((k) => k.startsWith(`${a.id}:`)),
    }));
  }

  best(arena: string, difficulty: Difficulty): number {
    return bestFor(this.save, arena, difficulty);
  }

  ability(): AbilityId {
    return this.save.progress.lastAbility;
  }

  selectAbility(id: AbilityId): void {
    this.save.progress.lastAbility = id;
    this.persist();
  }

  selection(): { arena: string; difficulty: Difficulty } {
    return { arena: this.selectedArena().id, difficulty: this.save.progress.lastDifficulty };
  }

  select(arena: string, difficulty: Difficulty): void {
    this.save.progress.lastArena = arena;
    this.save.progress.lastDifficulty = difficulty;
    this.persist();
    // La arena elegida se ve detrás del menú.
    const def = this.selectedArena();
    if (def.id !== this.builtArena.id) {
      this.rebuildArena(def);
      this.world = this.createWorld(this.save.lastSeed ?? 1, def);
      this.camera.reset(def.playerSpawn.yaw);
    }
  }

  // ---------- Estados ----------

  private createWorld(seed: number, arena: ArenaDef): World {
    const d = this.opts.debug;
    return createWorld({
      seed,
      arena,
      difficulty: this.save.progress.lastDifficulty,
      god: d.god,
      tuning: this.tuning,
      startWave: d.wave ?? 1,
      stress: d.stress,
      weapons: this.save.progress.unlockedWeapons,
      ability: this.save.progress.lastAbility,
    });
  }

  /** Cambia las mallas de la arena (liberando las anteriores). */
  private rebuildArena(def: ArenaDef): void {
    this.arenaView.dispose();
    this.hazardsView.dispose();
    const shadows = BALANCE.quality[this.save.settings.quality].shadows;
    this.arenaView = buildArenaView(this.renderer.scene, def, shadows);
    this.hazardsView = new HazardsView(this.renderer.scene, def, this.budget);
    this.builtArena = def;
  }

  private hideScreens(): void {
    this.start.hide();
    this.selectScreen.hide();
    this.settingsScreen.hide();
    this.pause.hide();
    this.results.hide();
    this.perkScreen.hide();
    this.click.hide();
  }

  private showMenu(): void {
    this.state = 'menu';
    this.hideScreens();
    this.hud.setVisible(false);
    this.reticle.setVisible(false);
    this.start.show();
  }

  private showSelect(): void {
    this.exitLock();
    this.state = 'select';
    this.hideScreens();
    this.hud.setVisible(false);
    this.reticle.setVisible(false);
    this.selectScreen.show();
  }

  private startRun(): void {
    const seed = this.opts.newSeed() >>> 0;
    this.save.lastSeed = seed;
    this.persist();
    const def = this.selectedArena();
    if (def.id !== this.builtArena.id) this.rebuildArena(def);
    this.world = this.createWorld(seed, def);
    this.fx.clear();
    this.abilityFx.clear();
    this.bossView.clear();
    this.hud.reset();
    this.camera.reset(def.playerSpawn.yaw);
    this.input.releaseAll();
    this.timestep.reset();
    this.endTimer = 0;
    this.setAutoFire(false);
    this.playerMesh.setVisible(true);
    this.enterPlaying();
  }

  /** `lock`: pedir la captura del puntero (solo si viene de un gesto de teclado o ratón, no del mando). */
  private enterPlaying(lock = true): void {
    this.state = 'playing';
    this.hideScreens();
    this.hud.setVisible(true);
    this.reticle.setVisible(true);
    this.timestep.reset();
    if (lock) this.requestLock();
    this.opts.canvas.focus({ preventScroll: true });
  }

  private setAutoFire(on: boolean): void {
    this.autoFireOn = on;
    this.hud.setAutoFire(on);
  }

  /** Lee el mando una vez por frame y avisa al conectarlo o desconectarlo. */
  private pollPad(): void {
    this.padMapper.update(this.padReader.read(), this.pad);
    if (this.pad.connected !== this.padConnected) {
      this.padConnected = this.pad.connected;
      this.notice.show(this.padConnected ? TEXTS.gamepadConnected : TEXTS.gamepadDisconnected, 3);
    }
  }

  private pauseGame(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.releaseAll();
    this.exitLock();
    this.hideScreens();
    this.pause.show();
  }

  private resume(lock = true): void {
    if (this.state !== 'paused') return;
    this.enterPlaying(lock);
  }

  /** Abre la elección de mejoras: suelta la captura del puntero sin pausar (no es una pausa). */
  private showPerks(): void {
    this.state = 'perks';
    this.input.releaseAll();
    this.exitLock();
    this.hideScreens();
    const perks = this.world.perks;
    const options: PerkOption[] = [];
    for (let i = 0; i < perks.offerCount; i++) {
      const index = perks.offer[i] ?? -1;
      const def = PERKS[index];
      if (def === undefined) continue;
      const text = TEXTS.perks[def.id];
      options.push({
        name: text?.name ?? def.id,
        description: text?.description ?? '',
        level: perks.levels[index] ?? 0,
        maxLevel: def.maxLevel,
      });
    }
    this.perkScreen.showOptions(options);
  }

  /** Se llama desde un gesto del jugador (tecla o clic): vuelve al juego y pide de nuevo la captura. */
  private choosePerk(choice: number, lock = true): void {
    if (this.state !== 'perks' || choice < 1 || choice > this.world.perks.offerCount) return;
    this.pendingPerk = choice;
    this.enterPlaying(lock);
  }

  private openSettings(from: 'menu' | 'paused'): void {
    this.settingsReturn = from;
    this.hideScreens();
    this.settingsScreen.show();
  }

  private closeSettings(): void {
    this.settingsScreen.hide();
    if (this.settingsReturn === 'menu') this.showMenu();
    else this.pause.show();
  }

  private toMenu(): void {
    this.exitLock();
    this.input.releaseAll();
    this.showMenu();
  }

  private showResults(): void {
    const w = this.world;
    this.state = 'results';
    this.exitLock();
    this.input.releaseAll();
    this.hideScreens();
    this.hud.setVisible(false);
    this.reticle.setVisible(false);
    // Las partidas de depuración (?stress, ?god u oleada inicial) no cuentan para el progreso.
    const d = this.opts.debug;
    const counts = !d.stress && !d.god && d.wave === null;
    const arena = w.arena.def.id;
    let best = bestFor(this.save, arena, w.difficulty);
    let newRecord = false;
    let unlocked: string | null = null;
    let unlockedWeapons: string[] = [];
    if (counts) {
      const r = recordRun(
        this.save,
        arena,
        w.difficulty,
        w.score.points,
        w.victory,
        w.director.wave,
      );
      best = r.best;
      newRecord = r.newRecord;
      unlocked = r.unlocked;
      unlockedWeapons = r.unlockedWeapons.map((id) => TEXTS.weapons[id]);
      this.persist();
    }
    this.results.setResult({
      victory: w.victory,
      points: w.score.points,
      best,
      newRecord,
      wave: w.director.wave,
      bestCombo: w.score.bestCombo,
      unlocked: unlocked !== null ? (TEXTS.arenas[unlocked] ?? unlocked) : null,
      unlockedWeapons,
    });
    this.results.show();
  }

  private toggleMute(): void {
    this.update({ muted: !this.save.settings.muted });
  }

  // ---------- Captura del puntero ----------

  /** Solo se llama desde un gesto del jugador (clic o tecla). */
  private requestLock(): void {
    const canvas = this.opts.canvas;
    if (this.pointerLocked || this.lockPending) return;
    if (typeof canvas.requestPointerLock !== 'function') {
      this.notice.show(TEXTS.pointerLockUnavailable);
      return;
    }
    this.lockPending = true;
    try {
      const result = canvas.requestPointerLock() as unknown;
      if (result instanceof Promise) result.catch(() => this.onLockError());
    } catch {
      this.onLockError();
    }
  }

  private onLockError(): void {
    this.lockPending = false;
    // Sin captura el juego sigue siendo jugable: las flechas giran la cámara.
    if (this.state === 'playing') this.notice.show(TEXTS.pointerLockUnavailable);
  }

  private exitLock(): void {
    if (document.pointerLockElement === this.opts.canvas) document.exitPointerLock();
  }

  // ---------- Eventos del navegador ----------

  private bindEvents(): void {
    const canvas = this.opts.canvas;

    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas;
      this.lockPending = false;
      const wasLocked = this.pointerLocked;
      this.pointerLocked = locked;
      // Al perder la captura (Esc o clic fuera) el juego se pausa.
      if (wasLocked && !locked && this.state === 'playing') this.pauseGame();
    });
    document.addEventListener('pointerlockerror', () => this.onLockError());

    // El audio solo se activa tras una interacción del jugador (requisito de los navegadores).
    const unlockAudio = (): void => this.audio.unlock();
    window.addEventListener('pointerdown', unlockAudio, true);
    window.addEventListener('keydown', unlockAudio, true);

    window.addEventListener('keydown', (ev) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (this.state === 'playing') {
        const action = this.input.press(ev.code);
        if (action !== null && PREVENT_DEFAULT_CODES.has(ev.code)) ev.preventDefault();
        return;
      }
      // Fuera del juego solo se atienden M (silencio), P (continuar) y 1-3 en las mejoras; el resto lo maneja la interfaz.
      if (ev.repeat) return;
      if (this.state === 'perks') {
        const choice =
          ev.code === 'Digit1' ? 1 : ev.code === 'Digit2' ? 2 : ev.code === 'Digit3' ? 3 : 0;
        if (choice > 0) {
          ev.preventDefault();
          this.choosePerk(choice);
          return;
        }
      }
      if (ev.code === 'KeyM') this.toggleMute();
      else if (ev.code === 'KeyP' && this.state === 'paused' && !this.settingsScreen.visible) {
        this.resume();
      }
    });
    window.addEventListener('keyup', (ev) => {
      this.input.release(ev.code);
    });

    canvas.addEventListener('mousedown', (ev) => {
      if (this.state !== 'playing') return;
      // Si se juega sin captura, un clic en el juego vuelve a intentarla.
      if (!this.pointerLocked) this.requestLock();
      this.input.press(`Mouse${ev.button}`);
    });
    window.addEventListener('mouseup', (ev) => {
      this.input.release(`Mouse${ev.button}`);
    });
    document.addEventListener('mousemove', (ev) => {
      if (this.state === 'playing' && this.pointerLocked) {
        this.input.addLook(ev.movementX, ev.movementY);
      }
    });
    // El menú contextual se bloquea solo dentro del canvas y mientras se juega (por el clic derecho de apuntar).
    canvas.addEventListener('contextmenu', (ev) => {
      if (this.state === 'playing') ev.preventDefault();
    });

    // Pausa automática al perder el foco o al ocultar la pestaña.
    window.addEventListener('blur', () => {
      this.input.releaseAll();
      this.pauseGame();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.input.releaseAll();
        this.pauseGame();
      }
      this.audio.setSuspended(document.hidden);
    });

    canvas.addEventListener('webglcontextlost', (ev) => {
      ev.preventDefault();
      this.pauseGame();
      this.state = 'lost-context';
      this.hideScreens();
      this.error.showMessage(TEXTS.errors.contextLost);
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.error.hide();
      this.state = 'paused';
      this.click.showWith(TEXTS.errors.contextRestored);
    });
  }

  /** Sacudida leve para los golpes fuertes cercanos (el render la ignora con "Reducir movimiento"). */
  private onShakeEvent(type: number, x: number, z: number): void {
    const p = this.world.player;
    const near = Math.hypot(x - p.pos.x, z - p.pos.z) < 5;
    if (type === GameEvent.PlayerHit) this.camera.addShake(0.35);
    else if (type === GameEvent.BossPhase) this.camera.addShake(0.4);
    else if (type === GameEvent.AbilityOnda) this.camera.addShake(0.2);
    else if (type === GameEvent.ZoneImpact && near) this.camera.addShake(0.3);
  }

  // ---------- Bucle ----------

  run(): void {
    this.lastFrame = performance.now();
    const frame = (t: number): void => {
      requestAnimationFrame(frame);
      const dt = Math.min(0.1, Math.max(0, (t - this.lastFrame) / 1000));
      this.lastFrame = t;
      this.frame(dt, t / 1000);
    };
    requestAnimationFrame(frame);
  }

  private frame(dt: number, now: number): void {
    if (this.state === 'lost-context') return;
    const world = this.world;
    const s = this.save.settings;
    this.renderer.syncSize();
    let alpha = 1;
    this.pollPad();
    const pad = this.pad;
    // Con el mando: Start continúa desde la pausa y la cruceta elige la mejora (sin pedir la captura del puntero).
    if (this.state === 'paused' && pad.pause && !this.settingsScreen.visible) this.resume(false);
    else if (this.state === 'perks' && pad.weapon > 0) this.choosePerk(pad.weapon, false);

    if (this.state === 'playing') {
      // La cámara gira en cada frame de render, sin esperar al paso fijo (ratón, flechas y stick derecho).
      this.input.consumeLook(this.look);
      this.camera.applyLook(
        this.look.x,
        this.look.y,
        clamp(this.input.turnAxisX() + pad.lookX * PAD.lookSpeed, -PAD.lookSpeed, PAD.lookSpeed),
        clamp(this.input.turnAxisY() + pad.lookY * PAD.lookSpeed, -PAD.lookSpeed, PAD.lookSpeed),
        s.sensitivity,
        s.invertY,
        dt,
      );
      // Apuntado asistido: corrección suave y limitada hacia el enemigo a tiro más alineado.
      if (s.aimAssist) {
        const d = world.diff;
        this.camera.addYaw(
          aimAssistDelta(world, this.camera.yaw, d.aimAssistCone, d.aimAssistRate, dt),
        );
      }
      if (this.input.consumePressed('shoulder') || pad.shoulder) this.camera.toggleShoulder();
      if (this.input.consumePressed('mute')) this.toggleMute();
      // Disparo automático: cada pulsación (ratón, Espacio o gatillo) lo enciende o lo apaga.
      const padFirePressed = pad.fire && !this.padFireWas;
      this.padFireWas = pad.fire;
      if (s.autoFire) {
        if (this.input.consumePressed('fire') || padFirePressed) this.setAutoFire(!this.autoFireOn);
      } else {
        this.input.consumePressed('fire');
      }
      if (this.input.consumePressed('pause') || pad.pause) {
        this.pauseGame();
      } else {
        const steps = this.timestep.advance(dt);
        for (let i = 0; i < steps; i++) {
          this.input.fillCommand(this.cmd, this.camera.yaw);
          const c = this.cmd;
          // El mando se suma al teclado; sus pulsaciones van solo en el primer paso del frame.
          if (pad.moveX !== 0 || pad.moveZ !== 0) {
            c.moveX = pad.moveX;
            c.moveZ = pad.moveZ;
          }
          c.fire = s.autoFire ? this.autoFireOn : c.fire || pad.fire;
          c.aim = c.aim || pad.aim;
          if (i === 0) {
            c.dodge = c.dodge || pad.dodge;
            c.vent = c.vent || pad.vent;
            c.ability = c.ability || pad.ability;
            if (pad.weapon > 0) c.weapon = pad.weapon;
          }
          c.perk = this.pendingPerk;
          stepWorld(world, c);
          if (world.director.phase !== DirectorPhase.PerkChoice) this.pendingPerk = 0;
        }
        // Oferta de mejoras: se detiene el juego y se muestra la elección.
        if (world.director.phase === DirectorPhase.PerkChoice && this.pendingPerk === 0) {
          this.showPerks();
        }
        alpha = this.timestep.alpha;
        if (world.defeated || world.victory) {
          this.endTimer += dt;
          if (this.endTimer >= END_DELAY) this.showResults();
        }
      }
    }

    world.events.drain((e) => {
      this.fx.handle(e, now);
      this.abilityFx.handle(e, now);
      this.bossView.handle(e, now);
      this.audio.handle(e);
      this.onShakeEvent(e.type, e.x, e.z);
      this.hud.onEvent(e);
      if (e.type === GameEvent.PlayerDefeated) this.playerMesh.setVisible(false);
      else if (e.type === GameEvent.HazardActivate) this.hazardsView.onActivate(e.a, now);
    });

    const p = world.player;
    const px = lerp(p.prev.x, p.pos.x, alpha);
    const pz = lerp(p.prev.z, p.pos.z, alpha);
    this.camera.update(world.arena, px, pz, p.aiming && this.state === 'playing', dt);
    // Campo de visión: un poco más abierto al esquivar y más cerrado al apuntar, con transición suave.
    const fovTarget = s.reduceMotion
      ? 0
      : p.dodgeTimer > 0
        ? FOV_DODGE
        : p.aiming && this.state === 'playing'
          ? FOV_AIM
          : 0;
    this.fovOffset = damp(this.fovOffset, fovTarget, 10, dt);
    this.renderer.setFov(Math.round((s.fov + this.fovOffset) * 100) / 100);
    const speed = Math.hypot(p.vel.x, p.vel.z);
    const wdef = activeWeaponDef(world);
    const heatFrac = activeWeaponState(world).heat / wdef.maxHeat;
    this.playerMesh.setWeapon(world.activeWeapon);
    this.playerMesh.update(px, pz, this.camera.yaw, speed, p.dodgeTimer > 0, heatFrac, dt);
    this.playerMesh.setCameraTooClose(this.camera.currentDistance < CAMERA_HIDE_PLAYER_DISTANCE);
    this.reticle.update(world.arena, px, pz, this.camera.yaw, wdef.projectileRadius);
    this.enemyMeshes.update(world, alpha, dt);
    this.bossView.update(world, alpha, dt);
    this.projectileMeshes.update(world, alpha);
    this.pickupMeshes.update(world, dt);
    this.hazardsView.update(world.time, dt);
    const firing = this.state === 'playing' && this.cmd.fire;
    this.fx.update(dt, p, px, pz, firing);
    this.abilityFx.update(world, px, pz, dt);
    this.audio.update(world, px, pz, this.camera.yaw, this.state === 'playing', dt);

    this.renderer.render();

    if (this.state === 'playing') {
      this.hud.update(world, dt);
      const c = this.opts.canvas;
      this.indicators.update(world, this.renderer.camera, c.clientWidth, c.clientHeight, true);
    } else {
      this.indicators.update(world, this.renderer.camera, 0, 0, false);
    }
    this.notice.update(dt);
    this.debug?.update(
      dt,
      world,
      this.budget.grantedInWindow(now),
      this.renderer.renderer.info.render.calls,
    );
  }
}
