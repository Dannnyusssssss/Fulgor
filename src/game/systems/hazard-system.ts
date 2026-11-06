/**
 * Sistema de peligros: detecta la activación (para el efecto visual, que pasa por el presupuesto de destellos)
 * y daña al jugador mientras está dentro de un peligro activo.
 */
import { GameEvent } from '../events';
import { HazardPhase, hazardPhaseAt, insideHazard } from '../hazards';
import type { World } from '../world';
import { hurtPlayer } from './damage';

/** Cada cuánto se emite el aviso visual de daño mientras se está dentro (el daño en sí es continuo). */
const HIT_FEEDBACK_SECONDS = 0.5;

export function updateHazardSystem(world: World, dt: number): void {
  const hazards = world.arena.def.hazards;
  if (hazards.length === 0) return;
  const p = world.player;
  world.hazardHitCooldown = Math.max(0, world.hazardHitCooldown - dt);
  for (let i = 0; i < hazards.length; i++) {
    const h = hazards[i];
    if (h === undefined) continue;
    const phase = hazardPhaseAt(h, world.time);
    if (phase === HazardPhase.Active && world.hazardPhases[i] !== HazardPhase.Active) {
      world.events.emit(GameEvent.HazardActivate, h.x, h.z, i);
    }
    world.hazardPhases[i] = phase;
    // Basta con que el cuerpo pise la zona: el área se amplía medio radio del jugador.
    if (
      phase === HazardPhase.Active &&
      p.alive &&
      insideHazard(h, p.pos.x, p.pos.z, -p.radius * 0.5)
    ) {
      const silent = world.hazardHitCooldown > 0;
      if (hurtPlayer(world, h.damagePerSecond * dt, -2, silent) > 0 && !silent) {
        world.hazardHitCooldown = HIT_FEEDBACK_SECONDS;
      }
    }
  }
}
