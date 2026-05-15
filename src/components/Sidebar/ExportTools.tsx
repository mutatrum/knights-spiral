import React from 'react';
import { useStore, maxNProcessed } from '../../store/useStore';
import { spiralPieces } from '../../engine/simulation';
import { numberToCoord } from '../../engine/spiral';
import { Download, FileJson, Image as ImageIcon } from 'lucide-react';

export const ExportTools: React.FC = React.memo(() => {
  const { players, historyCount } = useStore();

  const exportJSON = () => {
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
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spiral-pattern-${historyCount}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportImage = () => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    
    // Create a high-res capture or just the current view
    const link = document.createElement('a');
    link.download = `spiral-pattern-${historyCount}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
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
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '0.75rem' }}
        >
          <ImageIcon size={16} /> Image
        </button>
      </div>
    </div>
  );
});
