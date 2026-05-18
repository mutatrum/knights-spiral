import { numberToCoord } from './spiral';
import { getAttackOffsets } from './pieces';

export const MAX_N = 1_360_000_000;
const CHUNK_SHIFT = 23; // 2^23 = 8,388,608 pieces per chunk
const CHUNK_SIZE = 1 << CHUNK_SHIFT;
const CHUNK_MASK = CHUNK_SIZE - 1;

class ChunkedPieceBuffer {
  private chunks: (Uint8Array | null)[] = new Array(Math.ceil(MAX_N / CHUNK_SIZE)).fill(null);

  public get(n: number): number {
    const chunkIdx = n >> CHUNK_SHIFT;
    const chunk = this.chunks[chunkIdx];
    if (!chunk) return 0;
    return chunk[n & CHUNK_MASK];
  }

  public set(n: number, val: number) {
    const chunkIdx = n >> CHUNK_SHIFT;
    if (!this.chunks[chunkIdx]) {
      this.chunks[chunkIdx] = new Uint8Array(CHUNK_SIZE);
    }
    this.chunks[chunkIdx]![n & CHUNK_MASK] = val;
  }

  get allocatedBytes(): number {
    return this.chunks.filter(c => c !== null).length * CHUNK_SIZE;
  }

  public reset() {
    this.chunks.fill(null);
  }
}

export const spiralPieces = new ChunkedPieceBuffer();

export interface Player {
  id: number;
  color: string;
  pieceType: {
    a: number;
    b: number;
  };
}

class ChunkedBitset {
  private chunks: (Uint8Array | null)[] = new Array(Math.ceil(MAX_N / (8 * 1024 * 1024))).fill(null);
  private CHUNK_SIZE = 1024 * 1024; // 1MB per chunk = 8M bits

  public get(n: number): boolean {
    const bitIdx = n;
    const chunkIdx = Math.floor(bitIdx / (8 * this.CHUNK_SIZE));
    const chunk = this.chunks[chunkIdx];
    if (!chunk) return false;
    const offset = bitIdx % (8 * this.CHUNK_SIZE);
    return (chunk[offset >> 3] & (1 << (offset & 7))) !== 0;
  }

  public set(n: number) {
    const bitIdx = n;
    const chunkIdx = Math.floor(bitIdx / (8 * this.CHUNK_SIZE));
    if (!this.chunks[chunkIdx]) {
      this.chunks[chunkIdx] = new Uint8Array(this.CHUNK_SIZE);
    }
    const offset = bitIdx % (8 * this.CHUNK_SIZE);
    this.chunks[chunkIdx]![offset >> 3] |= (1 << (offset & 7));
  }

  public clear() {
    this.chunks.fill(null);
  }

  get allocatedBytes(): number {
    return this.chunks.filter(c => c !== null).length * this.CHUNK_SIZE;
  }
}

export interface SimulationState {
  step: number;
  currentPlayerIndex: number;
  dangerGrid: Map<number, Uint16Array>;
  lowestUnoccupiedN: number;
  occupationBitset: ChunkedBitset;
  lastCheckedN: number[];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export class SimulationEngine {
  private players: Player[];
  private state: SimulationState;
  private attackOffsets: Map<number, [number, number][]>;
  private playerBitMap: Map<number, number> = new Map();
  private totalFreedTiles: number = 0;
  private lastTileKey: number = -1;
  private lastDangerTile: Uint16Array | null = null;
  private cursor = { n: -1, x: 0, y: 0, k: 0, i: 0, t: 0 };

  constructor(players: Player[]) {
    this.players = players;
    this.attackOffsets = new Map();
    this.playerBitMap = new Map();
    this.updateAttackOffsets();
    this.state = this.createInitialState();
  }

  private createInitialState(): SimulationState {
    return {
      step: 0,
      currentPlayerIndex: 0,
      dangerGrid: new Map(),
      lowestUnoccupiedN: 0,
      occupationBitset: new ChunkedBitset(),
      lastCheckedN: new Array(this.players.length).fill(0),
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
    };
  }

  private updateAttackOffsets() {
    this.players.forEach((p, i) => {
      this.attackOffsets.set(p.id, getAttackOffsets(p.pieceType.a, p.pieceType.b));
      this.playerBitMap.set(p.id, 1 << i);
    });
  }

  private advanceCursorTo(targetN: number) {
    if (this.cursor.n === targetN) return;

    if (targetN === this.cursor.n + 1 && this.cursor.n > 0) {
      this.cursor.n++;
      this.cursor.i++;
      if (this.cursor.i === 4 * this.cursor.t) {
        this.cursor.k++;
        this.cursor.t = 2 * this.cursor.k;
        this.cursor.i = 0;
        this.cursor.x = this.cursor.k;
        this.cursor.y = -this.cursor.k + 1;
      } else if (this.cursor.i < this.cursor.t) {
        this.cursor.y++;
      } else if (this.cursor.i < 2 * this.cursor.t) {
        this.cursor.x--;
      } else if (this.cursor.i < 3 * this.cursor.t) {
        this.cursor.y--;
      } else {
        this.cursor.x++;
      }
    } else {
      const pt = numberToCoord(targetN);
      this.cursor.n = targetN;
      this.cursor.x = pt.x;
      this.cursor.y = pt.y;
      if (targetN === 0) {
        this.cursor.k = 0;
        this.cursor.i = 0;
        this.cursor.t = 0;
      } else {
        let s = Math.floor(Math.sqrt(targetN));
        if ((s + 1) * (s + 1) <= targetN) s++;
        const k = (s + 1) >> 1;
        this.cursor.k = k;
        this.cursor.t = 2 * k;
        const m = (2 * k - 1) * (2 * k - 1);
        this.cursor.i = targetN - m;
      }
    }
  }

  private getDangerValue(x: number, y: number): number {
    const tx = x >> 9;
    const ty = y >> 9;
    const key = (tx << 16) | (ty & 0xFFFF);

    if (key !== this.lastTileKey) {
      const dangerTile = this.state.dangerGrid.get(key) || null;
      this.lastTileKey = key;
      this.lastDangerTile = dangerTile;
    }

    if (!this.lastDangerTile) return 0;
    return this.lastDangerTile[(x & 511) + ((y & 511) << 9)];
  }

  private recordPiece(x: number, y: number, playerId: number) {
    // Danger Grid
    const playerBit = this.playerBitMap.get(playerId) || 0;
    const offsets = this.attackOffsets.get(playerId) || [];

    for (let j = 0; j < offsets.length; j++) {
      const off = offsets[j];
      const ax = x + off[0];
      const ay = y + off[1];
      const atx = ax >> 9;
      const aty = ay >> 9;
      const aKey = (atx << 16) | (aty & 0xFFFF);

      let dangerTile;
      if (aKey === this.lastTileKey && this.lastDangerTile) {
        dangerTile = this.lastDangerTile;
      } else {
        dangerTile = this.state.dangerGrid.get(aKey) || null;
        if (!dangerTile) {
          dangerTile = new Uint16Array(262144);
          this.state.dangerGrid.set(aKey, dangerTile);
        }
        this.lastTileKey = aKey;
        this.lastDangerTile = dangerTile;
      }
      dangerTile[(ax & 511) + ((ay & 511) << 9)] |= playerBit;
    }
  }

  private isOccupied(n: number): boolean {
    return this.state.occupationBitset.get(n);
  }

  private setOccupied(n: number) {
    this.state.occupationBitset.set(n);
  }

  public step(): { n: number; x: number; y: number; playerId: number; searchDepth: number } | null {
    const playerIndex = this.state.currentPlayerIndex;
    const player = this.players[playerIndex];
    const playerBit = 1 << playerIndex;
    const opponentMask = ~playerBit;

    let n = Math.max(this.state.lowestUnoccupiedN, this.state.lastCheckedN[playerIndex]);
    let searchDepth = 0;


    this.advanceCursorTo(n);

    while (n < MAX_N) {
      if (!this.isOccupied(n)) {
        const cx = this.cursor.x;
        const cy = this.cursor.y;
        const dangerValue = this.getDangerValue(cx, cy);

        if ((dangerValue & opponentMask) === 0) {
          this.setOccupied(n);
          this.recordPiece(cx, cy, player.id);
          this.state.step++;

          if (cx < this.state.minX) this.state.minX = cx;
          if (cx > this.state.maxX) this.state.maxX = cx;
          if (cy < this.state.minY) this.state.minY = cy;
          if (cy > this.state.maxY) this.state.maxY = cy;

          this.state.lastCheckedN[playerIndex] = n;
          this.state.currentPlayerIndex = (this.state.currentPlayerIndex + 1) % this.players.length;

          if (n === this.state.lowestUnoccupiedN) {
            while (this.isOccupied(this.state.lowestUnoccupiedN)) {
              this.state.lowestUnoccupiedN++;
            }
          }

          // Periodically prune old danger tiles
          if (this.state.step % 100000 === 0) {
            this.pruneTiles();
          }

          return { n, x: cx, y: cy, playerId: player.id, searchDepth };
        }
        searchDepth++;
      }
      n++;
      this.advanceCursorTo(n);
    }

    return null; // Hit MAX_N boundary
  }

  public getState() {
    const dangerMem = this.state.dangerGrid.size * 524288; // 512*512*2
    const bitsetMem = this.state.occupationBitset.allocatedBytes;
    const bufferMem = 80_000_000; // 4 transferable buffers in worker pool (20MB each)

    return {
      step: this.state.step,
      lowestUnoccupiedN: this.state.lowestUnoccupiedN,
      memoryUsed: dangerMem + bitsetMem + bufferMem, // Total bytes
      activeTiles: this.state.dangerGrid.size,
      freedTiles: this.totalFreedTiles,
      bounds: {
        minX: this.state.minX,
        maxX: this.state.maxX,
        minY: this.state.minY,
        maxY: this.state.maxY
      }
    };
  }

  private pruneTiles() {
    const minLastN = Math.min(...this.state.lastCheckedN);
    const keysToPrune: number[] = [];

    for (const key of this.state.dangerGrid.keys()) {
      const tx = (key >> 16);
      const ty = (key << 16) >> 16;

      const maxX = Math.max(Math.abs(tx * 512), Math.abs((tx + 1) * 512 - 1));
      const maxY = Math.max(Math.abs(ty * 512), Math.abs((ty + 1) * 512 - 1));
      const maxDist = Math.max(maxX, maxY);
      const maxN = (2 * maxDist + 1) * (2 * maxDist + 1);

      if (minLastN > maxN) {
        keysToPrune.push(key);
      }
    }

    for (const key of keysToPrune) {
      this.state.dangerGrid.delete(key);
      this.totalFreedTiles++;
    }
  }

  public reset() {
    this.totalFreedTiles = 0;
    this.cursor.n = -1;
    spiralPieces.reset();
    this.state = this.createInitialState();
  }
}
