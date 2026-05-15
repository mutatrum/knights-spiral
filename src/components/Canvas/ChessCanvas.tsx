import React, { useRef, useEffect, useState } from 'react';
import { useStore } from '../../store/useStore';
import { MAX_N, spiralPieces } from '../../engine/simulation';
import { PIECE_LIBRARY } from '../../engine/pieces';
import { numberToCoord, coordToNumber } from '../../engine/spiral';

const TILE_SIZE = 512;
const MIP_LEVELS = [
  { scale: 1.0 },
  { scale: 0.5 },
  { scale: 0.25 },
  { scale: 0.125 },
  { scale: 0.0625 },
  { scale: 0.03125 },
  { scale: 0.015625 }
];

export const ChessCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scratchCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const scratchImageDataRef = useRef<ImageData | null>(null);
  
  const tilesRef = useRef<Map<string, Uint8Array>>(new Map());
  const canvasCacheRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const dirtyTilesRef = useRef<Set<string>>(new Set());
  const {
    historyCount,
    maxNProcessed,
    lowestUnoccupiedN,
    lastBatchResults,
    players,
    voidColor,
    playfieldColor,
    bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 },
    setDrawTime,
    setDisplayMemory,
    setMipLevel,
    worker // Added
  } = useStore();

  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(20);
  const [isAutoZoom, setIsAutoZoom] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [lastMouse, setLastMouse] = useState({ x: 0, y: 0 });
  const [hoveredPiece, setHoveredPiece] = useState<{ n: number; x: number; y: number; playerId: number } | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const lastProcessedN = useRef(-1);

  const getTile = (mip: number, tx: number, ty: number): Uint8Array => {
    const key = `${mip}:${tx}:${ty}`;
    let tile = tilesRef.current.get(key);
    if (!tile) {
      tile = new Uint8Array(TILE_SIZE * TILE_SIZE);
      tilesRef.current.set(key, tile);
      // Each tile is 512x512 bytes = 256KB
      setDisplayMemory(tilesRef.current.size * 262144);
    }
    return tile;
  };

  useEffect(() => {
    if (!lastBatchResults) return;

    // Use sets to deduplicate updates for higher MIP levels within a single batch
    const mipDirtyPixels = new Map<string, Set<number>>();
    const count = lastBatchResults.length / 5;

    for (let i = 0; i < count; i++) {
      const n = lastBatchResults[i * 5];
      const x = lastBatchResults[i * 5 + 1];
      const y = lastBatchResults[i * 5 + 2];
      const playerId = lastBatchResults[i * 5 + 3];

      if (playerId === 0) continue;
      
      spiralPieces.set(n, playerId);
      
      let player = players.find(p => p.id === playerId);
      if (!player) {
        player = { id: playerId, color: '#fff', pieceType: { a: 1, b: 1 } };
      }

      // Always update MIP 0 (highest detail)
      const level0 = MIP_LEVELS[0];
      const tx0 = Math.floor((x * level0.scale) / TILE_SIZE);
      const ty0 = Math.floor((-y * level0.scale) / TILE_SIZE);
      const tile0 = getTile(0, tx0, ty0);
      const lx0 = Math.floor((x * level0.scale % TILE_SIZE + TILE_SIZE) % TILE_SIZE);
      const ly0 = Math.floor((-y * level0.scale % TILE_SIZE + TILE_SIZE) % TILE_SIZE);
      tile0[ly0 * TILE_SIZE + lx0] = playerId;
      
      const key0 = `0:${tx0}:${ty0}`;
      const cached0 = canvasCacheRef.current.get(key0);
      if (cached0) {
        const cctx = cached0.getContext('2d');
        if (cctx) {
          cctx.fillStyle = player.color;
          cctx.fillRect(lx0, ly0, 1, 1);
        }
      } else {
        dirtyTilesRef.current.add(key0);
      }

      // For higher MIP levels, deduplicate to avoid redundant fillRect calls
      for (let m = 1; m < MIP_LEVELS.length; m++) {
        const level = MIP_LEVELS[m];
        const px = x * level.scale;
        const py = -y * level.scale;
        const tx = Math.floor(px / TILE_SIZE);
        const ty = Math.floor(py / TILE_SIZE);
        const lx = Math.floor((px % TILE_SIZE + TILE_SIZE) % TILE_SIZE);
        const ly = Math.floor((py % TILE_SIZE + TILE_SIZE) % TILE_SIZE);
        
        const tileKey = `${m}:${tx}:${ty}`;
        const pixelKey = (lx << 16) | ly;
        
        let dirtySet = mipDirtyPixels.get(tileKey);
        if (!dirtySet) {
          dirtySet = new Set();
          mipDirtyPixels.set(tileKey, dirtySet);
        }
        
        if (!dirtySet.has(pixelKey)) {
          dirtySet.add(pixelKey);
          const tile = getTile(m, tx, ty);
          tile[ly * TILE_SIZE + lx] = playerId;
          
          const cached = canvasCacheRef.current.get(tileKey);
          if (cached) {
            const cctx = cached.getContext('2d');
            if (cctx) {
              cctx.fillStyle = player.color;
              cctx.fillRect(lx, ly, 1, 1);
            }
          } else {
            dirtyTilesRef.current.add(tileKey);
          }
        }
      }
    }

    lastProcessedN.current = maxNProcessed;
    draw();

    // After drawing, return the buffer to the worker for recycling
    if (worker && lastBatchResults) {
      worker.postMessage({ type: 'ACK', payload: { buffer: lastBatchResults.buffer } }, [lastBatchResults.buffer]);
    }
  }, [historyCount, lastBatchResults, players, worker]);

  // Reset tiles on restart
  useEffect(() => {
    if (historyCount === 0) {
      tilesRef.current.clear();
      canvasCacheRef.current.clear();
      dirtyTilesRef.current.clear();
      setDisplayMemory(0);
      lastProcessedN.current = -1;
      draw();
    }
  }, [historyCount]);

  const hexToRgb = (hex: string): [number, number, number] => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return [r, g, b];
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const startTime = performance.now();
    const pixelRatio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth * pixelRatio;
    const height = canvas.clientHeight * pixelRatio;

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    // Initialize scratch canvas for indexed tile hydration
    if (!scratchCanvasRef.current) {
      const sc = document.createElement('canvas');
      sc.width = TILE_SIZE;
      sc.height = TILE_SIZE;
      scratchCanvasRef.current = sc;
      scratchImageDataRef.current = sc.getContext('2d')!.createImageData(TILE_SIZE, TILE_SIZE);
    }
    const scratchCanvas = scratchCanvasRef.current;
    const scratchCtx = scratchCanvas.getContext('2d')!;
    const scratchImageData = scratchImageDataRef.current!;

    // Pre-calculate palette colors as RGB triples
    const palette = new Map<number, [number, number, number]>();
    players.forEach(p => {
      palette.set(p.id, hexToRgb(p.color));
    });

    ctx.fillStyle = voidColor;
    ctx.fillRect(0, 0, width, height);

    const currentScale = scale * pixelRatio;
    const centerX = width / 2 + offset.x * pixelRatio - 0.5 * currentScale;
    const centerY = height / 2 + offset.y * pixelRatio - 0.5 * currentScale;

    // Board (Playfield)
    const boardX = centerX + bounds.minX * currentScale;
    const boardY = centerY - bounds.maxY * currentScale;
    const boardW = (bounds.maxX - bounds.minX + 1) * currentScale;
    const boardH = (bounds.maxY - bounds.minY + 1) * currentScale;

    ctx.fillStyle = playfieldColor;
    ctx.fillRect(
      Math.round(boardX), 
      Math.round(boardY), 
      Math.round(boardW), 
      Math.round(boardH)
    );

    // Grid lines (only if scale is large)
    if (currentScale > 4) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.lineWidth = 1;
      const startX = (centerX % currentScale);
      const startY = (centerY % currentScale);
      ctx.beginPath();
      for (let x = startX; x < width; x += currentScale) {
        ctx.moveTo(x, 0); ctx.lineTo(x, height);
      }
      for (let y = startY; y < height; y += currentScale) {
        ctx.moveTo(0, y); ctx.lineTo(width, y);
      }
      ctx.stroke();
    }

    // Select MIP level
    let mipLevel = 0;
    for (let i = 0; i < MIP_LEVELS.length; i++) {
      if (currentScale >= MIP_LEVELS[i].scale) {
        mipLevel = i;
        break;
      }
      mipLevel = i;
    }
    setMipLevel(mipLevel);

    const level = MIP_LEVELS[mipLevel];
    const viewScale = currentScale / level.scale;
    
    ctx.imageSmoothingEnabled = viewScale < 0.95;
    ctx.imageSmoothingQuality = 'low';

    const worldLeft = -centerX / currentScale;
    const worldRight = (width - centerX) / currentScale;
    const worldTop = centerY / currentScale;
    const worldBottom = (centerY - height) / currentScale;

    const mipLeft = worldLeft * level.scale;
    const mipRight = worldRight * level.scale;
    const mipTop = -worldTop * level.scale;
    const mipBottom = -worldBottom * level.scale;

    const tileLeft = Math.floor(mipLeft / TILE_SIZE);
    const tileRight = Math.floor(mipRight / TILE_SIZE);
    const tileTop = Math.floor(mipTop / TILE_SIZE);
    const tileBottom = Math.floor(mipBottom / TILE_SIZE);

    for (let tx = tileLeft; tx <= tileRight; tx++) {
      for (let ty = tileTop; ty <= tileBottom; ty++) {
        const key = `${mipLevel}:${tx}:${ty}`;
        const tile = tilesRef.current.get(key);
        if (tile) {
          let cachedCanvas = canvasCacheRef.current.get(key);
          
          // Hydrate if missing or dirty
          if (!cachedCanvas || dirtyTilesRef.current.has(key)) {
            if (!cachedCanvas) {
              cachedCanvas = document.createElement('canvas');
              cachedCanvas.width = TILE_SIZE;
              cachedCanvas.height = TILE_SIZE;
              canvasCacheRef.current.set(key, cachedCanvas);
            }
            
            const cctx = cachedCanvas.getContext('2d')!;
            const data = scratchImageData.data;
            for (let i = 0; i < tile.length; i++) {
              const pId = tile[i];
              if (pId === 0) {
                data[i * 4 + 3] = 0;
              } else {
                const rgb = palette.get(pId) || [255, 255, 255];
                data[i * 4] = rgb[0];
                data[i * 4 + 1] = rgb[1];
                data[i * 4 + 2] = rgb[2];
                data[i * 4 + 3] = 255;
              }
            }
            cctx.putImageData(scratchImageData, 0, 0);
            dirtyTilesRef.current.delete(key);
            
            // Limit cache size to prevent memory leaks (e.g. 100 tiles)
            if (canvasCacheRef.current.size > 100) {
              const oldestKey = canvasCacheRef.current.keys().next().value;
              canvasCacheRef.current.delete(oldestKey);
            }
          }

          const worldX = (tx * TILE_SIZE) / level.scale;
          const worldY = -(ty * TILE_SIZE) / level.scale;
          
          const screenX = Math.round(centerX + worldX * currentScale);
          const screenY = Math.round(centerY - worldY * currentScale);
          
          const nextWorldX = ((tx + 1) * TILE_SIZE) / level.scale;
          const nextWorldY = -((ty + 1) * TILE_SIZE) / level.scale;
          const nextScreenX = Math.round(centerX + nextWorldX * currentScale);
          const nextScreenY = Math.round(centerY - nextWorldY * currentScale);
          
          const screenW = nextScreenX - screenX;
          const screenH = nextScreenY - screenY;
          
          ctx.drawImage(cachedCanvas, screenX, screenY, screenW, screenH);
        }
      }
    }

    // High-quality labels
    if (currentScale > 30) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = `${currentScale / 3}px Inter`;
      ctx.textAlign = 'center';
      const minX = Math.floor(worldLeft);
      const maxX = Math.ceil(worldRight);
      const minY = Math.floor(worldBottom);
      const maxY = Math.ceil(worldTop);

      for (let gx = minX; gx <= maxX; gx++) {
        for (let gy = minY; gy <= maxY; gy++) {
          const n = coordToNumber(gx, gy);
          if (n < MAX_N) {
            const playerId = spiralPieces.get(n);
            if (playerId !== 0) {
              const px = centerX + (gx + 0.5) * currentScale;
              const py = centerY - (gy - 0.5) * currentScale;
              ctx.fillText(n.toLocaleString(), px, py + currentScale / 8);
            }
          }
        }
      }
    }

    if (hoveredPiece) {
      const px = centerX + (hoveredPiece.x + 0.5) * currentScale;
      const py = centerY - (hoveredPiece.y - 0.5) * currentScale;
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.strokeRect(px - currentScale / 2, py - currentScale / 2, currentScale, currentScale);
    }

    setDrawTime(performance.now() - startTime);
  };

  useEffect(() => {
    draw();
  }, [offset, scale, hoveredPiece, voidColor, playfieldColor]);

  // Auto-zoom effect
  useEffect(() => {
    if (!isAutoZoom || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;
    if (width === 0 || height === 0) return;

    const padding = 0.90;
    const maxAbsX = Math.max(Math.abs(bounds.minX), Math.abs(bounds.maxX));
    const maxAbsY = Math.max(Math.abs(bounds.minY), Math.abs(bounds.maxY));
    const boardW = (maxAbsX * 2 + 2);
    const boardH = (maxAbsY * 2 + 2);

    const scaleX = (width * padding) / boardW;
    const scaleY = (height * padding) / boardH;
    // Cap auto-zoom at 50 to avoid crazy zooming on empty board
    const newScale = Math.max(0.01, Math.min(50, Math.min(scaleX, scaleY)));
    
    if (newScale > 0 && isFinite(newScale)) {
      setScale(newScale);
      setOffset({ x: 0, y: 0 });
    }
  }, [bounds, isAutoZoom]);

  const onMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setIsAutoZoom(false);
    setLastMouse({ x: e.clientX, y: e.clientY });
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      const dx = e.clientX - lastMouse.x;
      const dy = e.clientY - lastMouse.y;
      setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      setLastMouse({ x: e.clientX, y: e.clientY });
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (window.devicePixelRatio || 1);
    const my = (e.clientY - rect.top) * (window.devicePixelRatio || 1);

    const pixelRatio = window.devicePixelRatio || 1;
    const width = canvas.width;
    const height = canvas.height;
    const currentScale = scale * pixelRatio;
    const centerX = width / 2 + offset.x * pixelRatio - 0.5 * currentScale;
    const centerY = height / 2 + offset.y * pixelRatio - 0.5 * currentScale;

    const gx = Math.floor((mx - centerX) / currentScale);
    const gy = Math.ceil((centerY - my) / currentScale);

    const n = coordToNumber(gx, gy);
    if (n < MAX_N) {
      const playerId = spiralPieces.get(n);
      if (playerId !== 0) {
        setHoveredPiece({ n, x: gx, y: gy, playerId });
        setTooltipPos({ x: e.clientX, y: e.clientY });
      } else {
        setHoveredPiece(null);
      }
    } else {
      setHoveredPiece(null);
    }
  };

  const onMouseUp = () => setIsDragging(false);
  
  const onWheel = (e: React.WheelEvent) => {
    setIsAutoZoom(false);
    const zoomSpeed = 0.001;
    const delta = -e.deltaY;
    const factor = Math.pow(1.1, delta / 100);
    const newScale = Math.max(0.01, Math.min(50, scale * factor));
    
    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      
      const centerX = (canvas.offsetWidth / 2 + offset.x) - 0.5 * scale;
      const centerY = (canvas.offsetHeight / 2 + offset.y) - 0.5 * scale;
      
      const worldX = (mx - centerX) / scale;
      const worldY = Math.ceil((centerY - my) * 1000) / 1000 / scale; // Use precision to avoid floating point issues
      
      const newCenterX = (canvas.offsetWidth / 2 + worldX * newScale) - 0.5 * newScale;
      const newCenterY = (canvas.offsetHeight / 2 - worldY * newScale) - 0.5 * newScale;

      const newOffsetX = mx - newCenterX;
      const newOffsetY = newCenterY - my;

      setScale(newScale);
      setOffset({ x: newOffsetX, y: -newOffsetY });
    }
  };

  return (
    <div className="canvas-container" style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
        style={{ width: '100%', height: '100%', display: 'block', cursor: isDragging ? 'grabbing' : 'crosshair' }}
      />
      {hoveredPiece && (
        <div style={{
          position: 'fixed',
          left: tooltipPos.x + 15,
          top: tooltipPos.y + 15,
          background: 'rgba(0,0,0,0.85)',
          color: 'white',
          padding: '8px 12px',
          borderRadius: '6px',
          fontSize: '12px',
          pointerEvents: 'none',
          zIndex: 1000,
          border: '1px solid rgba(255,255,255,0.1)',
          backdropFilter: 'blur(4px)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '4px', color: players.find(p => p.id === hoveredPiece.playerId)?.color }}>
            {PIECE_LIBRARY.KNIGHT.name} #{hoveredPiece.n.toLocaleString()}
          </div>
          <div>Coord: ({hoveredPiece.x}, {hoveredPiece.y})</div>
          <div>Player: {hoveredPiece.playerId}</div>
        </div>
      )}
      <div className="canvas-controls" style={{ position: 'absolute', bottom: '1rem', right: '1rem', display: 'flex', gap: '0.5rem' }}>
        <button 
          className={isAutoZoom ? 'primary' : 'secondary'} 
          onClick={() => setIsAutoZoom(!isAutoZoom)}
          style={{ padding: '0.5rem 1rem', fontSize: '0.75rem' }}
        >
          {isAutoZoom ? 'Auto-Zoom On' : 'Manual View'}
        </button>
        <button 
          className="secondary" 
          onClick={() => { setOffset({ x: 0, y: 0 }); setScale(20); }}
          style={{ padding: '0.5rem 1rem', fontSize: '0.75rem' }}
        >
          Reset View
        </button>
      </div>
    </div>
  );
};
