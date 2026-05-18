import React from 'react';
import { useStore } from '../../store/useStore';
import { PIECE_LIBRARY } from '../../engine/pieces';
import { Trash2, Plus, Users, ChevronDown, ChevronRight } from 'lucide-react';

export const PlayerEditor: React.FC = React.memo(() => {
  const { players, addPlayer, removePlayer, updatePlayer } = useStore();
  const [customPlayerIds, setCustomPlayerIds] = React.useState<Set<number>>(new Set());
  const [isOpen, setIsOpen] = React.useState(true);

  const handleAdd = () => {
    addPlayer({
      color: '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0'),
      pieceType: PIECE_LIBRARY.KNIGHT.leap,
    });
  };

  return (
    <div className="control-group">
      <div 
        className="label" 
        onClick={() => setIsOpen(!isOpen)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Users size={16} /> Players
        </span>
        {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </div>
      
      {isOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.75rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {players.map((p) => {
          const pieceKey = Object.keys(PIECE_LIBRARY).find(k => 
            PIECE_LIBRARY[k].leap.a === p.pieceType.a && PIECE_LIBRARY[k].leap.b === p.pieceType.b
          );
          const isKnown = !!pieceKey;
          const isExplicitlyCustom = customPlayerIds.has(p.id);
          const pieceName = (isExplicitlyCustom || !isKnown) ? 'Custom' : PIECE_LIBRARY[pieceKey!].name;
          
          // Count how many players have this exact piece type
          const sameTypePlayers = players.filter(pl => 
            pl.pieceType.a === p.pieceType.a && pl.pieceType.b === p.pieceType.b
          );
          const isDuplicate = sameTypePlayers.length > 1;
          const typeIndex = sameTypePlayers.findIndex(pl => pl.id === p.id) + 1;
          
          const isCustom = isExplicitlyCustom || !isKnown;

          return (
            <div 
              key={p.id} 
              style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '0.5rem', 
                padding: '0.75rem', 
                background: 'rgba(255,255,255,0.03)', 
                border: '1px solid var(--border)',
                borderRadius: '0.5rem' 
              }}
            >
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input 
                  type="color" 
                  value={p.color} 
                  onChange={(e) => updatePlayer(p.id, { color: e.target.value })}
                  style={{ width: '24px', height: '24px', border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}
                />
                <span style={{ 
                  flex: 1, 
                  color: 'white', 
                  fontSize: '0.875rem', 
                  fontWeight: 600,
                }}>
                  {pieceName}{isDuplicate ? ` ${typeIndex}` : ''}
                </span>
                {players.length > 2 && (
                  <button 
                    className="secondary" 
                    onClick={() => removePlayer(p.id)}
                    style={{ padding: '0.25rem', background: 'none', border: 'none', color: '#f87171' }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              
              <select
                value={(isKnown && !customPlayerIds.has(p.id)) ? Object.keys(PIECE_LIBRARY).find(k => 
                  PIECE_LIBRARY[k].leap.a === p.pieceType.a && PIECE_LIBRARY[k].leap.b === p.pieceType.b
                ) : 'CUSTOM'}
                onChange={(e) => {
                  const key = e.target.value;
                  if (key === 'CUSTOM') {
                    setCustomPlayerIds(prev => new Set(prev).add(p.id));
                  } else {
                    setCustomPlayerIds(prev => {
                      const next = new Set(prev);
                      next.delete(p.id);
                      return next;
                    });
                    updatePlayer(p.id, { pieceType: PIECE_LIBRARY[key].leap });
                  }
                }}
                style={{ 
                  background: 'var(--bg-dark)', 
                  border: '1px solid var(--border)', 
                  color: 'white', 
                  fontSize: '0.75rem', 
                  padding: '0.25rem',
                  borderRadius: '0.25rem'
                }}
              >
                {Object.keys(PIECE_LIBRARY).map(key => (
                  <option key={key} value={key}>{PIECE_LIBRARY[key].name} ({PIECE_LIBRARY[key].leap.a}, {PIECE_LIBRARY[key].leap.b})</option>
                ))}
                <option value="CUSTOM">Custom Pattern...</option>
              </select>

              {isCustom && (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.25rem 0.5rem', background: 'rgba(0,0,0,0.2)', borderRadius: '0.25rem' }}>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <span style={{ fontSize: '0.65rem', opacity: 0.5 }}>a:</span>
                    <input 
                      type="number" 
                      value={p.pieceType.a}
                      onChange={(e) => updatePlayer(p.id, { pieceType: { ...p.pieceType, a: parseInt(e.target.value) || 0 } })}
                      style={{ width: '100%', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', color: 'white', fontSize: '0.75rem', padding: '0.15rem 0' }}
                    />
                  </div>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <span style={{ fontSize: '0.65rem', opacity: 0.5 }}>b:</span>
                    <input 
                      type="number" 
                      value={p.pieceType.b}
                      onChange={(e) => updatePlayer(p.id, { pieceType: { ...p.pieceType, b: parseInt(e.target.value) || 0 } })}
                      style={{ width: '100%', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', color: 'white', fontSize: '0.75rem', padding: '0.15rem 0' }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

          <button 
            className="secondary" 
            onClick={handleAdd} 
            disabled={players.length >= 15}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              gap: '0.5rem', 
              fontSize: '0.875rem',
              opacity: players.length >= 15 ? 0.5 : 1,
              cursor: players.length >= 15 ? 'not-allowed' : 'pointer'
            }}
          >
            <Plus size={16} /> {players.length >= 15 ? 'Player Limit Reached' : 'Add Player'}
          </button>
        </div>
      )}
    </div>
  );
});
