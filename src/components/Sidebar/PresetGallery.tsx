import React from 'react';
import { useStore } from '../../store/useStore';
import { PRESETS } from '../../engine/presets';
import { LayoutGrid, ChevronDown, ChevronRight } from 'lucide-react';

export const PresetGallery: React.FC = React.memo(() => {
  const { loadPreset } = useStore();
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <div className="control-group">
      <div 
        className="label" 
        onClick={() => setIsOpen(!isOpen)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <LayoutGrid size={16} /> Presets
        </span>
        {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </div>
      {isOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
          {PRESETS.map((preset) => (
            <button
              key={preset.name}
              className="secondary"
              style={{ textAlign: 'left', padding: '0.5rem 0.75rem', fontSize: '0.875rem' }}
              onClick={() => loadPreset(preset)}
            >
              <div style={{ fontWeight: 600 }}>{preset.name}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 400 }}>
                {preset.description}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
