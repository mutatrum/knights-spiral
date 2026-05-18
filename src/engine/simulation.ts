import { numberToCoord } from './spiral';
import { getAttackOffsets } from './pieces';

export const MAX_N = 2_140_000_000;

export const getTileKey = (mip: number, tx: number, ty: number): number => {
  return (mip << 28) | ((tx & 0x3FFF) << 14) | (ty & 0x3FFF);
};

const PIECE_CHUNK_SHIFT = 23; // 2^23 = 8,388,608 squares per chunk
const PIECE_CHUNK_SQUARES = 1 << PIECE_CHUNK_SHIFT;
const PIECE_BYTE_SIZE = 4194304; // 4MB per chunk = 8M nibbles
const PIECE_BYTE_MASK = PIECE_BYTE_SIZE - 1;

class ChunkedPieceBuffer {
  private chunks: (Uint8Array | null)[] = new Array(Math.ceil(MAX_N / PIECE_CHUNK_SQUARES)).fill(null);

  public get(n: number): number {
    const chunkIdx = n >>> PIECE_CHUNK_SHIFT;
    const chunk = this.chunks[chunkIdx];
    if (!chunk) return 0;
    const byteIdx = (n >>> 1) & PIECE_BYTE_MASK;
    return (n & 1) ? (chunk[byteIdx] >> 4) : (chunk[byteIdx] & 0x0F);
  }

  public set(n: number, pId: number) {
    const chunkIdx = n >>> PIECE_CHUNK_SHIFT;
    let chunk = this.chunks[chunkIdx];
    if (!chunk) {
      chunk = new Uint8Array(PIECE_BYTE_SIZE);
      this.chunks[chunkIdx] = chunk;
    }
    const byteIdx = (n >>> 1) & PIECE_BYTE_MASK;
    if (n & 1) {
      chunk[byteIdx] = (chunk[byteIdx] & 0x0F) | ((pId & 0x0F) << 4);
    } else {
      chunk[byteIdx] = (chunk[byteIdx] & 0xF0) | (pId & 0x0F);
    }
  }

  get allocatedBytes(): number {
    return this.chunks.filter(c => c !== null).length * PIECE_BYTE_SIZE;
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

const BITSET_CHUNK_SHIFT = 23; // 2^23 = 8,388,608 bits per chunk
const BITSET_CHUNK_BITS = 1 << BITSET_CHUNK_SHIFT;
const BITSET_BYTE_SIZE = 1048576; // 1MB (2^20 bytes) per chunk
const BITSET_BYTE_MASK = BITSET_BYTE_SIZE - 1;

class ChunkedBitset {
  private chunks: (Uint8Array | null)[] = new Array(Math.ceil(MAX_N / BITSET_CHUNK_BITS)).fill(null);

  public get(n: number): boolean {
    const chunkIdx = n >>> BITSET_CHUNK_SHIFT;
    const chunk = this.chunks[chunkIdx];
    if (!chunk) return false;
    return (chunk[(n >>> 3) & BITSET_BYTE_MASK] & (1 << (n & 7))) !== 0;
  }

  public set(n: number) {
    const chunkIdx = n >>> BITSET_CHUNK_SHIFT;
    let chunk = this.chunks[chunkIdx];
    if (!chunk) {
      chunk = new Uint8Array(BITSET_BYTE_SIZE);
      this.chunks[chunkIdx] = chunk;
    }
    chunk[(n >>> 3) & BITSET_BYTE_MASK] |= (1 << (n & 7));
  }

  public clear() {
    this.chunks.fill(null);
  }

  get allocatedBytes(): number {
    return this.chunks.filter(c => c !== null).length * BITSET_BYTE_SIZE;
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
  private stepResult = { n: 0, x: 0, y: 0, playerId: 0, searchDepth: 0 };
  private freeTilePool: Uint16Array[] = [];

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
        let k = (s + 1) >> 1;
        let m = k === 0 ? 0 : Math.pow(2 * k - 1, 2);
        this.cursor.k = k;
        this.cursor.i = targetN - m;
        this.cursor.t = 2 * k;
      }
    }
  }

  private isOccupied(n: number): boolean {
    return this.state.occupationBitset.get(n);
  }

  private setOccupied(n: number) {
    this.state.occupationBitset.set(n);
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
          if (this.freeTilePool.length > 0) {
            dangerTile = this.freeTilePool.pop()!;
          } else {
            dangerTile = new Uint16Array(262144);
          }
          this.state.dangerGrid.set(aKey, dangerTile);
        }
        this.lastTileKey = aKey;
        this.lastDangerTile = dangerTile;
      }
      dangerTile[(ax & 511) + ((ay & 511) << 9)] |= playerBit;
    }
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

          this.stepResult.n = n;
          this.stepResult.x = cx;
          this.stepResult.y = cy;
          this.stepResult.playerId = player.id;
          this.stepResult.searchDepth = searchDepth;
          return this.stepResult;
        }
        searchDepth++;
      }
      n++;
      this.advanceCursorTo(n);
    }

    return null; // Hit MAX_N boundary
  }

  public getState() {
    const dangerMem = (this.state.dangerGrid.size + this.freeTilePool.length) * 524288; // 512*512*2 bytes per buffer
    const bitsetMem = this.state.occupationBitset.allocatedBytes;
    const bufferMem = 80_000_000; // 4 transferable buffers in worker pool (20MB each)

    return {
      step: this.state.step,
      lowestUnoccupiedN: this.state.lowestUnoccupiedN,
      memoryUsed: dangerMem + bitsetMem + bufferMem, // Total bytes
      activeTiles: this.state.dangerGrid.size,
      pooledTiles: this.freeTilePool.length,
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

    for (let i = 0; i < keysToPrune.length; i++) {
      const key = keysToPrune[i];
      if (key === this.lastTileKey) {
        this.lastTileKey = -1;
        this.lastDangerTile = null;
      }
      const tile = this.state.dangerGrid.get(key);
      if (tile) {
        if (this.freeTilePool.length < 1000) { // Limit pool to 1000 tiles (~500MB max)
          tile.fill(0);
          this.freeTilePool.push(tile);
        }
      }
      this.state.dangerGrid.delete(key);
      this.totalFreedTiles++;
    }
  }

  public reset() {
    this.totalFreedTiles = 0;
    this.cursor.n = -1;
    this.lastTileKey = -1;
    this.lastDangerTile = null;
    this.freeTilePool = [];
    spiralPieces.reset();
    this.state = this.createInitialState();
  }
}
