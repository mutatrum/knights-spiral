import React, { useEffect, useRef } from 'react';
import { ChessCanvas } from './components/Canvas/ChessCanvas';
import { PlayerEditor } from './components/Sidebar/PlayerEditor';
import { PresetGallery } from './components/Sidebar/PresetGallery';
import { ExportTools } from './components/Sidebar/ExportTools';
import { useStore, maxNProcessed } from './store/useStore';
import { spiralPieces } from './engine/simulation';
import { Play, Pause, RotateCcw, FastForward, ChevronDown, ChevronRight, Settings, Activity } from 'lucide-react';

function App() {
  const {
    isPlaying,
    setPlaying,
    step,
    reset,
    initEngine,
    historyCount,
    speed,
    setSpeed,
    voidColor,
    setVoidColor,
    playfieldColor,
    setPlayfieldColor,
    lastDuration,
    lastDrawTime,
    lastSyncTime,
    lastMipLevel,
    isCompleted,
    memoryUsed,
    displayMemory,
    totalTime,
    activeTiles,
    pooledTiles
  } = useStore();

  const lastHistoryCount = useRef(historyCount);
  const lastSpsTime = useRef(performance.now());
  const [sps, setSps] = React.useState(0);
  const [isWorldOpen, setIsWorldOpen] = React.useState(false);
  const [isMetricsOpen, setIsMetricsOpen] = React.useState(true);

  useEffect(() => {
    initEngine();
  }, [initEngine]);

  useEffect(() => {
    const now = performance.now();
    const dt = (now - lastSpsTime.current) / 1000;
    if (dt >= 0.5) { // Update every 500ms
      const ds = historyCount - lastHistoryCount.current;
      setSps(Math.round(ds / dt));
      lastHistoryCount.current = historyCount;
      lastSpsTime.current = now;
    }
  }, [historyCount]);


  return (
    <>
      <aside className="sidebar" style={{ overflowY: 'auto' }}>
        <div style={{ marginBottom: '1rem' }}>
          <h1>Knight's Spiral</h1>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Interactive Pattern Explorer
          </p>
        </div>

        <div className="control-group">
          <span className="label">Simulation</span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => !isCompleted && setPlaying(!isPlaying)}
              disabled={isCompleted}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', opacity: isCompleted ? 0.5 : 1 }}
            >
              {isCompleted ? <Pause size={18} /> : (isPlaying ? <Pause size={18} /> : <Play size={18} />)}
              {isCompleted ? 'Finished' : (isPlaying ? 'Pause' : 'Start')}
            </button>
            <button className="secondary" onClick={() => step(1)} disabled={isCompleted} style={{ opacity: isCompleted ? 0.5 : 1 }}>
              <FastForward size={18} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
              <span className="label">Speed</span>
              <span>{speed} steps/tick</span>
            </div>
            <input
              type="range"
              min="1"
              max="1000000"
              value={speed}
              onChange={(e) => setSpeed(parseInt(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent)' }}
            />
          </div>
          <button className="secondary" onClick={reset} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            <RotateCcw size={18} /> Reset
          </button>
        </div>
        <PresetGallery />
        <PlayerEditor />

        <div className="control-group">
          <div
            className="label"
            onClick={() => setIsWorldOpen(!isWorldOpen)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Settings size={16} /> World Settings
            </span>
            {isWorldOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </div>
          {isWorldOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '0.75rem', opacity: 0.7, flex: 1 }}>Void Color</span>
                <input
                  type="color"
                  value={voidColor}
                  onChange={(e) => setVoidColor(e.target.value)}
                  style={{ width: '40px', height: '20px', border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '0.75rem', opacity: 0.7, flex: 1 }}>Board Color</span>
                <input
                  type="color"
                  value={playfieldColor}
                  onChange={(e) => setPlayfieldColor(e.target.value)}
                  style={{ width: '40px', height: '20px', border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}
                />
              </div>
            </div>
          )}
        </div>

        <ExportTools />

        <div className="stats" style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Steps:</span>
            <span style={{ color: 'white', fontWeight: 600 }}>{historyCount.toLocaleString() ?? 0}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Last n:</span>
            <span style={{ color: 'white', fontWeight: 600 }}>
              {historyCount > 0 ? maxNProcessed.toLocaleString() : '-'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Steps/sec:</span>
            <span style={{
              fontWeight: 700,
              color: sps > 100000 ? '#4ade80' : sps > 10000 ? '#fbbf24' : '#f87171'
            }}>{sps.toLocaleString()}</span>
          </div>
        </div>

        <div className="stats" style={{ marginTop: '0.5rem', opacity: 0.8 }}>
          <div
            className="label"
            onClick={() => setIsMetricsOpen(!isMetricsOpen)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none', marginBottom: isMetricsOpen ? '0.75rem' : 0 }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.65rem' }}>
              <Activity size={14} /> Performance
            </span>
            {isMetricsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </div>
          {isMetricsOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                <span>Batch Time:</span>
                <span>{lastDuration.toFixed(1)}ms</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                <span>Sync Time:</span>
                <span>{lastSyncTime.toFixed(1)}ms</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                <span>Draw Time:</span>
                <span>{lastDrawTime.toFixed(1)}ms</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                <span>MIP Level:</span>
                <span>{lastMipLevel}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                <span>Engine Memory:</span>
                <span>{(memoryUsed / 1024 / 1024).toFixed(1)} MB</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                <span>Display Memory:</span>
                <span>{(displayMemory / 1024 / 1024).toFixed(1)} MB</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                <span>Buffer Memory:</span>
                <span>{(spiralPieces.allocatedBytes / 1024 / 1024).toFixed(1)} MB</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                <span>Active/Pooled:</span>
                <span>{activeTiles} / {pooledTiles}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginTop: '4px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '4px' }}>
                <span>Work Time:</span>
                <span>{(() => {
                  const seconds = Math.floor(totalTime / 1000);
                  const h = Math.floor(seconds / 3600);
                  const m = Math.floor((seconds % 3600) / 60);
                  const s = seconds % 60;
                  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                })()}</span>
              </div>
            </div>
          )}
        </div>
      </aside>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <ChessCanvas />
      </main>
    </>
  );
}

export default App;
