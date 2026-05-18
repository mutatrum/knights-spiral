import { SimulationEngine } from './simulation';

let engine: SimulationEngine | null = null;
let running = false;
let currentBatchLimit = 10000;

const MAX_BATCH_SIZE = 1_000_000;

// Quad-buffering: maintains a pool of 4 buffers for zero-stall asynchronous parallelism
let bufferPool: Int32Array[] = [
  new Int32Array(MAX_BATCH_SIZE * 5),
  new Int32Array(MAX_BATCH_SIZE * 5),
  new Int32Array(MAX_BATCH_SIZE * 5),
  new Int32Array(MAX_BATCH_SIZE * 5)
];
let isWorking = false;

// Zero-latency message loop scheduler (React Fiber style)
const scheduler = new MessageChannel();
scheduler.port1.onmessage = () => {
  if (running && !isWorking && bufferPool.length > 0) {
    runLoop();
  }
};
const scheduleNext = () => scheduler.port2.postMessage(null);

function runLoop() {
  if (!running || !engine || isWorking || bufferPool.length === 0) return;
  isWorking = true;

  const loopStartTime = performance.now();
  let actualCount = 0;
  let totalSearchDepth = 0;
  let completed = false;

  const currentBuffer = bufferPool.pop()!;

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
  }

  if (actualCount > 0) {
    const state = engine.getState();
    const duration = performance.now() - loopStartTime;

    const transferredBuffer = currentBuffer;

    (self as any).postMessage({
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
  } else {
    // If nothing processed, return buffer to pool
    bufferPool.push(currentBuffer);
  }

  isWorking = false;

  if (running && bufferPool.length > 0) {
    scheduleNext();
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
      scheduleNext();
    }
  } else if (type === 'ACK') {
    if (payload && payload.buffer) {
      bufferPool.push(new Int32Array(payload.buffer));
    }
    if (running && !isWorking) {
      scheduleNext();
    }
  } else if (type === 'MIP_LEVEL_UPDATE') {
    // MIP level tracked if needed
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
