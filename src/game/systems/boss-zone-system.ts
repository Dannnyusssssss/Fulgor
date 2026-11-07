/**
 * Sistema de zonas del Coloso: aviso fijo → golpe al caer → (fase 3) zona activa con daño continuo → fin.
 * El golpe lo evitan la esquiva y salir del círculo antes de que termine el aviso.
 */
import { BALANCE } from '../../data/balance';
import { insideZone, ZoneState } from '../boss-zones';
import { GameEvent } from '../events';
import type { World } from '../world';
import { hurtPlayer } from './damage';

export function updateBossZoneSystem(world: World, dt: number): void {
  const pl = world.player;
  world.bossZoneHitCooldown = Math.max(0, world.bossZoneHitCooldown - dt);
  let lingering = false;
  for (const zone of world.bossZones.items) {
    if (!zone.active) continue;
    zone.timer -= dt;
    if (zone.state === ZoneState.Warn) {
      if (zone.timer > 0) continue;
      // Cae el orbe.
      world.events.emit(GameEvent.ZoneImpact, zone.x, zone.z, zone.radius);
      if (pl.alive && insideZone(zone, pl.pos.x, pl.pos.z, pl.radius)) {
        hurtPlayer(world, zone.impactDamage, -1);
      }
      if (zone.lingerSeconds > 0) {
        zone.state = ZoneState.Active;
        zone.timer = zone.lingerSeconds;
      } else {
        world.bossZones.release(zone);
      }
      continue;
    }
    // Zona activa (fase 3): daño continuo mientras se está dentro.
    if (zone.timer <= 0) {
      world.bossZones.release(zone);
      continue;
    }
    if (pl.alive && insideZone(zone, pl.pos.x, pl.pos.z, pl.radius)) {
      // Daño silencioso; el aviso visual sale como mucho cada medio segundo.
      const applied = hurtPlayer(world, zone.lingerDps * dt, -1, true);
      if (applied > 0) lingering = true;
    }
  }
  if (lingering && world.bossZoneHitCooldown <= 0) {
    world.bossZoneHitCooldown = BALANCE.boss.zoneHitEverySeconds;
    world.events.emit(GameEvent.PlayerHit, pl.pos.x, pl.pos.z, 0, -1);
  }
}
