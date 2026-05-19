import { getTileKey } from './simulation';

export interface QuadNode {
  level: number;       // 0 (root 65536) to 7 (leaf 512)
  tx: number;          // Tile X coordinate at root grid (-64 to +63)
  ty: number;          // Tile Y coordinate at root grid (-64 to +63)
  tileSpan: number;    // Number of Level 7 tiles this node spans (128 >> level)
  
  isHomogeneous: boolean;
  solidPlayerId: number; // 0 for empty/void
  
  nw: QuadNode | null;
  ne: QuadNode | null;
  sw: QuadNode | null;
  se: QuadNode | null;
  
  raster: Uint8Array | null;         // Level 7 512x512 byte array
  mip1Data32: Uint32Array | null;    // Level 7 128x128 overview RGBA packed (65536 bytes)
  mip2Data32: Uint32Array | null;    // Level 7 32x32 overview RGBA packed (4096 bytes)
  cachedCanvas: HTMLCanvasElement | null;
  isDirty: boolean;
  
  // Dirty bounding box for lightning-fast sub-region hydration
  dirtyMinX: number;
  dirtyMinY: number;
  dirtyMaxX: number;
  dirtyMaxY: number;

  // Single-player density optimization for overview rendering
  singlePlayerId: number | null;
  dominantPlayerId: number;
  maxPlayerCount: number;
  playerCounts: Uint32Array | null;
  pieceCount: number;

  // LRU Tracking for VRAM Safety
  lastRenderedFrame: number;
}

export class QuadtreeDisplay {
  private root: QuadNode;
  public leafNodesMap = new Map<number, QuadNode>(); // Fast path for O(1) piece ingestion
  public leafTilesMap = new Map<number, Uint8Array>(); // Export map for ExportTools.tsx
  private mip1Canvas: HTMLCanvasElement | null = null;
  private mip1ImageData: ImageData | null = null;
  private mip2Canvas: HTMLCanvasElement | null = null;
  private mip2ImageData: ImageData | null = null;

  private rLUT = new Uint8Array(16);
  private gLUT = new Uint8Array(16);
  private bLUT = new Uint8Array(16);

  // VRAM Limit Safety
  private activeCanvases = new Set<QuadNode>();
  private readonly MAX_CANVASES = 400; // Limit to 400 MB VRAM to be ultra-safe on all devices
  private currentFrame = 0;

  constructor() {
    this.root = this.createRoot();
  }

  private createRoot(): QuadNode {
    return {
      level: 0,
      tx: -64,
      ty: -64,
      tileSpan: 128,
      isHomogeneous: true,
      solidPlayerId: 0,
      nw: null,
      ne: null,
      sw: null,
      se: null,
      raster: null,
      mip1Data32: null,
      mip2Data32: null,
      cachedCanvas: null,
      isDirty: false,
      dirtyMinX: 512,
      dirtyMinY: 512,
      dirtyMaxX: -1,
      dirtyMaxY: -1,
      singlePlayerId: null,
      dominantPlayerId: 0,
      maxPlayerCount: 0,
      playerCounts: null,
      pieceCount: 0,
      lastRenderedFrame: 0
    };
  }

  public reset() {
    this.leafNodesMap.clear();
    this.leafTilesMap.clear();
    this.activeCanvases.forEach(node => {
      if (node.cachedCanvas) {
        node.cachedCanvas.width = 0;
        node.cachedCanvas.height = 0;
        node.cachedCanvas = null;
      }
    });
    this.activeCanvases.clear();
    this.root = this.createRoot();
    if (this.mip2Canvas) {
      this.mip2Canvas.width = 0;
      this.mip2Canvas.height = 0;
      this.mip2Canvas = null;
      this.mip2ImageData = null;
    }
  }

  public getMemoryMetrics(): number {
    // Each allocated raster leaf is 262,144 bytes
    return this.leafTilesMap.size * 262144;
  }

  public updatePalette(palette: Map<number, [number, number, number]>) {
    for (const [pId, rgb] of palette.entries()) {
      this.rLUT[pId] = rgb[0];
      this.gLUT[pId] = rgb[1];
      this.bLUT[pId] = rgb[2];
    }
  }

  public insertPiece(x: number, y: number, playerId: number) {
    if (playerId === 0) return;

    const tx = x >> 9;
    const ty = (-y) >> 9;
    const key = getTileKey(0, tx, ty);

    let leaf = this.leafNodesMap.get(key);
    if (!leaf) {
      // Ensure coordinates are within root [-64, +63]
      if (tx < -64 || tx > 63 || ty < -64 || ty > 63) return;
      leaf = this.findOrCreateLeaf(this.root, tx, ty);
    }

    if (leaf && leaf.raster) {
      const lx = x & 511;
      const ly = (-y) & 511;
      const idx = (ly << 9) | lx;
      if (leaf.raster[idx] === 0) {
        leaf.raster[idx] = playerId;
        
        const pR = this.rLUT[playerId];
        const pG = this.gLUT[playerId];
        const pB = this.bLUT[playerId];

        // O(1) Mathematically Perfect 128x128 RGBA Blend
        const mip1Idx = ((ly >> 2) << 7) | (lx >> 2);
        const oldData1 = leaf.mip1Data32![mip1Idx];
        const count1 = (oldData1 >>> 24) & 0xFF;
        if (count1 < 255) {
          const oldB1 = (oldData1 >>> 16) & 0xFF;
          const oldG1 = (oldData1 >>> 8) & 0xFF;
          const oldR1 = oldData1 & 0xFF;
          const newR1 = Math.round((oldR1 * count1 + pR) / (count1 + 1));
          const newG1 = Math.round((oldG1 * count1 + pG) / (count1 + 1));
          const newB1 = Math.round((oldB1 * count1 + pB) / (count1 + 1));
          leaf.mip1Data32![mip1Idx] = ((count1 + 1) << 24) | (newB1 << 16) | (newG1 << 8) | newR1;
        }

        // O(1) Mathematically Perfect 32x32 RGBA Blend
        const mip2Idx = ((ly >> 4) << 5) | (lx >> 4);
        const oldData2 = leaf.mip2Data32![mip2Idx];
        const count2 = (oldData2 >>> 24) & 0xFF;
        if (count2 < 255) {
          const oldB2 = (oldData2 >>> 16) & 0xFF;
          const oldG2 = (oldData2 >>> 8) & 0xFF;
          const oldR2 = oldData2 & 0xFF;
          const newR2 = Math.round((oldR2 * count2 + pR) / (count2 + 1));
          const newG2 = Math.round((oldG2 * count2 + pG) / (count2 + 1));
          const newB2 = Math.round((oldB2 * count2 + pB) / (count2 + 1));
          leaf.mip2Data32![mip2Idx] = ((count2 + 1) << 24) | (newB2 << 16) | (newG2 << 8) | newR2;
        }

        leaf.pieceCount++;
        if (leaf.playerCounts) {
          leaf.playerCounts[playerId]++;
          if (leaf.playerCounts[playerId] > leaf.maxPlayerCount) {
            leaf.maxPlayerCount = leaf.playerCounts[playerId];
            leaf.dominantPlayerId = playerId;
          }
        }
        if (leaf.pieceCount === 1) {
          leaf.singlePlayerId = playerId;
        } else if (leaf.singlePlayerId !== null && playerId !== leaf.singlePlayerId) {
          leaf.singlePlayerId = null;
        }

        if (lx < leaf.dirtyMinX) leaf.dirtyMinX = lx;
        if (lx > leaf.dirtyMaxX) leaf.dirtyMaxX = lx;
        if (ly < leaf.dirtyMinY) leaf.dirtyMinY = ly;
        if (ly > leaf.dirtyMaxY) leaf.dirtyMaxY = ly;

        leaf.isDirty = true;
        leaf.isHomogeneous = false;
      }
    }
  }

  private findOrCreateLeaf(node: QuadNode, tx: number, ty: number): QuadNode {
    if (node.level === 7) {
      if (!node.raster) {
        node.raster = new Uint8Array(262144);
        node.mip1Data32 = new Uint32Array(16384);
        node.mip2Data32 = new Uint32Array(1024);
        node.playerCounts = new Uint32Array(16);
        if (node.solidPlayerId !== 0) {
          node.raster.fill(node.solidPlayerId);
          
          const pR = this.rLUT[node.solidPlayerId];
          const pG = this.gLUT[node.solidPlayerId];
          const pB = this.bLUT[node.solidPlayerId];
          
          const mip1Color = (16 << 24) | (pB << 16) | (pG << 8) | pR;
          node.mip1Data32.fill(mip1Color);
          
          const mip2Color = (255 << 24) | (pB << 16) | (pG << 8) | pR;
          node.mip2Data32.fill(mip2Color);
          
          node.playerCounts[node.solidPlayerId] = 262144;
          node.maxPlayerCount = 262144;
          node.dominantPlayerId = node.solidPlayerId;
          node.singlePlayerId = node.solidPlayerId;
          node.pieceCount = 262144;
        }
        const key = getTileKey(0, node.tx, node.ty);
        this.leafNodesMap.set(key, node);
        this.leafTilesMap.set(key, node.raster);
      }
      return node;
    }

    if (node.isHomogeneous) {
      this.subdivide(node);
    }

    const half = node.tileSpan >> 1;
    const midTx = node.tx + half;
    const midTy = node.ty + half;

    if (tx < midTx) {
      if (ty < midTy) return this.findOrCreateLeaf(node.nw!, tx, ty);
      else return this.findOrCreateLeaf(node.sw!, tx, ty);
    } else {
      if (ty < midTy) return this.findOrCreateLeaf(node.ne!, tx, ty);
      else return this.findOrCreateLeaf(node.se!, tx, ty);
    }
  }

  private subdivide(node: QuadNode) {
    const nextLevel = node.level + 1;
    const half = node.tileSpan >> 1;
    const pId = node.solidPlayerId;

    node.nw = this.createQuadNode(nextLevel, node.tx, node.ty, half, pId);
    node.ne = this.createQuadNode(nextLevel, node.tx + half, node.ty, half, pId);
    node.sw = this.createQuadNode(nextLevel, node.tx, node.ty + half, half, pId);
    node.se = this.createQuadNode(nextLevel, node.tx + half, node.ty + half, half, pId);

    node.isHomogeneous = false;
  }

  private createQuadNode(level: number, tx: number, ty: number, tileSpan: number, solidPlayerId: number): QuadNode {
    return {
      level,
      tx,
      ty,
      tileSpan,
      isHomogeneous: true,
      solidPlayerId,
      nw: null,
      ne: null,
      sw: null,
      se: null,
      raster: null,
      mip1Data32: null,
      mip2Data32: null,
      cachedCanvas: null,
      isDirty: false,
      dirtyMinX: 512,
      dirtyMinY: 512,
      dirtyMaxX: -1,
      dirtyMaxY: -1,
      singlePlayerId: null,
      dominantPlayerId: 0,
      maxPlayerCount: 0,
      playerCounts: null,
      pieceCount: 0,
      lastRenderedFrame: 0
    };
  }

  public render(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    currentScale: number,
    width: number,
    height: number,
    palette: Map<number, [number, number, number]>,
    scratchImageData: ImageData,
    bounds: { minX: number; maxX: number; minY: number; maxY: number }
  ) {
    this.currentFrame++;

    if (!this.mip1Canvas) {
      this.mip1Canvas = document.createElement('canvas');
      this.mip1Canvas.width = 128;
      this.mip1Canvas.height = 128;
      this.mip1ImageData = this.mip1Canvas.getContext('2d')!.createImageData(128, 128);
    }
    const mip1Canvas = this.mip1Canvas;
    const mip1Ctx = mip1Canvas.getContext('2d')!;
    const mip1Data32View = new Uint32Array(this.mip1ImageData!.data.buffer);

    if (!this.mip2Canvas) {
      this.mip2Canvas = document.createElement('canvas');
      this.mip2Canvas.width = 32;
      this.mip2Canvas.height = 32;
      this.mip2ImageData = this.mip2Canvas.getContext('2d')!.createImageData(32, 32);
    }
    const mip2Canvas = this.mip2Canvas;
    const mip2Ctx = mip2Canvas.getContext('2d')!;
    const mip2Data32View = new Uint32Array(this.mip2ImageData!.data.buffer);

    // Build ultra-fast direct LUT arrays for O(1) hydration loop lookups
    const rLUT = new Uint8Array(32);
    const gLUT = new Uint8Array(32);
    const bLUT = new Uint8Array(32);
    for (const [id, rgb] of palette) {
      if (id < 32) {
        rLUT[id] = rgb[0];
        gLUT[id] = rgb[1];
        bLUT[id] = rgb[2];
      }
    }

    const drawNode = (node: QuadNode) => {
      // Calculate Cartesian world coordinate span for this quadtree node
      const nodeMinX = node.tx * 512;
      const nodeMaxX = (node.tx + node.tileSpan) * 512 - 1;
      const nodeMinY = -(node.ty + node.tileSpan) * 512 + 1; // Note: ty increases downwards
      const nodeMaxY = -(node.ty * 512);

      // Clamp against active simulation board bounds
      const clampedMinX = Math.max(nodeMinX, bounds.minX);
      const clampedMaxX = Math.min(nodeMaxX, bounds.maxX);
      const clampedMinY = Math.max(nodeMinY, bounds.minY);
      const clampedMaxY = Math.min(nodeMaxY, bounds.maxY);

      // If entirely outside active board, do not draw
      if (clampedMinX > clampedMaxX || clampedMinY > clampedMaxY) return;

      const fillScreenX = Math.round(centerX + clampedMinX * currentScale);
      const fillNextScreenX = Math.round(centerX + (clampedMaxX + 1) * currentScale);
      const fillScreenY = Math.round(centerY - clampedMaxY * currentScale); // Note: +Y is UP in Cartesian space, DOWN in screen space
      const fillNextScreenY = Math.round(centerY - (clampedMinY - 1) * currentScale);

      // Screen culling for clamped rectangle
      if (fillNextScreenX < 0 || fillScreenX > width || fillNextScreenY < 0 || fillScreenY > height) return;

      if (node.isHomogeneous) {
        if (node.solidPlayerId === 0) return; // Empty void/board is transparent
        const rgb = palette.get(node.solidPlayerId) || [255, 255, 255];
        ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
        ctx.fillRect(fillScreenX, fillScreenY, fillNextScreenX - fillScreenX, fillNextScreenY - fillScreenY);
        return;
      }

      if (node.level === 7) {
        node.lastRenderedFrame = this.currentFrame;

        if (!node.raster || node.pieceCount === 0) return;

        const fullScreenX = Math.round(centerX + nodeMinX * currentScale);
        const fullNextScreenX = Math.round(centerX + (nodeMaxX + 1) * currentScale);
        const fullScreenY = Math.round(centerY - nodeMaxY * currentScale);
        const fullNextScreenY = Math.round(centerY - (nodeMinY - 1) * currentScale);

        // Zoomed-out fast path for overview scales
        if (currentScale < 0.25) {
          // Automated VRAM Garbage Collection: If zoomed out past 1:1, release hardware VRAM canvas texture!
          if (node.cachedCanvas) {
            node.cachedCanvas.width = 0;
            node.cachedCanvas.height = 0;
            node.cachedCanvas = null;
            node.isDirty = true; // Ensure full hydration if user ever zooms back in
            this.activeCanvases.delete(node);
          }

          if (node.singlePlayerId !== null) {
            const rgb = palette.get(node.singlePlayerId) || [255, 255, 255];
            const clampedArea = (clampedMaxX - clampedMinX + 1) * (clampedMaxY - clampedMinY + 1);
            const density = Math.min(1, (node.pieceCount / Math.max(1, clampedArea)) * 2.0);
            ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${density.toFixed(2)})`;
            ctx.fillRect(fillScreenX, fillScreenY, fillNextScreenX - fillScreenX, fillNextScreenY - fillScreenY);
            return;
          }

          if (currentScale < 0.0625) {
            // Mixed Tile 32x32 Overview Fast Path (MIP 2)
            if (node.mip2Data32) {
              mip2Data32View.set(node.mip2Data32); // Since the top byte of mip2Data32 is already the clamped alpha (0..255), we can blit the entire array in one call!
              mip2Ctx.putImageData(this.mip2ImageData!, 0, 0);
              ctx.drawImage(mip2Canvas, fullScreenX, fullScreenY, fullNextScreenX - fullScreenX, fullNextScreenY - fullScreenY);
            }
          } else {
            // Mixed Tile 128x128 Overview Fast Path (MIP 1)
            if (node.mip1Data32) {
              const src = node.mip1Data32;
              for (let i = 0; i < 16384; i++) {
                const p = src[i];
                if (p !== 0) {
                  const count = p >>> 24;
                  const alpha = (count << 4) - (count >>> 4); // Scale 0..16 count to 0..255 alpha using O(1) bitwise math
                  mip1Data32View[i] = (p & 0x00FFFFFF) | (alpha << 24);
                } else {
                  mip1Data32View[i] = 0;
                }
              }
              mip1Ctx.putImageData(this.mip1ImageData!, 0, 0);
              ctx.drawImage(mip1Canvas, fullScreenX, fullScreenY, fullNextScreenX - fullScreenX, fullNextScreenY - fullScreenY);
            }
          }
          return;
        }

        if (!node.cachedCanvas || node.isDirty) {
          if (!node.cachedCanvas) {
            // Check VRAM Budget before allocating a new 512x512 Canvas (1MB)
            if (this.activeCanvases.size >= this.MAX_CANVASES) {
              // Find oldest off-screen canvas
              let oldestNode: QuadNode | null = null;
              let oldestFrame = this.currentFrame;
              for (const cNode of this.activeCanvases) {
                if (cNode.lastRenderedFrame < oldestFrame) {
                  oldestFrame = cNode.lastRenderedFrame;
                  oldestNode = cNode;
                }
              }

              // Evict strictly if off-screen (not rendered in this frame).
              // If oldestFrame === this.currentFrame, ALL canvases are ON SCREEN!
              if (oldestNode && oldestFrame < this.currentFrame) {
                // Safely evict off-screen canvas
                oldestNode.cachedCanvas!.width = 0;
                oldestNode.cachedCanvas!.height = 0;
                oldestNode.cachedCanvas = null;
                oldestNode.isDirty = true;
                this.activeCanvases.delete(oldestNode);
              } else {
                // VRAM LIMIT HIT FOR ON-SCREEN TILES! Gracefully degrade this tile.
                if (node.singlePlayerId !== null) {
                  const rgb = palette.get(node.singlePlayerId) || [255, 255, 255];
                  const clampedArea = (clampedMaxX - clampedMinX + 1) * (clampedMaxY - clampedMinY + 1);
                  const density = Math.min(1, (node.pieceCount / Math.max(1, clampedArea)) * 2.0);
                  ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${density.toFixed(2)})`;
                  ctx.fillRect(fillScreenX, fillScreenY, fillNextScreenX - fillScreenX, fillNextScreenY - fillScreenY);
                  return;
                }
                
                // Degrade mixed tile to mip1Data32 (128x128)
                if (node.mip1Data32) {
                  const src = node.mip1Data32;
                  for (let i = 0; i < 16384; i++) {
                    const p = src[i];
                    if (p !== 0) {
                      const count = p >>> 24;
                      const alpha = (count << 4) - (count >>> 4);
                      mip1Data32View[i] = (p & 0x00FFFFFF) | (alpha << 24);
                    } else {
                      mip1Data32View[i] = 0;
                    }
                  }
                  mip1Ctx.putImageData(this.mip1ImageData!, 0, 0);
                  ctx.drawImage(mip1Canvas, fullScreenX, fullScreenY, fullNextScreenX - fullScreenX, fullNextScreenY - fullScreenY);
                }
                return;
              }
            }

            node.cachedCanvas = document.createElement('canvas');
            node.cachedCanvas.width = 512;
            node.cachedCanvas.height = 512;
            this.activeCanvases.add(node);
            
            // Force full hydration since this is a brand new, completely blank canvas!
            node.dirtyMinX = 0;
            node.dirtyMinY = 0;
            node.dirtyMaxX = 511;
            node.dirtyMaxY = 511;
          }

          const cctx = node.cachedCanvas.getContext('2d')!;
          const data = scratchImageData.data;
          const tile = node.raster;
          const minX = node.dirtyMinX;
          const minY = node.dirtyMinY;
          const maxX = node.dirtyMaxX;
          const maxY = node.dirtyMaxY;
          const dirtyW = maxX - minX + 1;
          const dirtyH = maxY - minY + 1;

          if (dirtyW > 0 && dirtyH > 0) {
            for (let ly = minY; ly <= maxY; ly++) {
              const rowOffset = ly << 9;
              for (let lx = minX; lx <= maxX; lx++) {
                const i = rowOffset + lx;
                const pId = tile[i];
                if (pId !== 0) {
                  const idx4 = i << 2;
                  data[idx4] = rLUT[pId];
                  data[idx4 + 1] = gLUT[pId];
                  data[idx4 + 2] = bLUT[pId];
                  data[idx4 + 3] = 255;
                }
              }
            }
            cctx.putImageData(scratchImageData, 0, 0, minX, minY, dirtyW, dirtyH);

            // Instantly clear the dirty sub-box in scratchImageData for pristine zero state on the next tile!
            for (let ly = minY; ly <= maxY; ly++) {
              const rowOffset = ly << 9;
              const startIdx = (rowOffset + minX) << 2;
              const endIdx = (rowOffset + maxX + 1) << 2;
              data.fill(0, startIdx, endIdx);
            }
          }

          node.dirtyMinX = 512;
          node.dirtyMinY = 512;
          node.dirtyMaxX = -1;
          node.dirtyMaxY = -1;
          node.isDirty = false;
        }



        ctx.drawImage(node.cachedCanvas, fullScreenX, fullScreenY, fullNextScreenX - fullScreenX, fullNextScreenY - fullScreenY);
        return;
      }

      // Recurse to children
      if (node.nw) drawNode(node.nw);
      if (node.ne) drawNode(node.ne);
      if (node.sw) drawNode(node.sw);
      if (node.se) drawNode(node.se);
    };

    ctx.imageSmoothingEnabled = currentScale < 1.0;
    if (ctx.imageSmoothingEnabled) {
      ctx.imageSmoothingQuality = 'high'; // Hardware bicubic / multi-tap filter for pristine downscaling
    }
    drawNode(this.root);
  }
}
