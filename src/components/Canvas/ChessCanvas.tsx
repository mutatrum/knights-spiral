import React, { useRef, useEffect, useState } from 'react';
import { useStore } from '../../store/useStore';
import { MAX_N, spiralPieces } from '../../engine/simulation';
import { PIECE_LIBRARY } from '../../engine/pieces';
import { coordToNumber } from '../../engine/spiral';
import { QuadtreeDisplay } from '../../engine/quadtree';

const TILE_SIZE = 512;


export const ChessCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scratchCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const scratchImageDataRef = useRef<ImageData | null>(null);
  const quadtreeRef = useRef<QuadtreeDisplay>(new QuadtreeDisplay());

  const {
    historyCount,
    maxNProcessed,
    lastBatchResults,
    players,
    voidColor,
    playfieldColor,
    bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 },
    setDrawTime,
    setDisplayMemory,
    setMipLevel,
    setTilesMap,
    worker
  } = useStore();

  useEffect(() => {
    setTilesMap(quadtreeRef.current.leafTilesMap);
  }, [setTilesMap]);

  // Decoupled camera refs for 60 FPS smooth physics
  const scaleRef = useRef<number>(20);
  const offsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const targetScaleRef = useRef<number>(20);
  const targetOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const [isAutoZoom, setIsAutoZoom] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [lastMouse, setLastMouse] = useState({ x: 0, y: 0 });
  const [hoveredPiece, setHoveredPiece] = useState<{ n: number; x: number; y: number; playerId: number } | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const lastProcessedN = useRef(-1);
  const drawRef = useRef<(() => void) | null>(null);
  const renderPendingRef = useRef<boolean>(false);

  const paletteRef = useRef<Map<number, [number, number, number]>>(new Map());
  useEffect(() => {
    const newPalette = new Map<number, [number, number, number]>();
    players.forEach(p => {
      const hex = p.color;
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      newPalette.set(p.id, [r, g, b]);
    });
    paletteRef.current = newPalette;
    quadtreeRef.current.updatePalette(newPalette);
  }, [players]);

  // Batch ingestion
  useEffect(() => {
    if (!lastBatchResults) return;

    const count = lastBatchResults.length / 5;
    const quadtree = quadtreeRef.current;

    for (let i = 0; i < count; i++) {
      const n = lastBatchResults[i * 5];
      const x = lastBatchResults[i * 5 + 1];
      const y = lastBatchResults[i * 5 + 2];
      const playerId = lastBatchResults[i * 5 + 3];

      if (playerId === 0) continue;
      spiralPieces.set(n, playerId);

      quadtree.insertPiece(x, y, playerId);
    }

    if (worker && lastBatchResults && lastBatchResults.byteLength > 0) {
      const bufferToTransfer = lastBatchResults.buffer;
      worker.postMessage({ type: 'ACK', payload: { buffer: bufferToTransfer } }, [bufferToTransfer]);
    }

    lastProcessedN.current = maxNProcessed;

    // Update auto-zoom target scale on batch arrival
    if (isAutoZoom && canvasRef.current) {
      const canvas = canvasRef.current;
      const width = canvas.offsetWidth;
      const height = canvas.offsetHeight;
      if (width > 0 && height > 0) {
        const padding = 0.90;
        const maxAbsX = Math.max(Math.abs(bounds.minX), Math.abs(bounds.maxX));
        const maxAbsY = Math.max(Math.abs(bounds.minY), Math.abs(bounds.maxY));
        const boardW = maxAbsX * 2 + 2;
        const boardH = maxAbsY * 2 + 2;

        const scaleX = (width * padding) / boardW;
        const scaleY = (height * padding) / boardH;
        const newScale = Math.max(0.01, Math.min(50, Math.min(scaleX, scaleY)));
        if (newScale > 0 && isFinite(newScale)) {
          targetScaleRef.current = newScale;
          targetOffsetRef.current = { x: 0, y: 0 };
        }
      }
    }

    if (!renderPendingRef.current) {
      renderPendingRef.current = true;
      requestAnimationFrame(() => {
        renderPendingRef.current = false;
        if (drawRef.current) drawRef.current();
      });
    }
  }, [historyCount, lastBatchResults, worker]);

  // Reset tiles on restart
  useEffect(() => {
    if (historyCount === 0) {
      quadtreeRef.current.reset();
      setTilesMap(quadtreeRef.current.leafTilesMap);
      setDisplayMemory(0);
      lastProcessedN.current = -1;
      scaleRef.current = 20;
      targetScaleRef.current = 20;
      offsetRef.current = { x: 0, y: 0 };
      targetOffsetRef.current = { x: 0, y: 0 };
      if (drawRef.current) drawRef.current();
    }
  }, [historyCount, setTilesMap]);

  // Decoupled 60 FPS Animation & Easing Loop
  useEffect(() => {
    let animationFrameId: number;

    const renderLoop = () => {
      let needsDraw = false;

      // Smooth auto-zoom spring physics decoupled from simulation speed!
      if (isAutoZoom) {
        const currentScale = scaleRef.current;
        const targetScale = targetScaleRef.current;
        const currentOffset = offsetRef.current;
        const targetOffset = targetOffsetRef.current;

        const dScale = targetScale - currentScale;
        const dx = targetOffset.x - currentOffset.x;
        const dy = targetOffset.y - currentOffset.y;

        if (Math.abs(dScale) > 0.0001 || Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05) {
          scaleRef.current += dScale * 0.05;
          offsetRef.current = {
            x: currentOffset.x + dx * 0.05,
            y: currentOffset.y + dy * 0.05
          };
          needsDraw = true;
        }
      }

      if (needsDraw) {
        if (drawRef.current) drawRef.current();
      }

      animationFrameId = requestAnimationFrame(renderLoop);
    };

    animationFrameId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isAutoZoom]);

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
    const scratchImageData = scratchImageDataRef.current!;

    ctx.fillStyle = voidColor;
    ctx.fillRect(0, 0, width, height);

    const currentScale = scaleRef.current * pixelRatio;
    const currentOffset = offsetRef.current;
    const centerX = width / 2 + currentOffset.x * pixelRatio - 0.5 * currentScale;
    const centerY = height / 2 + currentOffset.y * pixelRatio - 0.5 * currentScale;

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

    // Align UI MIP Telemetry directly with Quadtree rendering fallback paths!
    let mipLevel = 0;
    if (currentScale < 0.0625) {
      mipLevel = 2; // Hardware-free 32x32 Overview
    } else if (currentScale < 0.25) {
      mipLevel = 1; // Hardware-free 128x128 Overview
    } else {
      mipLevel = 0; // Hardware GPU 512x512 Canvas
    }
    setMipLevel(mipLevel);

    // Update display memory telemetry
    const metrics = quadtreeRef.current.getMemoryMetrics();
    setDisplayMemory(metrics);

    // Render quadtree
    quadtreeRef.current.render(
      ctx,
      centerX,
      centerY,
      currentScale,
      width,
      height,
      paletteRef.current,
      scratchImageData,
      bounds
    );

    const worldLeft = -centerX / currentScale;
    const worldRight = (width - centerX) / currentScale;
    const worldTop = centerY / currentScale;
    const worldBottom = (centerY - height) / currentScale;

    // High-quality labels
    if (currentScale > 30) {
      ctx.textAlign = 'center';
      const minX = Math.floor(worldLeft);
      const maxX = Math.ceil(worldRight);
      const minY = Math.floor(worldBottom);
      const maxY = Math.ceil(worldTop);

      const contrastMap = new Map<number, string>();
      players.forEach(p => {
        const r = parseInt(p.color.slice(1, 3), 16) || 0;
        const g = parseInt(p.color.slice(3, 5), 16) || 0;
        const b = parseInt(p.color.slice(5, 7), 16) || 0;
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        contrastMap.set(p.id, lum > 0.5 ? 'rgba(0, 0, 0, 0.85)' : 'rgba(255, 255, 255, 0.95)');
      });

      for (let gx = minX; gx <= maxX; gx++) {
        for (let gy = minY; gy <= maxY; gy++) {
          const n = coordToNumber(gx, gy);
          if (n < MAX_N) {
            const playerId = spiralPieces.get(n);
            if (playerId !== 0) {
              const px = centerX + (gx + 0.5) * currentScale;
              const py = centerY - (gy - 0.5) * currentScale;
              const str = n.toLocaleString();
              const charFactor = str.length > 3 ? (str.length * 0.55) : 2;
              const fontSize = Math.max(8, Math.min(currentScale / 3.5, (currentScale * 0.85) / charFactor));
              ctx.font = `600 ${fontSize}px Inter, sans-serif`;
              ctx.fillStyle = contrastMap.get(playerId) || 'rgba(255, 255, 255, 0.95)';
              ctx.fillText(str, px, py + fontSize / 3);
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

  drawRef.current = draw;

  const onMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setIsAutoZoom(false);
    setLastMouse({ x: e.clientX, y: e.clientY });
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      const dx = e.clientX - lastMouse.x;
      const dy = e.clientY - lastMouse.y;
      const newOffset = {
        x: offsetRef.current.x + dx,
        y: offsetRef.current.y + dy
      };
      offsetRef.current = newOffset;
      targetOffsetRef.current = newOffset;
      setLastMouse({ x: e.clientX, y: e.clientY });
      if (drawRef.current) drawRef.current();
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (window.devicePixelRatio || 1);
    const my = (e.clientY - rect.top) * (window.devicePixelRatio || 1);

    const pixelRatio = window.devicePixelRatio || 1;
    const width = canvas.width;
    const height = canvas.height;
    const currentScale = scaleRef.current * pixelRatio;
    const currentOffset = offsetRef.current;
    const centerX = width / 2 + currentOffset.x * pixelRatio - 0.5 * currentScale;
    const centerY = height / 2 + currentOffset.y * pixelRatio - 0.5 * currentScale;

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
    const delta = -e.deltaY;
    const factor = Math.pow(1.1, delta / 100);
    const currentScale = scaleRef.current;
    const newScale = Math.max(0.01, Math.min(50, currentScale * factor));
    
    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      
      const width = canvas.offsetWidth;
      const height = canvas.offsetHeight;
      const currentOffset = offsetRef.current;

      const centerX = width / 2 + currentOffset.x - 0.5 * currentScale;
      const centerY = height / 2 + currentOffset.y - 0.5 * currentScale;

      const worldX = (mx - centerX) / currentScale;
      const worldY = (my - centerY) / currentScale;

      const newCenterX = mx - worldX * newScale;
      const newCenterY = my - worldY * newScale;

      const newOffsetX = newCenterX - (width / 2 - 0.5 * newScale);
      const newOffsetY = newCenterY - (height / 2 - 0.5 * newScale);

      const newOffset = { x: newOffsetX, y: newOffsetY };
      scaleRef.current = newScale;
      targetScaleRef.current = newScale;
      offsetRef.current = newOffset;
      targetOffsetRef.current = newOffset;
      if (drawRef.current) drawRef.current();
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
            {(() => {
              const player = players.find(p => p.id === hoveredPiece.playerId);
              if (!player) return `Piece #${hoveredPiece.n.toLocaleString()}`;
              const { a, b } = player.pieceType;
              const absA = Math.max(Math.abs(a), Math.abs(b));
              const absB = Math.min(Math.abs(a), Math.abs(b));
              let pieceName = `Leaper (${absA},${absB})`;
              for (const key in PIECE_LIBRARY) {
                const def = PIECE_LIBRARY[key];
                const defA = Math.max(Math.abs(def.leap.a), Math.abs(def.leap.b));
                const defB = Math.min(Math.abs(def.leap.a), Math.abs(def.leap.b));
                if (defA === absA && defB === absB) {
                  pieceName = def.name;
                  break;
                }
              }
              return `${pieceName} #${hoveredPiece.n.toLocaleString()}`;
            })()}
          </div>
          <div>Coord: ({hoveredPiece.x}, {hoveredPiece.y})</div>
          <div>Spiral Index: #{hoveredPiece.n.toLocaleString()}</div>
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
          onClick={() => {
            setIsAutoZoom(false);
            scaleRef.current = 20;
            targetScaleRef.current = 20;
            offsetRef.current = { x: 0, y: 0 };
            if (drawRef.current) drawRef.current();
          }}
          style={{ padding: '0.5rem 1rem', fontSize: '0.75rem' }}
        >
          Reset View
        </button>
      </div>
    </div>
  );
};
