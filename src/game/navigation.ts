import * as THREE from 'three';
import { ColliderBox, DestructibleBarricade } from './worldBuilder';

const CELL_CLEAR = 0;
const CELL_SOLID = 1;
const CELL_DESTRUCTIBLE = 2;

const DIR_X = [1, -1, 0, 0, 1, 1, -1, -1];
const DIR_Z = [0, 0, 1, -1, 1, -1, 1, -1];
const DIR_COST = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2];

export function segmentIntersectsAABB2D(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number
): boolean {
  const dx = x1 - x0;
  const dz = z1 - z0;
  let tMin = 0;
  let tMax = 1;

  if (Math.abs(dx) < 1e-8) {
    if (x0 < minX || x0 > maxX) return false;
  } else {
    const inv = 1 / dx;
    let t1 = (minX - x0) * inv;
    let t2 = (maxX - x0) * inv;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }

  if (Math.abs(dz) < 1e-8) {
    if (z0 < minZ || z0 > maxZ) return false;
  } else {
    const inv = 1 / dz;
    let t1 = (minZ - z0) * inv;
    let t2 = (maxZ - z0) * inv;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }

  return tMin <= tMax;
}

export function hasLineOfSight(
  fromX: number,
  fromY: number,
  fromZ: number,
  toX: number,
  toY: number,
  toZ: number,
  colliders: ColliderBox[],
  minOccluderHeight = 1.45
): boolean {
  const eyeTop = Math.max(fromY, toY) + 1.65;
  const eyeBottom = Math.min(fromY, toY) + 0.35;
  for (let i = 0; i < colliders.length; i++) {
    const b = colliders[i];
    if (b.maxY < minOccluderHeight) continue;
    if (b.minY > eyeTop || b.maxY < eyeBottom) continue;
    if (b.tag && b.tag.startsWith('destructible_glass')) continue;
    if (segmentIntersectsAABB2D(fromX, fromZ, toX, toZ, b.minX, b.maxX, b.minZ, b.maxZ)) {
      return false;
    }
  }
  return true;
}

export function countSoundOcclusions(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  colliders: ColliderBox[]
): number {
  let count = 0;
  for (let i = 0; i < colliders.length; i++) {
    const b = colliders[i];
    if (b.maxY < 1.6 || b.minY > 2.2) continue;
    if (segmentIntersectsAABB2D(fromX, fromZ, toX, toZ, b.minX, b.maxX, b.minZ, b.maxZ)) {
      count += 1;
      if (count >= 4) break;
    }
  }
  return count;
}

export class NavGrid {
  public readonly cellSize: number;
  public readonly minX: number;
  public readonly minZ: number;
  public readonly cols: number;
  public readonly rows: number;

  private cells: Uint8Array;
  private gScore: Float32Array;
  private fScore: Float32Array;
  private parentIdx: Int32Array;
  private stampArr: Uint32Array;
  private closedArr: Uint32Array;
  private heapIdx: Int32Array;
  private currentStamp = 1;
  private tempPath: number[] = [];

  constructor(
    colliders: ColliderBox[],
    destructibles: DestructibleBarricade[] = [],
    cellSize = 1.6
  ) {
    this.cellSize = cellSize;

    let bMinX = -45;
    let bMaxX = 45;
    let bMinZ = -115;
    let bMaxZ = 48;

    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (c.maxY < 0.25) continue;
      if (c.minX < bMinX) bMinX = c.minX;
      if (c.maxX > bMaxX) bMaxX = c.maxX;
      if (c.minZ < bMinZ) bMinZ = c.minZ;
      if (c.maxZ > bMaxZ) bMaxZ = c.maxZ;
    }

    this.minX = Math.floor((bMinX - 8) / cellSize) * cellSize;
    this.minZ = Math.floor((bMinZ - 8) / cellSize) * cellSize;
    const maxX = Math.ceil((bMaxX + 8) / cellSize) * cellSize;
    const maxZ = Math.ceil((bMaxZ + 8) / cellSize) * cellSize;

    this.cols = Math.max(16, Math.min(180, Math.ceil((maxX - this.minX) / cellSize)));
    this.rows = Math.max(16, Math.min(220, Math.ceil((maxZ - this.minZ) / cellSize)));

    const total = this.cols * this.rows;
    this.cells = new Uint8Array(total);
    this.gScore = new Float32Array(total);
    this.fScore = new Float32Array(total);
    this.parentIdx = new Int32Array(total);
    this.stampArr = new Uint32Array(total);
    this.closedArr = new Uint32Array(total);
    this.heapIdx = new Int32Array(total);

    this.rebuild(colliders, destructibles);
  }

  public rebuild(colliders: ColliderBox[], destructibles: DestructibleBarricade[] = []): void {
    this.cells.fill(CELL_CLEAR);

    const destructibleColliderSet = new Set<number>();
    for (let i = 0; i < destructibles.length; i++) {
      if (!destructibles[i].destroyed) {
        destructibleColliderSet.add(destructibles[i].colliderIndex);
      }
    }

    const pad = 0.28;
    for (let i = 0; i < colliders.length; i++) {
      const b = colliders[i];
      if (b.maxY < 0.4 || b.minY > 2.2) continue;
      const isDestructible = destructibleColliderSet.has(i) || Boolean(b.tag?.startsWith('destructible_'));
      const mark = isDestructible ? CELL_DESTRUCTIBLE : CELL_SOLID;

      const c0 = Math.max(0, Math.floor((b.minX - pad - this.minX) / this.cellSize));
      const c1 = Math.min(this.cols - 1, Math.floor((b.maxX + pad - this.minX) / this.cellSize));
      const r0 = Math.max(0, Math.floor((b.minZ - pad - this.minZ) / this.cellSize));
      const r1 = Math.min(this.rows - 1, Math.floor((b.maxZ + pad - this.minZ) / this.cellSize));

      for (let r = r0; r <= r1; r++) {
        const rowOff = r * this.cols;
        for (let c = c0; c <= c1; c++) {
          const cur = this.cells[rowOff + c];
          if (cur !== CELL_SOLID) {
            this.cells[rowOff + c] = mark;
          }
        }
      }
    }
  }

  public worldToCol(x: number): number {
    return Math.max(0, Math.min(this.cols - 1, Math.floor((x - this.minX) / this.cellSize)));
  }

  public worldToRow(z: number): number {
    return Math.max(0, Math.min(this.rows - 1, Math.floor((z - this.minZ) / this.cellSize)));
  }

  public cellCenterX(col: number): number {
    return this.minX + (col + 0.5) * this.cellSize;
  }

  public cellCenterZ(row: number): number {
    return this.minZ + (row + 0.5) * this.cellSize;
  }

  public isCellPassable(col: number, row: number, allowDestructible = false): boolean {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return false;
    const v = this.cells[row * this.cols + col];
    return v === CELL_CLEAR || (allowDestructible && v === CELL_DESTRUCTIBLE);
  }

  public isWorldWalkable(x: number, z: number, allowDestructible = false): boolean {
    return this.isCellPassable(this.worldToCol(x), this.worldToRow(z), allowDestructible);
  }

  private findNearestPassable(col: number, row: number, allowDestructible: boolean): { col: number; row: number } | null {
    if (this.isCellPassable(col, row, allowDestructible)) return { col, row };
    for (let rad = 1; rad <= 4; rad++) {
      for (let dr = -rad; dr <= rad; dr++) {
        for (let dc = -rad; dc <= rad; dc++) {
          if (Math.abs(dr) !== rad && Math.abs(dc) !== rad) continue;
          const nc = col + dc;
          const nr = row + dr;
          if (this.isCellPassable(nc, nr, allowDestructible)) {
            return { col: nc, row: nr };
          }
        }
      }
    }
    return null;
  }

  private hasGridLOS(
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    allowDestructible: boolean
  ): boolean {
    const dist = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.max(2, Math.ceil(dist / (this.cellSize * 0.45)));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const sx = x0 + (x1 - x0) * t;
      const sz = z0 + (z1 - z0) * t;
      if (!this.isWorldWalkable(sx, sz, allowDestructible)) return false;
    }
    return true;
  }

  public findPath(
    startX: number,
    startZ: number,
    goalX: number,
    goalZ: number,
    outWaypoints: THREE.Vector3[],
    allowDestructible = false,
    maxExpansions = 1200
  ): boolean {
    outWaypoints.length = 0;

    // Fast path: direct unobstructed corridor
    if (this.hasGridLOS(startX, startZ, goalX, goalZ, allowDestructible)) {
      outWaypoints.push(new THREE.Vector3(goalX, 0, goalZ));
      return true;
    }

    const sCell = this.findNearestPassable(this.worldToCol(startX), this.worldToRow(startZ), allowDestructible);
    const gCell = this.findNearestPassable(this.worldToCol(goalX), this.worldToRow(goalZ), allowDestructible);
    if (!sCell || !gCell) return false;

    const startIdx = sCell.row * this.cols + sCell.col;
    const goalIdx = gCell.row * this.cols + gCell.col;
    if (startIdx === goalIdx) {
      outWaypoints.push(new THREE.Vector3(goalX, 0, goalZ));
      return true;
    }

    this.currentStamp += 1;
    if (this.currentStamp > 0xffffff00) {
      this.stampArr.fill(0);
      this.closedArr.fill(0);
      this.currentStamp = 1;
    }
    const stamp = this.currentStamp;

    let heapLen = 0;
    const pushHeap = (nodeIdx: number) => {
      let i = heapLen++;
      this.heapIdx[i] = nodeIdx;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (this.fScore[this.heapIdx[p]] <= this.fScore[this.heapIdx[i]]) break;
        const tmp = this.heapIdx[p];
        this.heapIdx[p] = this.heapIdx[i];
        this.heapIdx[i] = tmp;
        i = p;
      }
    };
    const popHeap = (): number => {
      const top = this.heapIdx[0];
      heapLen -= 1;
      if (heapLen > 0) {
        this.heapIdx[0] = this.heapIdx[heapLen];
        let i = 0;
        while (true) {
          const l = i * 2 + 1;
          const r = l + 1;
          let smallest = i;
          if (l < heapLen && this.fScore[this.heapIdx[l]] < this.fScore[this.heapIdx[smallest]]) {
            smallest = l;
          }
          if (r < heapLen && this.fScore[this.heapIdx[r]] < this.fScore[this.heapIdx[smallest]]) {
            smallest = r;
          }
          if (smallest === i) break;
          const tmp = this.heapIdx[i];
          this.heapIdx[i] = this.heapIdx[smallest];
          this.heapIdx[smallest] = tmp;
          i = smallest;
        }
      }
      return top;
    };

    this.stampArr[startIdx] = stamp;
    this.gScore[startIdx] = 0;
    this.fScore[startIdx] = Math.hypot(gCell.col - sCell.col, gCell.row - sCell.row);
    this.parentIdx[startIdx] = -1;
    pushHeap(startIdx);

    let expansions = 0;
    let bestIdx = startIdx;
    let bestH = Infinity;
    let found = false;

    while (heapLen > 0 && expansions < maxExpansions) {
      const cur = popHeap();
      if (this.closedArr[cur] === stamp) continue;
      this.closedArr[cur] = stamp;
      expansions += 1;

      if (cur === goalIdx) {
        found = true;
        bestIdx = cur;
        break;
      }

      const curCol = cur % this.cols;
      const curRow = (cur - curCol) / this.cols;
      const hCur = Math.hypot(gCell.col - curCol, gCell.row - curRow);
      if (hCur < bestH) {
        bestH = hCur;
        bestIdx = cur;
      }

      for (let d = 0; d < 8; d++) {
        const nc = curCol + DIR_X[d];
        const nr = curRow + DIR_Z[d];
        if (!this.isCellPassable(nc, nr, allowDestructible)) continue;

        // Prevent diagonal corner clipping
        if (d >= 4) {
          if (
            !this.isCellPassable(curCol + DIR_X[d], curRow, allowDestructible) ||
            !this.isCellPassable(curCol, curRow + DIR_Z[d], allowDestructible)
          ) {
            continue;
          }
        }

        const nIdx = nr * this.cols + nc;
        if (this.closedArr[nIdx] === stamp) continue;

        const extraCost =
          this.cells[nIdx] === CELL_DESTRUCTIBLE ? 2.4 : 0;
        const tentG = this.gScore[cur] + DIR_COST[d] + extraCost;
        if (this.stampArr[nIdx] !== stamp || tentG < this.gScore[nIdx]) {
          this.stampArr[nIdx] = stamp;
          this.parentIdx[nIdx] = cur;
          this.gScore[nIdx] = tentG;
          this.fScore[nIdx] = tentG + Math.hypot(gCell.col - nc, gCell.row - nr);
          pushHeap(nIdx);
        }
      }
    }

    // Reconstruct raw grid indices
    this.tempPath.length = 0;
    let trace = found ? goalIdx : bestIdx;
    while (trace !== -1 && this.tempPath.length < 256) {
      this.tempPath.push(trace);
      trace = this.parentIdx[trace];
    }
    this.tempPath.reverse();

    if (this.tempPath.length === 0) return false;

    // Convert to world coordinates & apply greedy string-pulling smoothing
    const rawPts: THREE.Vector3[] = [];
    for (let i = 1; i < this.tempPath.length; i++) {
      const idx = this.tempPath[i];
      const c = idx % this.cols;
      const r = (idx - c) / this.cols;
      rawPts.push(new THREE.Vector3(this.cellCenterX(c), 0, this.cellCenterZ(r)));
    }
    if (found) {
      rawPts.push(new THREE.Vector3(goalX, 0, goalZ));
    }

    if (rawPts.length <= 1) {
      outWaypoints.push(...rawPts);
      return found || rawPts.length > 0;
    }

    let anchorX = startX;
    let anchorZ = startZ;
    let i = 0;
    while (i < rawPts.length) {
      let furthest = i;
      for (let j = rawPts.length - 1; j > i; j--) {
        if (this.hasGridLOS(anchorX, anchorZ, rawPts[j].x, rawPts[j].z, allowDestructible)) {
          furthest = j;
          break;
        }
      }
      outWaypoints.push(rawPts[furthest]);
      anchorX = rawPts[furthest].x;
      anchorZ = rawPts[furthest].z;
      i = furthest + 1;
    }

    return found || outWaypoints.length > 0;
  }

  public findNearestCoverPoint(
    monsterX: number,
    monsterZ: number,
    threatX: number,
    threatZ: number,
    colliders: ColliderBox[],
    maxSearchDist = 16
  ): THREE.Vector3 | null {
    let bestScore = Infinity;
    let bestPt: THREE.Vector3 | null = null;

    for (let i = 0; i < colliders.length; i++) {
      const b = colliders[i];
      if (b.maxY < 1.35 || b.minY > 1.2) continue;
      const w = b.maxX - b.minX;
      const d = b.maxZ - b.minZ;
      if (w > 18 || d > 18) continue; // skip outer boundary walls
      const cx = (b.minX + b.maxX) * 0.5;
      const cz = (b.minZ + b.maxZ) * 0.5;
      const distM = Math.hypot(cx - monsterX, cz - monsterZ);
      if (distM > maxSearchDist || distM < 1.5) continue;

      const awayX = cx - threatX;
      const awayZ = cz - threatZ;
      const awayLen = Math.hypot(awayX, awayZ) || 1;
      const candX = cx + (awayX / awayLen) * (Math.max(w, d) * 0.5 + 1.25);
      const candZ = cz + (awayZ / awayLen) * (Math.max(w, d) * 0.5 + 1.25);

      if (!this.isWorldWalkable(candX, candZ, false)) continue;
      if (hasLineOfSight(candX, 0.5, candZ, threatX, 0.5, threatZ, colliders, 1.35)) continue;

      const score = Math.hypot(candX - monsterX, candZ - monsterZ);
      if (score < bestScore) {
        bestScore = score;
        bestPt = new THREE.Vector3(candX, 0, candZ);
      }
    }

    return bestPt;
  }
}
