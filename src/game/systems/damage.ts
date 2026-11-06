/**
 * Daño en un solo lugar: al jugador (con el multiplicador de dificultad, la invulnerabilidad y el combo)
 * y a los enemigos (con su desactivación, sus puntos y la posible caída de un objeto).
 */
import { BALANCE } from '../../data/balance';
import { GameEvent } from '../events';
import { isDamageable, kindDef, type Enemy } from '../enemies/types';
import { pickupTypeFromRoll } from '../pickups';
import { damagePlayer } from '../player';
import { addKill, onPlayerDamaged } from '../score';
import type { World } from '../world';
import { spawnPickup } from './pickup-system';

/**
 * Daña al jugador. `silent` evita el evento visual (para el daño continuo de los peligros).
 * Devuelve el daño aplicado (0 si estaba esquivando o en modo invulnerable).
 */
export function hurtPlayer(world: World, amount: number, source: number, silent = false): number {
  const dmg = amount * world.diff.damageTakenMultiplier;
  const applied = damagePlayer(world.player, dmg, world.god);
  if (applied > 0) {
    onPlayerDamaged(world.score);
    if (!silent) {
      world.events.emit(
        GameEvent.PlayerHit,
        world.player.pos.x,
        world.player.pos.z,
        applied,
        source,
      );
    }
  }
  return applied;
}

export function damageEnemy(world: World, e: Enemy, amount: number): void {
  if (!isDamageable(e)) return;
  e.health -= amount;
  e.sinceHurt = 0;
  if (e.health <= 0) destroyEnemy(world, e);
}

function destroyEnemy(world: World, e: Enemy): void {
  const def = kindDef(world.tuning, e.kind);
  addKill(world.score, def.score, world.diff.scoreMultiplier);
  world.events.emit(GameEvent.EnemyDestroyed, e.pos.x, e.pos.z, e.kind, e.index);
  // Caída de objeto: siempre dos tiradas del flujo de combate (probabilidad y tipo).
  const cfg = BALANCE.pickups;
  const chance = world.rng.combat.next();
  const typeRoll = world.rng.combat.next();
  if (chance < cfg.dropChance * world.diff.dropMultiplier) {
    spawnPickup(world, pickupTypeFromRoll(typeRoll, cfg.weights), e.pos.x, e.pos.z);
  }
  world.enemies.release(e);
}
