import type { Point } from './spiral';
import { numberToCoord, coordToNumber } from './spiral';
import { getAttackOffsets } from './pieces';

export interface Player {
  id: number;
  color: string;
  pieceType: {
    a: number;
    b: number;
  };
}

const GRID_SIZE = 16384;
const GRID_OFFSET = 8192;

const HASH_SIZE = 1 << 24; 
const HASH_MASK = HASH_SIZE - 1;

export interface SimulationState {
  step: number;
  currentPlayerIndex: number;
  grid: Uint8Array; 
  dangerGrid: Uint8Array; 
  lookupTable: BigUint64Array; // Overflow hash table
  lookupOccupied: Uint32Array;
  lowestUnoccupiedN: number;
  occupationBitset: Uint8Array; 
  lastCheckedN: number[]; 
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const MAX_N = 200000000;

export class SimulationEngine {
  private players: Player[];
  private state: SimulationState;
  
  private playerBits: number[];
  private attackOffsets: Map<number, Point[]>;

  constructor(players: Player[]) {
    this.players = players;
    this.playerBits = players.map((_, i) => 1 << i);
    this.state = this.createInitialState();
    this.attackOffsets = new Map();
    this.updateAttackOffsets();
  }

  private createInitialState(): SimulationState {
    return {
      step: 0,
      currentPlayerIndex: 0,
      grid: new Uint8Array(GRID_SIZE * GRID_SIZE),
      dangerGrid: new Uint8Array(GRID_SIZE * GRID_SIZE),
      lookupTable: new BigUint64Array(HASH_SIZE),
      lookupOccupied: new Uint32Array(HASH_SIZE >>> 5),
      lowestUnoccupiedN: 0,
      occupationBitset: new Uint8Array(Math.ceil(MAX_N / 8)),
      lastCheckedN: new Array(this.players.length).fill(0),
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
    };
  }

  private updateAttackOffsets() {
    this.players.forEach(p => {
      this.attackOffsets.set(p.id, getAttackOffsets(p.pieceType.a, p.pieceType.b));
    });
  }

  private isOccupied(n: number): boolean {
    if (n >= MAX_N) return true; 
    return (this.state.occupationBitset[n >> 3] & (1 << (n & 7))) !== 0;
  }

  private setOccupied(n: number) {
    if (n < MAX_N) {
      this.state.occupationBitset[n >> 3] |= (1 << (n & 7));
    }
  }

  private getGridValue(x: number, y: number): number {
    const gx = x + GRID_OFFSET;
    const gy = y + GRID_OFFSET;
    if (gx >= 0 && gx < GRID_SIZE && gy >= 0 && gy < GRID_SIZE) {
      return this.state.grid[gx + gy * GRID_SIZE];
    }
    
    // Overflow Hash Table Lookup
    const uKey = ((x + 32768) << 16 | (y + 32768)) >>> 0;
    let h = uKey;
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    let idx = (h & HASH_MASK);
    const { lookupOccupied, lookupTable } = this.state;

    while (lookupOccupied[idx >>> 5] & (1 << (idx & 31))) {
      const entry = lookupTable[idx];
      if (Number(entry >> 32n) === uKey) return Number(entry & 0xFFFFFFFFn);
      idx = (idx + 1) & HASH_MASK;
    }
    return 0;
  }

  private setGridValue(x: number, y: number, playerId: number) {
    const gx = x + GRID_OFFSET;
    const gy = y + GRID_OFFSET;
    
    if (gx >= 0 && gx < GRID_SIZE && gy >= 0 && gy < GRID_SIZE) {
      this.state.grid[gx + gy * GRID_SIZE] = playerId;
    } else {
      // Overflow Hash Table Set
      const uKey = ((x + 32768) << 16 | (y + 32768)) >>> 0;
      let h = uKey;
      h ^= h >>> 16;
      h = Math.imul(h, 0x85ebca6b);
      h ^= h >>> 13;
      h = Math.imul(h, 0xc2b2ae35);
      h ^= h >>> 16;
      let idx = (h & HASH_MASK);
      const { lookupOccupied, lookupTable } = this.state;

      while (lookupOccupied[idx >>> 5] & (1 << (idx & 31))) {
        if (Number(lookupTable[idx] >> 32n) === uKey) break;
        idx = (idx + 1) & HASH_MASK;
      }
      lookupOccupied[idx >>> 5] |= (1 << (idx & 31));
      lookupTable[idx] = (BigInt(uKey) << 32n) | BigInt(playerId);
    }

    const offsets = this.attackOffsets.get(playerId) || [];
    const pIdx = this.players.findIndex(p => p.id === playerId);
    const playerBit = this.playerBits[pIdx];
    
    for (const [dx, dy] of offsets) {
      const ax = gx + dx;
      const ay = gy + dy;
      if (ax >= 0 && ax < GRID_SIZE && ay >= 0 && ay < GRID_SIZE) {
        this.state.dangerGrid[ax + ay * GRID_SIZE] |= playerBit;
      }
    }
  }

  /**
   * Performs one turn: find the smallest n available for the current player.
   */
  public step(): { n: number; x: number; y: number; playerId: number; searchDepth: number } | null {
    const playerIndex = this.state.currentPlayerIndex;
    const player = this.players[playerIndex];
    const opponentMask = ~(1 << playerIndex);
    
    let n = Math.max(this.state.lowestUnoccupiedN, this.state.lastCheckedN[playerIndex]);
    let searchDepth = 0;

    // Fast coordinate lookup with layer caching
    let currentK = -1;
    let layerM = -1;
    let nextLayerN = -1;
    let layerSide = -1;

    while (true) {
      // Check occupation using bitset
      if ((this.state.occupationBitset[n >> 3] & (1 << (n & 7))) !== 0) {
        if (n === this.state.lowestUnoccupiedN) this.state.lowestUnoccupiedN++;
      } else {
        // Optimized coordinate calculation
        if (n >= nextLayerN || n < layerM) {
          currentK = n === 0 ? 0 : Math.ceil((Math.sqrt(n + 1) - 1) / 2);
          layerM = currentK === 0 ? 0 : Math.pow(2 * currentK - 1, 2);
          layerSide = 2 * currentK;
          nextLayerN = Math.pow(2 * currentK + 1, 2);
        }

        let cx, cy;
        if (n === 0) {
          cx = 0; cy = 0;
        } else {
          const i = n - layerM;
          const t = layerSide;
          const k = currentK;
          if (i < t) { cx = k; cy = -k + 1 + i; }
          else if (i < 2 * t) { cx = k - 1 - (i - t); cy = k; }
          else if (i < 3 * t) { cx = -k; cy = k - 1 - (i - 2 * t); }
          else { cx = -k + 1 + (i - 3 * t); cy = -k; }
        }

        const gx = cx + GRID_OFFSET;
        const gy = cy + GRID_OFFSET;
        let dangerValue = 0;
        
        if (gx >= 0 && gx < GRID_SIZE && gy >= 0 && gy < GRID_SIZE) {
          dangerValue = this.state.dangerGrid[gx + gy * GRID_SIZE];
        } else {
          for (let idx = 0; idx < this.players.length; idx++) {
            const p = this.players[idx];
            const offsets = this.attackOffsets.get(p.id) || [];
            for (const [dx, dy] of offsets) {
              if (this.getGridValue(cx - dx, cy - dy) === p.id) {
                dangerValue |= (1 << idx);
                break;
              }
            }
          }
        }

        if ((dangerValue & opponentMask) === 0) {
          this.setOccupied(n);
          this.setGridValue(cx, cy, player.id);
          this.state.step++;
          
          this.state.minX = Math.min(this.state.minX, cx);
          this.state.maxX = Math.max(this.state.maxX, cx);
          this.state.minY = Math.min(this.state.minY, cy);
          this.state.maxY = Math.max(this.state.maxY, cy);
          
          const result = { n, x: cx, y: cy, playerId: player.id, searchDepth };
          if (n === this.state.lowestUnoccupiedN) this.state.lowestUnoccupiedN++;
          this.state.lastCheckedN[playerIndex] = n;
          this.state.currentPlayerIndex = (this.state.currentPlayerIndex + 1) % this.players.length;
          return result;
        }
        searchDepth++;
      }
      
      n++;
      if (n >= MAX_N) return null;
    }
  }

  public getState() {
    return {
      step: this.state.step,
      bounds: {
        minX: this.state.minX,
        maxX: this.state.maxX,
        minY: this.state.minY,
        maxY: this.state.maxY
      }
    };
  }

  public reset() {
    this.state = this.createInitialState();
  }
}
