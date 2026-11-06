/**
 * Cola de eventos de la simulación hacia el render y la interfaz (disparos, impactos, desactivaciones…).
 * Capacidad fija y objetos preasignados: emitir un evento no crea objetos.
 * La simulación nunca lee esta cola; si se llena, los eventos nuevos se descartan (solo afecta a efectos visuales).
 */
export const GameEvent = {
  Shot: 1,
  ProjectileHitWall: 2,
  ProjectileHitEnemy: 3,
  EnemyDestroyed: 4,
  PlayerHit: 5,
  PlayerDodge: 6,
  Overheat: 7,
  Vent: 8,
  TelegraphStart: 9,
  WaveStart: 10,
  EnemySpawn: 11,
  PlayerDefeated: 12,
  /** El escudo frontal de un Blindado detuvo un disparo. */
  ProjectileBlocked: 13,
  /** Un Centinela disparó (a = índice del enemigo). */
  EnemyFire: 14,
  /** Onda del Blindado (a, b = dirección; c = alcance; d = mitad del ángulo). */
  Shockwave: 15,
  /** Disparo del Vigía (a, b = dirección; c = longitud del rayo). */
  BeamFire: 16,
  /** Un peligro de la arena se activa (a = índice del peligro). */
  HazardActivate: 17,
  PickupSpawn: 18,
  /** Objeto recogido (a = tipo). */
  PickupCollected: 19,
  /** Oleada superada (a = número, b = bonificación por oleada limpia). */
  WaveCleared: 20,
  /** Arena completada. */
  Victory: 21,
} as const;

export type GameEventType = (typeof GameEvent)[keyof typeof GameEvent];

export interface EventRecord {
  type: GameEventType;
  x: number;
  z: number;
  /** Datos extra según el tipo (daño, número de oleada, índice de enemigo…). */
  a: number;
  b: number;
  c: number;
  d: number;
}

export class EventQueue {
  private readonly records: EventRecord[];
  private count = 0;
  /** Eventos descartados por falta de espacio (para el overlay). */
  dropped = 0;

  constructor(readonly capacity: number) {
    this.records = [];
    for (let i = 0; i < capacity; i++) {
      this.records.push({ type: GameEvent.Shot, x: 0, z: 0, a: 0, b: 0, c: 0, d: 0 });
    }
  }

  emit(type: GameEventType, x: number, z: number, a = 0, b = 0, c = 0, d = 0): void {
    if (this.count >= this.capacity) {
      this.dropped++;
      return;
    }
    const r = this.records[this.count++];
    if (r === undefined) return;
    r.type = type;
    r.x = x;
    r.z = z;
    r.a = a;
    r.b = b;
    r.c = c;
    r.d = d;
  }

  get length(): number {
    return this.count;
  }

  /** Recorre los eventos pendientes y vacía la cola. */
  drain(visit: (e: EventRecord) => void): void {
    for (let i = 0; i < this.count; i++) {
      const r = this.records[i];
      if (r !== undefined) visit(r);
    }
    this.count = 0;
  }

  clear(): void {
    this.count = 0;
  }
}
