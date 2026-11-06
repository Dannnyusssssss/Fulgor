/**
 * Mapa de distancias hacia el jugador para la navegación de enemigos.
 * Rejilla sobre la arena; las celdas bloqueadas son las que un enemigo (con su radio) no puede ocupar.
 * Una búsqueda en anchura desde la celda del jugador da a cada celda su distancia en pasos;
 * cada enemigo baja por el gradiente hacia la celda vecina más cercana al jugador.
 */
import {
  circleCirclePenetration,
  circleRectPenetration,
  type Penetration,
  type Vec2,
} from '../core/math';
import type { Arena } from './arena';

const UNREACHED = -1;
const pen: Penetration = { nx: 0, nz: 0, depth: 0 };

// Vecinos: 4 ortogonales y 4 diagonales.
const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DZ = [0, 0, 1, -1, 1, -1, 1, -1];

export class NavField {
  readonly cols: number;
  readonly rows: number;
  private readonly minX: number;
  private readonly minZ: number;
  readonly blocked: Uint8Array;
  readonly dist: Int32Array;
  private readonly queue: Int32Array;

  constructor(
    arena: Arena,
    readonly cellSize: number,
    agentRadius: number,
  ) {
    const inner = arena.inner;
    this.minX = inner.minX;
    this.minZ = inner.minZ;
    this.cols = Math.ceil((inner.maxX - inner.minX) / cellSize);
    this.rows = Math.ceil((inner.maxZ - inner.minZ) / cellSize);
    const n = this.cols * this.rows;
    this.blocked = new Uint8Array(n);
    this.dist = new Int32Array(n).fill(UNREACHED);
    this.queue = new Int32Array(n);
    // Una celda está bloqueada si un círculo del radio del agente en su centro toca un obstáculo.
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const x = this.minX + (c + 0.5) * cellSize;
        const z = this.minZ + (r + 0.5) * cellSize;
        let blocked = false;
        for (const o of arena.obstacles) {
          const hit =
            o.kind === 'rect'
              ? circleRectPenetration(x, z, agentRadius, o.rect, pen)
              : circleCirclePenetration(x, z, agentRadius, o.circle, pen);
          if (hit) {
            blocked = true;
            break;
          }
        }
        this.blocked[r * this.cols + c] = blocked ? 1 : 0;
      }
    }
  }

  cellIndex(x: number, z: number): number {
    let c = Math.floor((x - this.minX) / this.cellSize);
    let r = Math.floor((z - this.minZ) / this.cellSize);
    c = c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
    r = r < 0 ? 0 : r >= this.rows ? this.rows - 1 : r;
    return r * this.cols + c;
  }

  /** Recalcula las distancias desde el punto objetivo (el jugador). */
  recompute(targetX: number, targetZ: number): void {
    this.dist.fill(UNREACHED);
    const start = this.cellIndex(targetX, targetZ);
    // La celda del objetivo siempre cuenta, aunque esté pegada a una cobertura.
    this.dist[start] = 0;
    let head = 0;
    let tail = 0;
    this.queue[tail++] = start;
    while (head < tail) {
      const cell = this.queue[head++] ?? 0;
      const c = cell % this.cols;
      const r = (cell - c) / this.cols;
      const d = (this.dist[cell] ?? 0) + 1;
      for (let k = 0; k < 8; k++) {
        const nc = c + (DX[k] ?? 0);
        const nr = r + (DZ[k] ?? 0);
        if (!this.isOpen(nc, nr)) continue;
        // Las diagonales no cortan esquinas: ambos ortogonales deben estar libres.
        if (k >= 4 && (!this.isOpen(nc, r) || !this.isOpen(c, nr))) continue;
        const ni = nr * this.cols + nc;
        if (this.dist[ni] !== UNREACHED) continue;
        this.dist[ni] = d;
        this.queue[tail++] = ni;
      }
    }
  }

  private isOpen(c: number, r: number): boolean {
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return false;
    return this.blocked[r * this.cols + c] === 0;
  }

  /** Distancia en pasos desde un punto al objetivo, o -1 si no se alcanza. */
  distanceAt(x: number, z: number): number {
    return this.dist[this.cellIndex(x, z)] ?? UNREACHED;
  }

  /**
   * Dirección (unitaria) para acercarse al objetivo desde (x, z): hacia la celda vecina con menor distancia.
   * Devuelve false si no hay camino conocido.
   */
  direction(x: number, z: number, out: Vec2): boolean {
    const cell = this.cellIndex(x, z);
    const c = cell % this.cols;
    const r = (cell - c) / this.cols;
    const here = this.dist[cell] ?? UNREACHED;
    let best = here === UNREACHED ? Number.MAX_SAFE_INTEGER : here;
    let bestC = -1;
    let bestR = -1;
    for (let k = 0; k < 8; k++) {
      const nc = c + (DX[k] ?? 0);
      const nr = r + (DZ[k] ?? 0);
      if (nc < 0 || nr < 0 || nc >= this.cols || nr >= this.rows) continue;
      const d = this.dist[nr * this.cols + nc] ?? UNREACHED;
      if (d === UNREACHED || d >= best) continue;
      if (k >= 4 && (!this.isOpen(nc, r) || !this.isOpen(c, nr))) continue;
      best = d;
      bestC = nc;
      bestR = nr;
    }
    if (bestC < 0) return false;
    const tx = this.minX + (bestC + 0.5) * this.cellSize;
    const tz = this.minZ + (bestR + 0.5) * this.cellSize;
    const dx = tx - x;
    const dz = tz - z;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 1e-6) return false;
    out.x = dx / len;
    out.z = dz / len;
    return true;
  }
}
