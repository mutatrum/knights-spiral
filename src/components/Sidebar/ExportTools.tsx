import React from 'react';
import { useStore, maxNProcessed } from '../../store/useStore';
import { spiralPieces, getTileKey } from '../../engine/simulation';
import { numberToCoord } from '../../engine/spiral';
import { FileJson, Image as ImageIcon } from 'lucide-react';

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) c = 0xEDB88320 ^ (c >>> 1);
    else c = c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(type: string, data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < 4; i++) {
    crc = crcTable[(crc ^ type.charCodeAt(i)) & 0xFF] ^ (crc >>> 8);
  }
  for (let i = 0; i < data.length; i++) {
    crc = crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createPngChunk(type: string, data: Uint8Array): Uint8Array {
  const len = data.length;
  const buf = new Uint8Array(8 + len + 4);
  const dv = new DataView(buf.buffer);
  dv.setUint32(0, len, false);
  for (let i = 0; i < 4; i++) {
    buf[4 + i] = type.charCodeAt(i);
  }
  buf.set(data, 8);
  const crc = crc32(type, data);
  dv.setUint32(8 + len, crc, false);
  return buf;
}

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

      const fileName = `spiral-full-mip0-${historyCount}.png`;

      if ('showSaveFilePicker' in window && 'CompressionStream' in window) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: fileName,
            types: [{
              description: 'PNG Image',
              accept: { 'image/png': ['.png'] },
            }],
          });
          const writable = await handle.createWritable();

          const ihdrData = new Uint8Array(13);
          const ihdrDv = new DataView(ihdrData.buffer);
          ihdrDv.setUint32(0, width, false);
          ihdrDv.setUint32(4, height, false);
          ihdrData[8] = 4; // Bit depth: 4
          ihdrData[9] = 3; // Color type: 3 (Indexed RGB)
          ihdrData[10] = 0; // Compression: Deflate
          ihdrData[11] = 0; // Filter: Adaptive (0 = None)
          ihdrData[12] = 0; // Interlace: None
          const ihdrChunk = createPngChunk('IHDR', ihdrData);

          const bgHex = playfieldColor || '#1e1e1e';
          const bgR = parseInt(bgHex.slice(1, 3), 16) || 30;
          const bgG = parseInt(bgHex.slice(3, 5), 16) || 30;
          const bgB = parseInt(bgHex.slice(5, 7), 16) || 30;

          const playerMap = new Map<number, number>();
          const plteData = new Uint8Array(48); // 16 entries * 3 bytes
          plteData[0] = bgR; plteData[1] = bgG; plteData[2] = bgB;

          let colorIndex = 1;
          players.forEach(p => {
            if (colorIndex < 16) {
              playerMap.set(p.id, colorIndex);
              const hex = p.color;
              const r = parseInt(hex.slice(1, 3), 16) || 255;
              const g = parseInt(hex.slice(3, 5), 16) || 255;
              const b = parseInt(hex.slice(5, 7), 16) || 255;
              const base = colorIndex * 3;
              plteData[base] = r;
              plteData[base+1] = g;
              plteData[base+2] = b;
              colorIndex++;
            }
          });
          const plteChunk = createPngChunk('PLTE', plteData);

          const rowStride = 1 + Math.floor((width + 1) / 2);
          const rowBuffer = new Uint8Array(rowStride);

          const minTx = Math.floor(minX / 512);
          const maxTx = Math.floor(maxX / 512);
          let currentY = 0;

          const scanlineStream = new ReadableStream({
            async pull(controller) {
              if (currentY >= height) {
                controller.close();
                return;
              }
              if (currentY % 1000 === 0) {
                setExportProgress(`${Math.round((currentY / height) * 100)}%`);
                await new Promise(r => setTimeout(r, 0));
              }

              rowBuffer.fill(0); // Index 0 is background, Filter byte 0 is None

              const worldY = maxY - currentY;
              const ty = Math.floor(-worldY / 512);
              const ly = Math.floor(((-worldY % 512) + 512) % 512);

              for (let tx = minTx; tx <= maxTx; tx++) {
                const tileKey = getTileKey(0, tx, ty);
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
                    const rawId = tile[tileOffset + baseLx + k];
                    if (rawId !== 0) {
                      const pIdx = playerMap.get(rawId);
                      if (pIdx !== undefined) {
                        const col = startCol + k;
                        const byteIdx = 1 + (col >> 1);
                        if ((col & 1) === 0) {
                          rowBuffer[byteIdx] = (rowBuffer[byteIdx] & 0x0F) | (pIdx << 4);
                        } else {
                          rowBuffer[byteIdx] = (rowBuffer[byteIdx] & 0xF0) | pIdx;
                        }
                      }
                    }
                  }
                }
              }

              controller.enqueue(new Uint8Array(rowBuffer));
              currentY++;
            }
          });

          const compressedStream = scanlineStream.pipeThrough(new (window as any).CompressionStream('deflate')) as ReadableStream<Uint8Array>;
          const reader = compressedStream.getReader();

          await writable.write(new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]));
          await writable.write(ihdrChunk);
          await writable.write(plteChunk);

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value && value.length > 0) {
              const idatChunk = createPngChunk('IDAT', value);
              await writable.write(idatChunk);
            }
          }

          const iendChunk = createPngChunk('IEND', new Uint8Array(0));
          await writable.write(iendChunk);
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
