import { SimulationEngine } from './simulation';

let engine: SimulationEngine | null = null;
let running = false;
let currentBatchLimit = 10000;
let currentMipLevel = 0;
const MAX_BATCH_SIZE = 1_000_000;

// Double-buffering: we alternate between two buffers to avoid allocations
let bufferA = new Int32Array(MAX_BATCH_SIZE * 5);
let bufferB = new Int32Array(MAX_BATCH_SIZE * 5);
let currentBuffer = bufferA;

function runLoop() {
  if (!running || !engine) return;

  const loopStartTime = performance.now();
  let actualCount = 0;
  let totalSearchDepth = 0;
  let completed = false;

  const batchTimeLimit = 16 << currentMipLevel; // 16ms at MIP 0

  // Run for up to batchTimeLimit or until limit/buffer is reached
  const limit = Math.min(MAX_BATCH_SIZE, currentBatchLimit);
  while (actualCount < limit) {
    const result = engine.step();
    if (result) {
      currentBuffer[actualCount * 5] = result.n;
      currentBuffer[actualCount * 5 + 1] = result.x;
      currentBuffer[actualCount * 5 + 2] = result.y;
      currentBuffer[actualCount * 5 + 3] = result.playerId;
      currentBuffer[actualCount * 5 + 4] = result.searchDepth;
      totalSearchDepth += result.searchDepth;
      actualCount++;
    } else {
      completed = true;
      running = false;
      break;
    }

    // Check time more frequently (every 1000 steps for large batches)
    if (actualCount % 1000 === 0) {
      if (performance.now() - loopStartTime > batchTimeLimit) {
        break;
      }
    }
  }

  if (actualCount > 0) {
    const state = engine.getState();
    const duration = performance.now() - loopStartTime;

    // Transfer the current buffer to the main thread
    const transferredBuffer = currentBuffer;
    // Swap to the other buffer for the next round
    currentBuffer = (currentBuffer === bufferA) ? bufferB : bufferA;

    self.postMessage({
      type: 'RESULTS',
      payload: {
        results: transferredBuffer.buffer,
        count: actualCount,
        step: state.step,
        lowestUnoccupiedN: state.lowestUnoccupiedN,
        memoryUsed: state.memoryUsed,
        activeTiles: state.activeTiles,
        freedTiles: state.freedTiles,
        bounds: state.bounds,
        duration: duration,
        completed: completed,
        avgSearchDepth: actualCount > 0 ? totalSearchDepth / actualCount : 0
      }
    }, [transferredBuffer.buffer]);
  }
}

self.onmessage = (e) => {
  const { type, payload } = e.data;

  if (type === 'INIT') {
    const { players } = payload;
    engine = new SimulationEngine(players);
  } else if (type === 'START') {
    currentBatchLimit = payload.batchSize || currentBatchLimit;
    if (!running) {
      running = true;
      runLoop();
    }
  } else if (type === 'ACK') {
    // Main thread returns the buffer it's done with
    if (payload && payload.buffer) {
      const returnedBuffer = new Int32Array(payload.buffer);
      if (currentBuffer === bufferA) bufferB = returnedBuffer;
      else bufferA = returnedBuffer;
    }
    if (running) {
      runLoop();
    }
  } else if (type === 'MIP_LEVEL_UPDATE') {
    currentMipLevel = payload.mipLevel;
  } else if (type === 'STOP') {
    running = false;
  } else if (type === 'STEP') {
    // Single step still supported
    currentBatchLimit = payload.count;
    const oldRunning = running;
    running = true;
    runLoop();
    running = oldRunning;
  } else if (type === 'RESET') {
    running = false;
    if (engine) {
      engine.reset();
      self.postMessage({ type: 'RESET_DONE' });
    }
  }
};
