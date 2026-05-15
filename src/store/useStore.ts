import { create } from 'zustand';
import type { Player } from '../engine/simulation';
import { spiralPieces } from '../engine/simulation'; // Added
import { PIECE_LIBRARY } from '../engine/pieces';
import type { Preset } from '../engine/presets';

export let piecesCount = 0;
export let maxNProcessed = 0;

export const resetBuffer = () => {
  piecesCount = 0;
  maxNProcessed = 0;
  spiralPieces.reset();
};

export interface EngineStore {
  players: Player[];
  isPlaying: boolean;
  isCompleted: boolean;
  speed: number;
  historyCount: number;
  maxNProcessed: number;
  lowestUnoccupiedN: number;
  lastBatchResults: Int32Array | null;
  worker: Worker | null;
  lastDuration: number;
  lastSearchDepth: number;
  lastDrawTime: number;
  lastSyncTime: number;
  lastMipLevel: number;
  memoryUsed: number;
  displayMemory: number;
  activeTiles: number; // Added
  freedTiles: number; // Added
  totalTime: number;
  voidColor: string;
  playfieldColor: string;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };

  // Actions
  initEngine: () => void;
  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: number) => void;
  step: (count?: number) => void;
  reset: () => void;

  setVoidColor: (color: string) => void;
  setPlayfieldColor: (color: string) => void;
  setDrawTime: (time: number) => void;
  setDisplayMemory: (mem: number) => void; // Added
  setMipLevel: (level: number) => void;

  addPlayer: (player: Omit<Player, 'id'>) => void;
  removePlayer: (id: number) => void;
  updatePlayer: (id: number, updates: Partial<Omit<Player, 'id'>>) => void;

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
    isCompleted: false,
    speed: 1,
    historyCount: 0,
    maxNProcessed: 0,
    lowestUnoccupiedN: 0,
    lastBatchResults: null,
    worker: null,
    lastDuration: 0,
    lastSearchDepth: 0,
    lastDrawTime: 0,
    lastSyncTime: 0,
    lastMipLevel: 0,
    memoryUsed: 0, // Added
    displayMemory: 0,
    activeTiles: 0, // Added
    freedTiles: 0, // Added
    totalTime: 0, // Added
    voidColor: '#0a0a0c',
    playfieldColor: '#d6d6d6',
    bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 },

    initEngine: () => {
      const { players, worker: oldWorker } = get();
      if (oldWorker) oldWorker.terminate();

      const newWorker = new Worker(new URL('../engine/simulation.worker.ts', import.meta.url), { type: 'module' });

      newWorker.onmessage = (e) => {
        const { type, payload } = e.data;
        if (type === 'RESULTS') {
          const { results, count, step, bounds, duration, completed, avgSearchDepth, lowestUnoccupiedN, memoryUsed, activeTiles, freedTiles } = payload;
          const pieces = new Int32Array(results);

          const startSync = performance.now();

          // results contains: n, x, y, playerId, searchDepth
          for (let i = 0; i < count; i++) {
            const n = pieces[i * 5];
            const pId = pieces[i * 5 + 3];
            spiralPieces.set(n, pId);
            if (n > maxNProcessed) maxNProcessed = n;
          }

          piecesCount += count;

          const endSync = performance.now();
          set({ lastSyncTime: endSync - startSync });

          // Memory Safety: Auto-pause if we hit 3GB to prevent browser crash
          if ((window.performance as any).memory) {
            const used = (window.performance as any).memory.usedJSHeapSize;
            if (used > 3 * 1024 * 1024 * 1024) {
              get().setPlaying(false);
              console.warn("Simulation paused due to high memory pressure (> 3GB)");
            }
          }

          set({
            historyCount: piecesCount,
            maxNProcessed: maxNProcessed,
            lowestUnoccupiedN,
            lastBatchResults: pieces,
            memoryUsed,
            activeTiles,
            freedTiles,
            totalTime: get().totalTime + duration,
            lastDuration: duration,
            lastSearchDepth: avgSearchDepth,
            lastSyncTime: endSync - startSync,
            bounds,
            isCompleted: completed
          });
        } else if (type === 'RESET_DONE') {
          resetBuffer();
          set({
            historyCount: 0,
            maxNProcessed: 0,
            lowestUnoccupiedN: 0,
            lastBatchResults: null,
            memoryUsed: 0,
            activeTiles: 0, // Added
            freedTiles: 0, // Added
            totalTime: 0,
            isCompleted: false,
            bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 }
          });
        }
      };

      newWorker.postMessage({ type: 'INIT', payload: { players } });
      set({
        worker: newWorker,
        historyCount: 0,
        maxNProcessed: 0,
        lowestUnoccupiedN: 0,
        lastBatchResults: null,
        isPlaying: false,
        isCompleted: false,
        lastDuration: 0,
        lastSearchDepth: 0,
        bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 }
      });
      resetBuffer();
    },

    setPlaying: (playing) => {
      const { worker, speed } = get();
      if (worker) {
        if (playing) {
          worker.postMessage({ type: 'START', payload: { batchSize: speed } });
        } else {
          worker.postMessage({ type: 'STOP' });
        }
      }
      set({ isPlaying: playing });
    },
    setSpeed: (speed) => {
      const { worker, isPlaying } = get();
      if (worker && isPlaying) {
        worker.postMessage({ type: 'START', payload: { batchSize: speed } });
      }
      set({ speed });
    },
    setVoidColor: (color) => set({ voidColor: color }),
    setPlayfieldColor: (color) => set({ playfieldColor: color }),
    setDrawTime: (time) => set({ lastDrawTime: time }),
    setDisplayMemory: (mem) => set({ displayMemory: mem }),
    setMipLevel: (level) => {
      const { worker } = get();
      if (worker) {
        worker.postMessage({ type: 'MIP_LEVEL_UPDATE', payload: { mipLevel: level } });
      }
      set({ lastMipLevel: level });
    },

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
      set({
        isPlaying: false,
        historyCount: 0,
        maxNProcessed: 0,
        lowestUnoccupiedN: 0,
        lastBatchResults: null,
        memoryUsed: 0,
        activeTiles: 0,
        freedTiles: 0,
        totalTime: 0
      });
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
