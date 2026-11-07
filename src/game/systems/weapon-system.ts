/**
 * Sistema de armas: cambio de arma (1, 2, 3), calor de cada arma, ventilado y disparo según la forma del arma
 * (proyectil, abanico o haz). El arma guardada se sigue enfriando a su ritmo normal.
 */
import { forwardInto, segmentCircleT, vec2 } from '../../core/math';
import type { PlayerCommand } from '../../core/input';
import type { WeaponDef } from '../../data/weapons';
import { sweepObstacles } from '../collision';
import { isDamageable, type Enemy } from '../enemies/types';
import { GameEvent } from '../events';
import { Team } from '../projectiles';
import { updateWeapon, WeaponFlag } from '../weapon';
import type { World } from '../world';
import { damageEnemy } from './damage';
import { isShieldBlock, MAX_ENEMY_RADIUS } from './projectile-system';

/** Resultado de un pulso del Rayo, tal como lo recibe el render. */
export const BeamHit = {
  None: 0,
  Enemy: 1,
  Blocked: 2,
  Wall: 3,
} as const;

export function updateWeaponSystem(world: World, cmd: PlayerCommand, dt: number): void {
  const p = world.player;
  const alive = p.alive;

  // Cambio de arma: solo a una ranura desbloqueada y distinta de la actual.
  if (alive && cmd.weapon >= 1 && cmd.weapon <= world.weapons.length) {
    const slot = cmd.weapon - 1;
    if (slot !== world.activeWeapon && world.unlockedWeapons[slot] === true) {
      world.activeWeapon = slot;
      world.events.emit(GameEvent.WeaponSwitch, p.pos.x, p.pos.z, slot);
    }
  }

  for (let i = 0; i < world.weapons.length; i++) {
    const state = world.weapons[i];
    const def = world.weaponDefs[i];
    if (state === undefined || def === undefined) continue;
    const active = i === world.activeWeapon;
    const flags = updateWeapon(
      state,
      def,
      active && alive && cmd.fire,
      active && alive && cmd.vent,
      dt,
    );
    if (!active) continue;
    if (flags & WeaponFlag.VentStarted) world.events.emit(GameEvent.Vent, p.pos.x, p.pos.z);
    if (flags & WeaponFlag.Fired && fireWeapon(world, def)) {
      world.events.emit(GameEvent.Shot, p.pos.x, p.pos.z, p.yaw, i);
    }
    if (flags & WeaponFlag.Overheated) world.events.emit(GameEvent.Overheat, p.pos.x, p.pos.z);
  }
}

/** Dispara el arma según su forma. Devuelve true si salió algo. */
function fireWeapon(world: World, def: WeaponDef): boolean {
  if (def.mode === 'beam') {
    fireBeam(world, def);
    return true;
  }
  if (def.mode === 'spread') {
    // Abanico fijo y simétrico (sin aleatoriedad): los perdigones se reparten de un borde al otro.
    const n = Math.max(1, Math.floor(def.pellets));
    let any = false;
    for (let k = 0; k < n; k++) {
      const offset = n > 1 ? -def.spreadAngle / 2 + (def.spreadAngle * k) / (n - 1) : 0;
      if (spawnPlayerProjectile(world, offset, def)) any = true;
    }
    return any;
  }
  return spawnPlayerProjectile(world, 0, def);
}

const fwd = vec2();

/**
 * Crea un proyectil del jugador en la dirección del yaw (más un desvío opcional para el abanico).
 * Sale del centro de Chispa para no cruzar paredes cercanas.
 */
export function spawnPlayerProjectile(
  world: World,
  yawOffset = 0,
  def: WeaponDef | undefined = world.weaponDefs[world.activeWeapon],
): boolean {
  const p = world.player;
  if (def === undefined) return false;
  const proj = world.projectiles.acquire();
  if (proj === null) return false;
  forwardInto(fwd, p.yaw + yawOffset);
  proj.team = Team.Player;
  proj.x = p.pos.x;
  proj.z = p.pos.z;
  proj.prevX = proj.x;
  proj.prevZ = proj.z;
  proj.vx = fwd.x * def.projectileSpeed;
  proj.vz = fwd.z * def.projectileSpeed;
  proj.radius = def.projectileRadius;
  proj.damage = def.damage;
  proj.remaining = def.range;
  proj.range = def.range;
  proj.falloffStart = def.falloffStart;
  proj.falloffMin = def.falloffMin;
  return true;
}

/**
 * Pulso del Rayo: instantáneo a lo largo de la dirección de la cámara, hasta la primera pared, cobertura o enemigo.
 * El escudo frontal del Blindado lo detiene igual que a un proyectil.
 */
export function fireBeam(world: World, def: WeaponDef): void {
  const p = world.player;
  forwardInto(fwd, p.yaw);
  const ax = p.pos.x;
  const az = p.pos.z;
  const bx = ax + fwd.x * def.range;
  const bz = az + fwd.z * def.range;
  const wallT = sweepObstacles(world.arena, ax, az, bx, bz, def.projectileRadius);
  let bestT = wallT;
  let hit: Enemy | null = null;
  const items = world.enemies.items;
  const out = world.scratch;
  const n = world.enemyHash.query(
    (ax + bx) / 2,
    (az + bz) / 2,
    def.range / 2 + def.projectileRadius + MAX_ENEMY_RADIUS,
    out,
  );
  for (let i = 0; i < n; i++) {
    const e = items[out[i] ?? 0];
    if (e === undefined || !isDamageable(e)) continue;
    const t = segmentCircleT(ax, az, bx, bz, e.pos.x, e.pos.z, e.radius + def.projectileRadius);
    if (t >= 0 && (bestT < 0 || t < bestT)) {
      bestT = t;
      hit = e;
    }
  }
  const len = (bestT >= 0 ? bestT : 1) * def.range;
  let result: number = bestT >= 0 ? BeamHit.Wall : BeamHit.None;
  if (hit !== null) {
    const hx = ax + fwd.x * len;
    const hz = az + fwd.z * len;
    if (isShieldBlock(world, hit, hx, hz)) {
      hit.sinceBlocked = 0;
      result = BeamHit.Blocked;
    } else {
      damageEnemy(world, hit, def.damage);
      result = BeamHit.Enemy;
    }
  }
  world.events.emit(GameEvent.BeamPulse, ax, az, fwd.x, fwd.z, len, result);
}
