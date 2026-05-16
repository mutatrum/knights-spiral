import React from 'react';
import { useStore, maxNProcessed } from '../../store/useStore';
import { spiralPieces } from '../../engine/simulation';
import { numberToCoord } from '../../engine/spiral';
import { FileJson, Image as ImageIcon } from 'lucide-react';

export const ExportTools: React.FC = React.memo(() => {
  const { players, historyCount, bounds, playfieldColor } = useStore();
  const [isExporting, setIsExporting] = React.useState(false);

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
        if ((err as Error).name === 'AbortError') return; // User cancelled
      }
    }

    // Fallback
    const blob = new Blob([jsonString], { type: 'application/octet-stream' });
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

    try {
      const { minX, maxX, minY, maxY } = bounds || { minX: -256, maxX: 256, minY: -256, maxY: 256 };
      // Calculate full simulation resolution, capped at 32,000 pixels (browser maximum canvas size)
      const width = Math.max(512, Math.min(32000, maxX - minX + 1));
      const height = Math.max(512, Math.min(32000, maxY - minY + 1));

      const offscreen = document.createElement('canvas');
      offscreen.width = width;
      offscreen.height = height;
      const ctx = offscreen.getContext('2d');
      if (!ctx) {
        setIsExporting(false);
        return;
      }

      // Fill background
      ctx.fillStyle = playfieldColor || '#1e1e1e';
      ctx.fillRect(0, 0, width, height);

      const imgData = ctx.createImageData(width, height);
      const data = imgData.data;

      // Pre-calculate palette RGB
      const palette = new Map<number, [number, number, number]>();
      players.forEach(p => {
        const hex = p.color;
        const r = parseInt(hex.slice(1, 3), 16) || 255;
        const g = parseInt(hex.slice(3, 5), 16) || 255;
        const b = parseInt(hex.slice(5, 7), 16) || 255;
        palette.set(p.id, [r, g, b]);
      });

      // Fill background color
      const bgHex = playfieldColor || '#1e1e1e';
      const bgR = parseInt(bgHex.slice(1, 3), 16) || 30;
      const bgG = parseInt(bgHex.slice(3, 5), 16) || 30;
      const bgB = parseInt(bgHex.slice(5, 7), 16) || 30;
      const totalPixels = width * height;
      for (let i = 0; i < totalPixels; i++) {
        const idx = i * 4;
        data[idx] = bgR;
        data[idx+1] = bgG;
        data[idx+2] = bgB;
        data[idx+3] = 255;
      }

      // Plot every single simulated piece at exact 1:1 scale (MIP 0)
      for (let n = 1; n <= maxNProcessed; n++) {
        const pId = spiralPieces.get(n);
        if (pId !== 0) {
          const { x, y } = numberToCoord(n);
          const px = x - minX;
          const py = maxY - y; // Inverted Y for canvas coordinate system
          if (px >= 0 && px < width && py >= 0 && py < height) {
            const idx = (py * width + px) * 4;
            const rgb = palette.get(pId) || [255, 255, 255];
            data[idx] = rgb[0];
            data[idx+1] = rgb[1];
            data[idx+2] = rgb[2];
          }
        }
      }

      ctx.putImageData(imgData, 0, 0);

      const fileName = `spiral-full-mip0-${historyCount}.png`;

      if ('showSaveFilePicker' in window) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: fileName,
            types: [{
              description: 'PNG Image',
              accept: { 'image/png': ['.png'] },
            }],
          });
          offscreen.toBlob(async (blob) => {
            setIsExporting(false);
            if (!blob) return;
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
          }, 'image/png');
          return;
        } catch (err) {
          setIsExporting(false);
          if ((err as Error).name === 'AbortError') return;
        }
      }

      // Fallback
      offscreen.toBlob((blob) => {
        setIsExporting(false);
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', fileName);
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }, 'image/png');
    } catch (err) {
      setIsExporting(false);
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
          <ImageIcon size={16} /> {isExporting ? 'Encoding...' : 'Full Image'}
        </button>
      </div>
    </div>
  );
});
