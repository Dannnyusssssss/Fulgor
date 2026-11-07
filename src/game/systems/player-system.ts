/**
 * Sistema del jugador: movimiento, esquiva y regeneración del escudo.
 */
import type { PlayerCommand } from '../../core/input';
import { GameEvent } from '../events';
import { updatePlayer } from '../player';
import type { World } from '../world';

export function updatePlayerSystem(world: World, cmd: PlayerCommand, dt: number): void {
  const p = world.player;
  if (updatePlayer(p, world.arena, cmd, dt, world.playerStats)) {
    world.events.emit(GameEvent.PlayerDodge, p.pos.x, p.pos.z, p.dodgeDir.x, p.dodgeDir.z);
    // Mejora: esquivar quita algo de calor a todas las armas.
    const vent = world.mods.dodgeHeatVent;
    if (vent > 0) for (const w of world.weapons) w.heat = Math.max(0, w.heat - vent);
  }
}
