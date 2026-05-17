import React from 'react';
import { useStore, maxNProcessed } from '../../store/useStore';
import { spiralPieces } from '../../engine/simulation';
import { numberToCoord } from '../../engine/spiral';
import { FileJson, Image as ImageIcon } from 'lucide-react';

export const ExportTools: React.FC = React.memo(() => {
  const { players, historyCount, bounds, playfieldColor, tilesMap } = useStore();
  const [isExporting, setIsExporting] = React.useState(false);
  const [exportProgress, setExportProgress] = React.useState<string | null>(null);

  const exportJSON = async () => {
    const pieces = [];
    for (let i = 0; i <= maxNProcessed; i++) {
      const pId = spiralPieces.get(i);
      if (pId !== 0) {
        const { x, y } = numberToCoord(i);
        pieces.push({ n: i, x, y, playerId: pId });
      }
    }

    const data = {
      players,
      historyCount,
      pieces,
      exportedAt: new Date().toISOString(),
    };
    const jsonString = JSON.stringify(data, null, 2);
    const fileName = `spiral-pattern-${historyCount}.json`;

    if ('showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: fileName,
          types: [{
            description: 'JSON File',
            accept: { 'application/json': ['.json'] },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(jsonString);
        await writable.close();
        return;
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
      }
    }

    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('href', url);
    a.setAttribute('download', fileName);
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const exportImage = async () => {
    if (isExporting || maxNProcessed === 0) return;
    setIsExporting(true);
    setExportProgress(null);

    try {
      const { minX, maxX, minY, maxY } = bounds || { minX: -256, maxX: 256, minY: -256, maxY: 256 };
      const width = Math.max(512, maxX - minX + 1);
      const height = Math.max(512, maxY - minY + 1);

      const fileName = `spiral-full-mip0-${historyCount}.bmp`;

      if ('showSaveFilePicker' in window) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: fileName,
            types: [{
              description: 'Bitmap Image',
              accept: { 'image/bmp': ['.bmp'] },
            }],
          });
          const writable = await handle.createWritable();

          // BMP 24-bit uncompressed header
          const rowStride = (width * 3 + 3) & (~3);
          const pixelDataSize = rowStride * height;
          const fileSize = 54 + pixelDataSize;

          const header = new Uint8Array(54);
          const dv = new DataView(header.buffer);
          header[0] = 0x42; header[1] = 0x4D; // 'BM'
          dv.setUint32(2, fileSize, true);
          dv.setUint32(10, 54, true);
          dv.setUint32(14, 40, true);
          dv.setInt32(18, width, true);
          dv.setInt32(22, -height, true); // Top-down raster
          dv.setUint16(26, 1, true);
          dv.setUint16(28, 24, true); // 24 bpp BGR
          dv.setUint32(34, pixelDataSize, true);

          await writable.write(header);

          // Pre-calculate palette RGB (stored as B, G, R for BMP)
          const palette = new Map<number, [number, number, number]>();
          players.forEach(p => {
            const hex = p.color;
            const r = parseInt(hex.slice(1, 3), 16) || 255;
            const g = parseInt(hex.slice(3, 5), 16) || 255;
            const b = parseInt(hex.slice(5, 7), 16) || 255;
            palette.set(p.id, [b, g, r]);
          });

          const bgHex = playfieldColor || '#1e1e1e';
          const bgR = parseInt(bgHex.slice(1, 3), 16) || 30;
          const bgG = parseInt(bgHex.slice(3, 5), 16) || 30;
          const bgB = parseInt(bgHex.slice(5, 7), 16) || 30;

          const rowBuffer = new Uint8Array(rowStride);
          const minTx = Math.floor(minX / 512);
          const maxTx = Math.floor(maxX / 512);

          // Stream row by row directly from in-memory MIP 0 tiles
          for (let y = 0; y < height; y++) {
            if (y % 1000 === 0) {
              setExportProgress(`${Math.round((y / height) * 100)}%`);
            }

            // Fill background for row
            for (let x = 0; x < width; x++) {
              const idx = x * 3;
              rowBuffer[idx] = bgB;
              rowBuffer[idx+1] = bgG;
              rowBuffer[idx+2] = bgR;
            }

            const worldY = maxY - y;
            const ty = Math.floor(-worldY / 512);
            const ly = Math.floor(((-worldY % 512) + 512) % 512);

            for (let tx = minTx; tx <= maxTx; tx++) {
              const tileKey = `0:${tx}:${ty}`;
              const tile = tilesMap ? tilesMap.get(tileKey) : null;
              if (tile) {
                const tileStartX = tx * 512;
                const startX = Math.max(minX, tileStartX);
                const endX = Math.min(maxX, tileStartX + 511);
                const startCol = startX - minX;
                const count = endX - startX + 1;
                const baseLx = startX - tileStartX;
                const tileOffset = ly * 512;

                for (let k = 0; k < count; k++) {
                  const pId = tile[tileOffset + baseLx + k];
                  if (pId !== 0) {
                    const bgr = palette.get(pId);
                    if (bgr) {
                      const idx = (startCol + k) * 3;
                      rowBuffer[idx] = bgr[0];
                      rowBuffer[idx+1] = bgr[1];
                      rowBuffer[idx+2] = bgr[2];
                    }
                  }
                }
              }
            }
            await writable.write(rowBuffer);
          }
          await writable.close();
          setIsExporting(false);
          setExportProgress(null);
          return;
        } catch (err) {
          setIsExporting(false);
          setExportProgress(null);
          return;
        }
      }

      // Fallback for browsers without File System Access API (safe 8192x8192 resolution cap to prevent 4GB OOM crashes)
      const offscreen = document.createElement('canvas');
      const fallbackWidth = Math.min(8192, width);
      const fallbackHeight = Math.min(8192, height);
      offscreen.width = fallbackWidth;
      offscreen.height = fallbackHeight;
      const ctx = offscreen.getContext('2d');
      if (!ctx) {
        setIsExporting(false);
        return;
      }

      ctx.fillStyle = playfieldColor || '#1e1e1e';
      ctx.fillRect(0, 0, fallbackWidth, fallbackHeight);

      const imgData = ctx.createImageData(fallbackWidth, fallbackHeight);
      const data = imgData.data;

      const palette = new Map<number, [number, number, number]>();
      players.forEach(p => {
        const hex = p.color;
        const r = parseInt(hex.slice(1, 3), 16) || 255;
        const g = parseInt(hex.slice(3, 5), 16) || 255;
        const b = parseInt(hex.slice(5, 7), 16) || 255;
        palette.set(p.id, [r, g, b]);
      });

      const bgHex = playfieldColor || '#1e1e1e';
      const bgR = parseInt(bgHex.slice(1, 3), 16) || 30;
      const bgG = parseInt(bgHex.slice(3, 5), 16) || 30;
      const bgB = parseInt(bgHex.slice(5, 7), 16) || 30;
      const totalPixels = fallbackWidth * fallbackHeight;
      for (let i = 0; i < totalPixels; i++) {
        const idx = i * 4;
        data[idx] = bgR;
        data[idx+1] = bgG;
        data[idx+2] = bgB;
        data[idx+3] = 255;
      }

      for (let n = 1; n <= maxNProcessed; n++) {
        const pId = spiralPieces.get(n);
        if (pId !== 0) {
          const { x, y } = numberToCoord(n);
          const px = x - minX;
          const py = maxY - y;
          if (px >= 0 && px < fallbackWidth && py >= 0 && py < fallbackHeight) {
            const idx = (py * fallbackWidth + px) * 4;
            const rgb = palette.get(pId) || [255, 255, 255];
            data[idx] = rgb[0];
            data[idx+1] = rgb[1];
            data[idx+2] = rgb[2];
          }
        }
      }

      ctx.putImageData(imgData, 0, 0);
      const fallbackFileName = `spiral-full-mip0-${historyCount}.png`;
      offscreen.toBlob((blob) => {
        setIsExporting(false);
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', fallbackFileName);
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }, 'image/png');
    } catch (err) {
      setIsExporting(false);
      setExportProgress(null);
    }
  };

  return (
    <div className="control-group">
      <span className="label">Export</span>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button 
          className="secondary" 
          onClick={exportJSON}
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '0.75rem' }}
        >
          <FileJson size={16} /> JSON
        </button>
        <button 
          className="secondary" 
          onClick={exportImage}
          disabled={isExporting}
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '0.75rem' }}
        >
          <ImageIcon size={16} /> {isExporting ? (exportProgress ? `Saving ${exportProgress}` : 'Encoding...') : 'Full Image'}
        </button>
      </div>
    </div>
  );
});
