import React, { useRef, useEffect, useState } from 'react';
import { useStore, pieceN, pieceX, pieceY, pieceP, piecesLookup, piecesCount } from '../../store/useStore';
import { PIECE_LIBRARY } from '../../engine/pieces';

const TILE_SIZE = 512;
const MIP_LEVELS = [
  { scale: 1.0 },
  { scale: 0.5 },
  { scale: 0.25 }
];

export const ChessCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tilesRef = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const {
    historyCount,
    players,
    voidColor,
    playfieldColor,
    bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 },
    setDrawTime,
    setMipLevel
  } = useStore();

  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(20);
  const [isAutoZoom, setIsAutoZoom] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [lastMouse, setLastMouse] = useState({ x: 0, y: 0 });
  const [hoveredPiece, setHoveredPiece] = useState<{ n: number; x: number; y: number; playerId: number } | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const lastProcessedIndex = useRef(0);

  const getTile = (mip: number, tx: number, ty: number): HTMLCanvasElement => {
    const key = `${mip}:${tx}:${ty}`;
    let tile = tilesRef.current.get(key);
    if (!tile) {
      tile = document.createElement('canvas');
      tile.width = TILE_SIZE;
      tile.height = TILE_SIZE;
      // Use alpha: true to allow the board background to show through
      const tctx = tile.getContext('2d', { alpha: true, desynchronized: true });
      tilesRef.current.set(key, tile);
    }
    return tile;
  };

  // Incremental update to backing tiles
  useEffect(() => {
    const start = lastProcessedIndex.current;
    const end = piecesCount;
    if (start === end) return;

    for (let i = start; i < end; i++) {
      const x = pieceX[i];
      const y = pieceY[i];
      const playerId = pieceP[i];
      
      const player = players.find(p => p.id === playerId);
      if (!player) continue;

      for (let m = 0; m < MIP_LEVELS.length; m++) {
        const level = MIP_LEVELS[m];
        const px = x * level.scale;
        const py = -y * level.scale;
        const tx = Math.floor(px / TILE_SIZE);
        const ty = Math.floor(py / TILE_SIZE);
        
        const tile = getTile(m, tx, ty);
        const tctx = tile.getContext('2d');
        if (tctx) {
          tctx.fillStyle = player.color;
          const lx = (px % TILE_SIZE + TILE_SIZE) % TILE_SIZE;
          const ly = (py % TILE_SIZE + TILE_SIZE) % TILE_SIZE;
          tctx.fillRect(Math.floor(lx), Math.floor(ly), 1, 1);
        }
      }
    }

    lastProcessedIndex.current = end;
    draw();
  }, [historyCount, players]);

  // Reset tiles on restart
  useEffect(() => {
    if (historyCount === 0) {
      tilesRef.current.forEach(tile => {
        tile.width = 0;
        tile.height = 0;
      });
      tilesRef.current.clear();
      lastProcessedIndex.current = 0;
      draw();
    }
  }, [historyCount]);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const startTime = performance.now();
    const pixelRatio = window.devicePixelRatio || 1;
    const width = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = voidColor;
    ctx.fillRect(0, 0, width, height);

    const centerX = width / 2 + offset.x * pixelRatio;
    const centerY = height / 2 + offset.y * pixelRatio;
    const currentScale = scale * pixelRatio;

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
          
          ctx.drawImage(tile, screenX, screenY, screenW, screenH);
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
          const key = (gx + 32768) << 16 | (gy + 32768);
          const idx = piecesLookup.get(key);
          if (idx !== undefined) {
            const n = pieceN[idx];
            const px = centerX + (gx + 0.5) * currentScale;
            const py = centerY - (gy - 0.5) * currentScale;
            ctx.fillText(n.toLocaleString(), px, py + currentScale / 8);
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

    const targetScale = Math.min(width / boardW, height / boardH) * padding;
    setScale(Math.max(0.000001, targetScale));
    setOffset({ x: 0, y: 0 });
  }, [bounds, isAutoZoom]);

  // Resize handler
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = canvas.offsetWidth * dpr;
        canvas.height = canvas.offsetHeight * dpr;
        draw();
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Interactivity Handlers
  const onMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setIsAutoZoom(false);
    setLastMouse({ x: e.clientX, y: e.clientY });
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const dpr = window.devicePixelRatio || 1;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * dpr;
    const my = (e.clientY - rect.top) * dpr;

    if (isDragging) {
      const dx = (e.clientX - lastMouse.x);
      const dy = (e.clientY - lastMouse.y);
      setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      setLastMouse({ x: e.clientX, y: e.clientY });
    }

    // Hover detection
    const currentScale = scale * dpr;
    const centerX = canvas.width / 2 + offset.x * dpr;
    const centerY = canvas.height / 2 + offset.y * dpr;
    const gx = Math.floor((mx - centerX) / currentScale);
    const gy = Math.floor((centerY - my) / currentScale) + 1;
    
    const key = (gx + 32768) << 16 | (gy + 32768);
    const idx = piecesLookup.get(key);
    if (idx !== undefined) {
      setHoveredPiece({ n: pieceN[idx], x: gx, y: gy, playerId: pieceP[idx] });
      setTooltipPos({ x: e.clientX, y: e.clientY });
    } else {
      setHoveredPiece(null);
    }
  };

  const onMouseUp = () => setIsDragging(false);

  const onWheel = (e: React.WheelEvent) => {
    setIsAutoZoom(false);
    const zoomSpeed = 1.1;
    const factor = e.deltaY > 0 ? 1 / zoomSpeed : zoomSpeed;
    
    const dpr = window.devicePixelRatio || 1;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * dpr;
    const my = (e.clientY - rect.top) * dpr;

    const centerX = canvas.width / 2 + offset.x * dpr;
    const centerY = canvas.height / 2 + offset.y * dpr;
    const currentScale = scale * dpr;

    const worldX = (mx - centerX) / currentScale;
    const worldY = (centerY - my) / currentScale;

    const newScale = Math.min(1000, Math.max(0.000001, scale * factor));
    const newCurrentScale = newScale * dpr;
    const newOffsetX = (mx - canvas.width / 2 - worldX * newCurrentScale) / dpr;
    const newOffsetY = (my - canvas.height / 2 + worldY * newCurrentScale) / dpr;

    setScale(newScale);
    setOffset({ x: newOffsetX, y: newOffsetY });
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: voidColor }}>
      <canvas
        ref={canvasRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onWheel={onWheel}
        style={{ width: '100%', height: '100%', display: 'block', cursor: isDragging ? 'grabbing' : 'crosshair' }}
      />
      {hoveredPiece && (
        <div style={{
          position: 'fixed',
          left: tooltipPos.x + 15,
          top: tooltipPos.y + 15,
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(4px)',
          border: '1px solid rgba(255,255,255,0.1)',
          padding: '0.5rem 0.75rem',
          borderRadius: '0.5rem',
          pointerEvents: 'none',
          zIndex: 1000,
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
        }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Piece #{hoveredPiece.n.toLocaleString()}</div>
          <div style={{ fontSize: '0.9rem', color: 'white', fontWeight: 700, margin: '0.1rem 0' }}>
            {(() => {
                const p = players.find(pl => pl.id === hoveredPiece.playerId);
                if (!p) return 'Unknown';
                const pieceKey = Object.keys(PIECE_LIBRARY).find(k => 
                  PIECE_LIBRARY[k].leap.a === p.pieceType.a && PIECE_LIBRARY[k].leap.b === p.pieceType.b
                );
                return pieceKey ? PIECE_LIBRARY[pieceKey].name : 'Custom Piece';
            })()}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>Coord: ({hoveredPiece.x}, {hoveredPiece.y})</div>
          <div style={{ marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: players.find(p => p.id === hoveredPiece.playerId)?.color }} />
            <span style={{ fontSize: '0.75rem', color: 'white' }}>Player {hoveredPiece.playerId}</span>
          </div>
        </div>
      )}
      <div style={{
        position: 'absolute',
        bottom: '1rem',
        right: '1rem',
        display: 'flex',
        gap: '0.5rem'
      }}>
        <button className={`secondary ${isAutoZoom ? 'active' : ''}`} onClick={() => setIsAutoZoom(!isAutoZoom)} style={{ fontSize: '0.75rem', padding: '0.4rem 0.8rem' }}>
          Auto-Zoom
        </button>
      </div>
    </div>
  );
};
