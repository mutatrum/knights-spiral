import { SimulationEngine, Player } from './simulation';

let engine: SimulationEngine | null = null;

self.onmessage = (e: MessageEvent) => {
  const { type, payload } = e.data;

  switch (type) {
    case 'INIT':
      engine = new SimulationEngine(payload.players);
      break;

    case 'STEP':
      if (!engine) return;
      const startTime = performance.now();
      
      const count = payload.count;
      const resultsBuffer = new Int32Array(count * 5); // n, x, y, playerId, searchDepth
      let actualCount = 0;
      let completed = false;
      let totalSearchDepth = 0;

      for (let i = 0; i < count; i++) {
        const result = engine.step();
        if (result) {
          const offset = i * 5;
          resultsBuffer[offset] = result.n;
          resultsBuffer[offset + 1] = result.x;
          resultsBuffer[offset + 2] = result.y;
          resultsBuffer[offset + 3] = result.playerId;
          resultsBuffer[offset + 4] = result.searchDepth;
          totalSearchDepth += result.searchDepth;
          actualCount++;
        } else {
          completed = true;
          break;
        }
      }
      
      const duration = performance.now() - startTime;
      const state = engine.getState();
      
      self.postMessage({ 
        type: 'RESULTS', 
        payload: { 
          results: resultsBuffer.buffer, 
          count: actualCount,
          step: state.step,
          bounds: state.bounds,
          duration,
          completed,
          avgSearchDepth: actualCount > 0 ? totalSearchDepth / actualCount : 0
        } 
      }, [resultsBuffer.buffer]);
      break;

    case 'RESET':
      if (engine) engine.reset();
      self.postMessage({ type: 'RESET_DONE' });
      break;
  }
};
