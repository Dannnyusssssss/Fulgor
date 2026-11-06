/**
 * Controlador de la aplicación: estados (inicio, selección, jugando, pausa, resultados), entrada del navegador,
 * captura del puntero, foco, pérdida de contexto WebGL, bucle de render, cambio de arena, progreso y ajustes guardados.
 */
import type { Mesh } from 'three';
import { FlashBudget } from '../core/flash-budget';
import { emptyCommand, InputMapper } from '../core/input';
import { FixedTimestep } from '../core/loop';
import { lerp } from '../core/math';
import type { DebugParams } from '../core/url-params';
import { ARENAS, arenaById, type ArenaDef } from '../data/arenas';
import { BALANCE } from '../data/balance';
import { PREVENT_DEFAULT_CODES } from '../data/controls';
import type { Difficulty } from '../data/difficulty';
import { TEXTS } from '../data/texts';
import { GameEvent } from '../game/events';
import { createTuning, type Tuning } from '../game/tuning';
import { createWorld, stepWorld, type World } from '../game/world';
import { buildArenaView, type ArenaView } from '../render/arena-mesh';
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
import { Hud } from './hud';
import { OffscreenIndicators } from './indicators';
import {
  ClickOverlay,
  ErrorScreen,
  Notice,
  PauseScreen,
  ResultsScreen,
  SelectScreen,
  SettingsScreen,
  StartScreen,
  type SelectHost,
  type SettingsHost,
} from './screens';

type AppState = 'menu' | 'select' | 'playing' | 'paused' | 'results' | 'lost-context';

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
  private readonly reticle: Reticle;
  private readonly hud: Hud;
  private readonly indicators: OffscreenIndicators;
  private readonly notice: Notice;
  private readonly start: StartScreen;
  private readonly selectScreen: SelectScreen;
  private readonly settingsScreen: SettingsScreen;
  private readonly pause: PauseScreen;
  private readonly results: ResultsScreen;
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
    this.hud.reset();
    this.camera.reset(def.playerSpawn.yaw);
    this.input.releaseAll();
    this.timestep.reset();
    this.endTimer = 0;
    this.playerMesh.setVisible(true);
    this.enterPlaying();
  }

  private enterPlaying(): void {
    this.state = 'playing';
    this.hideScreens();
    this.hud.setVisible(true);
    this.reticle.setVisible(true);
    this.timestep.reset();
    this.requestLock();
    this.opts.canvas.focus({ preventScroll: true });
  }

  private pauseGame(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.releaseAll();
    this.exitLock();
    this.hideScreens();
    this.pause.show();
  }

  private resume(): void {
    if (this.state !== 'paused') return;
    this.enterPlaying();
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
    if (counts) {
      const r = recordRun(this.save, arena, w.difficulty, w.score.points, w.victory);
      best = r.best;
      newRecord = r.newRecord;
      unlocked = r.unlocked;
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

    window.addEventListener('keydown', (ev) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (this.state === 'playing') {
        const action = this.input.press(ev.code);
        if (action !== null && PREVENT_DEFAULT_CODES.has(ev.code)) ev.preventDefault();
        return;
      }
      // Fuera del juego solo se atienden M (silencio) y P (continuar); el resto lo maneja la interfaz.
      if (ev.repeat) return;
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

    if (this.state === 'playing') {
      // La cámara gira en cada frame de render, sin esperar al paso fijo.
      this.input.consumeLook(this.look);
      this.camera.applyLook(
        this.look.x,
        this.look.y,
        this.input.turnAxisX(),
        this.input.turnAxisY(),
        s.sensitivity,
        s.invertY,
        dt,
      );
      if (this.input.consumePressed('shoulder')) this.camera.toggleShoulder();
      if (this.input.consumePressed('mute')) this.toggleMute();
      if (this.input.consumePressed('pause')) {
        this.pauseGame();
      } else {
        const steps = this.timestep.advance(dt);
        for (let i = 0; i < steps; i++) {
          this.input.fillCommand(this.cmd, this.camera.yaw);
          stepWorld(world, this.cmd);
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
      this.hud.onEvent(e);
      if (e.type === GameEvent.PlayerDefeated) this.playerMesh.setVisible(false);
      else if (e.type === GameEvent.HazardActivate) this.hazardsView.onActivate(e.a, now);
    });

    const p = world.player;
    const px = lerp(p.prev.x, p.pos.x, alpha);
    const pz = lerp(p.prev.z, p.pos.z, alpha);
    this.camera.update(world.arena, px, pz, p.aiming && this.state === 'playing', dt);
    const speed = Math.hypot(p.vel.x, p.vel.z);
    const heatFrac = world.weapon.heat / world.tuning.weapon.maxHeat;
    this.playerMesh.update(px, pz, this.camera.yaw, speed, p.dodgeTimer > 0, heatFrac, dt);
    this.playerMesh.setCameraTooClose(this.camera.currentDistance < CAMERA_HIDE_PLAYER_DISTANCE);
    this.reticle.update(world.arena, px, pz, this.camera.yaw, world.tuning.weapon.projectileRadius);
    this.enemyMeshes.update(world, alpha, dt);
    this.projectileMeshes.update(world, alpha);
    this.pickupMeshes.update(world, dt);
    this.hazardsView.update(world.time, dt);
    const firing = this.state === 'playing' && this.cmd.fire;
    this.fx.update(dt, p, px, pz, firing);

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
