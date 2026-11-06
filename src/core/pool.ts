/**
 * Pool de objetos con capacidad fija: todos los objetos se crean al principio y se reutilizan.
 * Así el bucle de juego no crea objetos nuevos (ni basura) cada frame.
 */
export interface Poolable {
  active: boolean;
  /** Posición fija del objeto en el pool (sirve como identificador en el hash espacial). */
  readonly index: number;
}

export class Pool<T extends Poolable> {
  readonly items: readonly T[];
  private readonly free: Int32Array;
  private freeCount: number;

  constructor(
    readonly capacity: number,
    factory: (index: number) => T,
  ) {
    const items: T[] = [];
    for (let i = 0; i < capacity; i++) items.push(factory(i));
    this.items = items;
    this.free = new Int32Array(capacity);
    this.freeCount = 0;
    this.clear();
  }

  get activeCount(): number {
    return this.capacity - this.freeCount;
  }

  /** Devuelve un objeto libre marcado como activo, o null si el pool está lleno. Siempre el índice libre más bajo primero. */
  acquire(): T | null {
    if (this.freeCount === 0) return null;
    const index = this.free[--this.freeCount] ?? 0;
    const item = this.items[index];
    if (item === undefined) return null;
    item.active = true;
    return item;
  }

  /** Devuelve el objeto al pool. Liberar dos veces el mismo objeto no tiene efecto. */
  release(item: T): void {
    if (!item.active) return;
    item.active = false;
    this.free[this.freeCount++] = item.index;
  }

  /** Libera todos los objetos. */
  clear(): void {
    for (const item of this.items) item.active = false;
    // La pila se llena al revés para que el índice 0 salga primero (orden determinista y fácil de leer).
    this.freeCount = this.capacity;
    for (let i = 0; i < this.capacity; i++) this.free[i] = this.capacity - 1 - i;
  }
}
