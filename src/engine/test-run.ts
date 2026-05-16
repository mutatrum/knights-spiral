import { SimulationEngine, type Player } from './simulation';
import { PIECE_LIBRARY } from './pieces';

const players: Player[] = [
  {
    id: 1,
    color: '#ff0000',
    pieceType: PIECE_LIBRARY.KNIGHT.leap,
  },
  {
    id: 2,
    color: '#0000ff',
    pieceType: PIECE_LIBRARY.KNIGHT.leap,
  }
];

const engine = new SimulationEngine(players);

console.log('Starting 2-Knight Simulation Test...');

for (let i = 0; i < 20; i++) {
  const result = engine.step();
  if (result) {
    console.log(`Step ${i + 1}: Player ${result.playerId} placed on n=${result.n} at (${result.x}, ${result.y})`);
  } else {
    console.log('Simulation stalled.');
    break;
  }
}
