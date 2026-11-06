/**
 * Hash espacial de rejilla uniforme sobre un área acotada.
 * Cada elemento (un índice entero) se inserta en todas las celdas que toca su círculo.
 * Usa listas enlazadas en arreglos tipados: no crea objetos al insertar ni al consultar.
 */
export class SpatialHash {
  private readonly cols: number;
  private readonly rows: number;
  private readonly head: Int32Array;
  private readonly next: Int32Array;
  private readonly entryItem: Int32Array;
  private entryCount = 0;
  /** Marca por elemento para no devolver duplicados en una misma consulta. */
  private readonly stamp: Uint32Array;
  private queryId = 0;

  constructor(
    private readonly minX: number,
    private readonly minZ: number,
    width: number,
    depth: number,
    private readonly cellSize: number,
    readonly maxItems: number,
    maxEntries = maxItems * 4,
  ) {
    this.cols = Math.max(1, Math.ceil(width / cellSize));
    this.rows = Math.max(1, Math.ceil(depth / cellSize));
    this.head = new Int32Array(this.cols * this.rows).fill(-1);
    this.next = new Int32Array(maxEntries);
    this.entryItem = new Int32Array(maxEntries);
    this.stamp = new Uint32Array(maxItems);
  }

  clear(): void {
    this.head.fill(-1);
    this.entryCount = 0;
  }

  private colOf(x: number): number {
    const c = Math.floor((x - this.minX) / this.cellSize);
    return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
  }

  private rowOf(z: number): number {
    const r = Math.floor((z - this.minZ) / this.cellSize);
    return r < 0 ? 0 : r >= this.rows ? this.rows - 1 : r;
  }

  /** Inserta el elemento `item` con su círculo envolvente. Devuelve false si no queda espacio. */
  insert(item: number, x: number, z: number, radius: number): boolean {
    return this.insertBox(item, x - radius, z - radius, x + radius, z + radius);
  }

  /** Inserta el elemento en todas las celdas que toca la caja (también sirve para obstáculos rectangulares). */
  insertBox(item: number, minX: number, minZ: number, maxX: number, maxZ: number): boolean {
    if (item < 0 || item >= this.maxItems) return false;
    const c0 = this.colOf(minX);
    const c1 = this.colOf(maxX);
    const r0 = this.rowOf(minZ);
    const r1 = this.rowOf(maxZ);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (this.entryCount >= this.next.length) return false;
        const cell = r * this.cols + c;
        const e = this.entryCount++;
        this.entryItem[e] = item;
        this.next[e] = this.head[cell] ?? -1;
        this.head[cell] = e;
      }
    }
    return true;
  }

  /**
   * Escribe en `out` los elementos cuyas celdas tocan el círculo (x, z, radius), sin duplicados.
   * Devuelve cuántos escribió. Es una fase amplia: quien llama hace la prueba exacta.
   */
  query(x: number, z: number, radius: number, out: number[]): number {
    this.queryId = (this.queryId + 1) >>> 0;
    if (this.queryId === 0) {
      this.stamp.fill(0);
      this.queryId = 1;
    }
    const c0 = this.colOf(x - radius);
    const c1 = this.colOf(x + radius);
    const r0 = this.rowOf(z - radius);
    const r1 = this.rowOf(z + radius);
    let count = 0;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        let e = this.head[r * this.cols + c] ?? -1;
        while (e !== -1) {
          const item = this.entryItem[e] ?? 0;
          if (this.stamp[item] !== this.queryId) {
            this.stamp[item] = this.queryId;
            out[count++] = item;
          }
          e = this.next[e] ?? -1;
        }
      }
    }
    return count;
  }
}
