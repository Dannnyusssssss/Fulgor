/**
 * Sistema del arma: calor, ventilado y disparo.
 */
import { forwardInto, vec2 } from '../../core/math';
import type { PlayerCommand } from '../../core/input';
import { GameEvent } from '../events';
import { Team } from '../projectiles';
import { updateWeapon, WeaponFlag } from '../weapon';
import type { World } from '../world';

export function updateWeaponSystem(world: World, cmd: PlayerCommand, dt: number): void {
  const p = world.player;
  const alive = p.alive;
  const flags = updateWeapon(
    world.weapon,
    world.tuning.weapon,
    alive && cmd.fire,
    alive && cmd.vent,
    dt,
  );
  if (flags & WeaponFlag.VentStarted) world.events.emit(GameEvent.Vent, p.pos.x, p.pos.z);
  if (flags & WeaponFlag.Fired) {
    if (spawnPlayerProjectile(world)) world.events.emit(GameEvent.Shot, p.pos.x, p.pos.z, p.yaw);
  }
  if (flags & WeaponFlag.Overheated) world.events.emit(GameEvent.Overheat, p.pos.x, p.pos.z);
}

const fwd = vec2();

/** Crea un proyectil del jugador en la dirección del yaw. Sale del centro de Chispa para no cruzar paredes cercanas. */
export function spawnPlayerProjectile(world: World): boolean {
  const p = world.player;
  const def = world.tuning.weapon;
  const proj = world.projectiles.acquire();
  if (proj === null) return false;
  forwardInto(fwd, p.yaw);
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
  return true;
}
