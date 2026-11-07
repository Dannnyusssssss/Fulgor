/**
 * Sistema de objetos: caducidad, recogida y aparición periódica en los puntos fijos de la arena.
 */
import { distSq } from '../../core/math';
import { BALANCE } from '../../data/balance';
import { GameEvent } from '../events';
import { PickupType, pickupTypeFromRoll, type PickupTypeId } from '../pickups';
import type { World } from '../world';

export function spawnPickup(world: World, type: PickupTypeId, x: number, z: number): boolean {
  if (world.pickups.activeCount >= BALANCE.pickups.maxActive) return false;
  const p = world.pickups.acquire();
  if (p === null) return false;
  p.type = type;
  p.x = x;
  p.z = z;
  p.life = BALANCE.pickups.lifetime;
  world.events.emit(GameEvent.PickupSpawn, x, z, type);
  return true;
}

export function updatePickupSystem(world: World, dt: number): void {
  const cfg = BALANCE.pickups;
  const pl = world.player;
  const reach = cfg.radius + world.mods.pickupRadiusAdd + pl.radius;
  for (const p of world.pickups.items) {
    if (!p.active) continue;
    p.life -= dt;
    if (p.life <= 0) {
      world.pickups.release(p);
      continue;
    }
    if (!pl.alive || distSq(p.x, p.z, pl.pos.x, pl.pos.z) > reach * reach) continue;
    if (p.type === PickupType.Health) {
      pl.health = Math.min(pl.maxHealth, pl.health + cfg.healthAmount * world.mods.pickupAmountMul);
    } else if (p.type === PickupType.Shield) {
      pl.shield = Math.min(pl.maxShield, pl.shield + cfg.shieldAmount * world.mods.pickupAmountMul);
    } else {
      // El enfriador vale para todas las armas.
      for (const w of world.weapons) {
        w.heat = 0;
        w.overheated = false;
        w.lockTimer = 0;
      }
    }
    world.events.emit(GameEvent.PickupCollected, p.x, p.z, p.type);
    world.pickups.release(p);
  }

  // Aparición periódica si hay pocos objetos (flujo de combate: dos tiradas siempre).
  world.pickupTimer -= dt;
  const points = world.arena.def.pickupPoints;
  if (world.pickupTimer <= 0 && points.length > 0) {
    world.pickupTimer = cfg.periodicSeconds;
    const where = world.rng.combat.next();
    const kind = world.rng.combat.next();
    if (world.pickups.activeCount < cfg.periodicIfFewerThan) {
      const pt = points[Math.floor(where * points.length)];
      if (pt !== undefined) spawnPickup(world, pickupTypeFromRoll(kind, cfg.weights), pt.x, pt.z);
    }
  }
}
