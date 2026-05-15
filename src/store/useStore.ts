import { create } from 'zustand';
import type { Player } from '../engine/simulation';
import { PIECE_LIBRARY } from '../engine/pieces';
import type { Preset } from '../engine/presets';

// High-performance typed buffer (n, x, y, playerId)
// Optimized specialized buffers for 100M pieces (~900MB total)
const MAX_PIECES = 125_000_000;
export const pieceN = new Int32Array(MAX_PIECES);
export const pieceX = new Int16Array(MAX_PIECES);
export const pieceY = new Int16Array(MAX_PIECES);
export const pieceP = new Uint8Array(MAX_PIECES);
export let piecesCount = 0;

export const resetBuffer = () => {
  piecesCount = 0;
};

const HASH_SIZE = 1 << 27; 
const HASH_MASK = HASH_SIZE - 1;
// Interleaved: [key(32bit) | value(32bit)] in one 64-bit word
const lookupTable = new BigUint64Array(HASH_SIZE);
const lookupOccupied = new Uint32Array(HASH_SIZE >>> 5); // Bitset: 32 slots per int

export const piecesLookup = {
  get: (key: number) => {
    const uKey = (key >>> 0);
    let h = uKey;
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    let idx = (h & HASH_MASK);

    while (lookupOccupied[idx >>> 5] & (1 << (idx & 31))) {
      const entry = lookupTable[idx];
      if (Number(entry >> 32n) === uKey) return Number(entry & 0xFFFFFFFFn);
      idx = (idx + 1) & HASH_MASK;
    }
    return undefined;
  },
  clear: () => {
    lookupOccupied.fill(0);
  }
};

interface EngineStore {
  players: Player[];
  isPlaying: boolean;
  speed: number;
  historyCount: number;
  worker: Worker | null;
  lastDuration: number;
  lastSearchDepth: number;
  lastDrawTime: number;
  lastSyncTime: number;
  lastMipLevel: number;
  voidColor: string;
  playfieldColor: string;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  isCompleted: boolean;

  // Actions
  initEngine: () => void;
  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: number) => void;
  setVoidColor: (color: string) => void;
  setPlayfieldColor: (color: string) => void;
  setDrawTime: (time: number) => void;
  setMipLevel: (level: number) => void;
  step: (count?: number) => void;
  reset: () => void;

  // Player Management
  addPlayer: (player: Omit<Player, 'id'>) => void;
  removePlayer: (id: number) => void;
  updatePlayer: (id: number, updates: Partial<Player>) => void;

  // Presets
  loadPreset: (preset: Preset) => void;
}

export const useStore = create<EngineStore>()(
  (set, get) => ({
    players: [
      {
        id: 1,
        color: '#3b82f6',
        pieceType: PIECE_LIBRARY.KNIGHT.leap,
      },
      {
        id: 2,
        color: '#ef4444',
        pieceType: PIECE_LIBRARY.KNIGHT.leap,
      }
    ],
    isPlaying: false,
    speed: 1,
    historyCount: 0,
    worker: null,
    lastDuration: 0,
    lastSearchDepth: 0,
    lastDrawTime: 0,
    lastSyncTime: 0,
    lastMipLevel: 0,
    voidColor: '#0a0a0c',
    playfieldColor: '#d6d6d6',
    bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
    isCompleted: false,

    initEngine: () => {
      const { worker, players } = get();
      if (worker) worker.terminate();

      const newWorker = new Worker(new URL('../engine/simulation.worker.ts', import.meta.url), { type: 'module' });

      newWorker.onmessage = (e) => {
        const { type, payload } = e.data;
        if (type === 'RESULTS') {
          const { results, count, avgSearchDepth, duration, completed, bounds, step } = payload;
          const syncStart = performance.now();
          const view = new Int32Array(results);

          let pCount = piecesCount;
          for (let i = 0; i < count; i++) {
            const offset = i * 5;
            const n = view[offset];
            const x = view[offset + 1];
            const y = view[offset + 2];
            const playerId = view[offset + 3];

            // 1. Store piece data
            if (pCount >= MAX_PIECES) {
              completed = true;
              break;
            }
            pieceN[pCount] = n;
            pieceX[pCount] = x;
            pieceY[pCount] = y;
            pieceP[pCount] = playerId;

            // 2. Inline Hash Table Set
            const uKey = ((x + 32768) << 16 | (y + 32768)) >>> 0;
            let h = uKey;
            h ^= h >>> 16;
            h = Math.imul(h, 0x85ebca6b);
            h ^= h >>> 13;
            h = Math.imul(h, 0xc2b2ae35);
            h ^= h >>> 16;
            let hIdx = (h & HASH_MASK);

            while (lookupOccupied[hIdx >>> 5] & (1 << (hIdx & 31))) {
              if (Number(lookupTable[hIdx] >> 32n) === uKey) break;
              hIdx = (hIdx + 1) & HASH_MASK;
            }
            
            lookupOccupied[hIdx >>> 5] |= (1 << (hIdx & 31));
            lookupTable[hIdx] = (BigInt(uKey) << 32n) | BigInt(pCount);

            pCount++;
          }
          piecesCount = pCount;

          set({
            historyCount: step,
            lastDuration: duration,
            lastSyncTime: performance.now() - syncStart,
            lastSearchDepth: avgSearchDepth,
            isPlaying: completed ? false : get().isPlaying,
            isCompleted: completed,
            bounds: bounds
          });
        } else if (type === 'RESET_DONE') {
          resetBuffer();
          piecesLookup.clear();
          set({ historyCount: 0, lastDuration: 0, lastSearchDepth: 0, isCompleted: false, bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 } });
        }
      };

      newWorker.postMessage({ type: 'INIT', payload: { players } });
      set({
        worker: newWorker,
        historyCount: 0,
        isPlaying: false,
        isCompleted: false,
        lastDuration: 0,
        lastSearchDepth: 0,
        bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 }
      });
      resetBuffer();
      piecesLookup.clear();
    },

    setPlaying: (playing) => set({ isPlaying: playing }),

    setSpeed: (speed) => set({ speed }),

    setVoidColor: (color) => set({ voidColor: color }),
    setPlayfieldColor: (color) => set({ playfieldColor: color }),
    setDrawTime: (time) => set({ lastDrawTime: time }),
    setMipLevel: (level) => set({ lastMipLevel: level }),

    step: (count = 1) => {
      const { worker } = get();
      if (worker) {
        worker.postMessage({ type: 'STEP', payload: { count } });
      }
    },

    reset: () => {
      const { worker } = get();
      if (worker) {
        worker.postMessage({ type: 'RESET' });
      }
      set({ isPlaying: false });
    },

    addPlayer: (player) => {
      const { players } = get();
      if (players.length >= 8) return;
      const nextId = players.length > 0 ? Math.max(...players.map(p => p.id)) + 1 : 1;
      const newPlayers = [...players, { ...player, id: nextId }];
      set({ players: newPlayers });
      get().initEngine();
    },

    removePlayer: (id) => {
      const { players } = get();
      const newPlayers = players.filter(p => p.id !== id);
      set({ players: newPlayers });
      get().initEngine();
    },

    updatePlayer: (id, updates) => {
      const { players } = get();
      const newPlayers = players.map(p => p.id === id ? { ...p, ...updates } : p);
      set({ players: newPlayers });
      get().initEngine();
    },

    loadPreset: (preset) => {
      const newPlayers = preset.players.map((p, index) => ({ ...p, id: index + 1 }));
      set({ players: newPlayers });
      get().initEngine();
    },
  })
);
