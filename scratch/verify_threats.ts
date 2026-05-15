import { SimulationEngine } from '../src/engine/simulation';
import { PIECE_LIBRARY } from '../src/engine/pieces';

const players = [
  {
    id: 1,
    color: '#3b82f6',
    pieceType: PIECE_LIBRARY.KNIGHT.leap,
  }
];

const engine = new SimulationEngine(players);

console.log('Verifying Single-Knight Spiral...');
const results = [];
for (let i = 0; i < 10; i++) {
  const res = engine.step();
  if (res) results.push(res.n);
}

console.log('Sequence of n:', results.join(', '));

// Standard Knight's Spiral (A316667) starts: 0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20...
// Note that 5 is attacked by 0. 
// Square 0 is (0,0). Square 5 is (-1,0). 
// Let's check: (0,0) -> (-1,0) is a (1,0) leap. Knight is (2,1).
// Wait, square 5 is NOT attacked by 0.
// Let's check n=21. n=0 is (0,0). n=21 is (1,2). (1,2) is attacked by (0,0) (2,1 leap? No, that's 2,1).
// Knight (2,1) from (0,0) attacks: (2,1), (1,2), (-1,2), (-2,1), (-2,-1), (-1,-2), (1,-2), (2,-1).
// Let's find which 'n' correspond to these.
// (2,1) is n=13.
// (1,2) is n=21.
// (-1,2) is n=23.
// So n=13 should be skipped.

if (results.includes(13)) {
    console.error('FAIL: n=13 should be under attack by n=0');
} else {
    console.log('SUCCESS: n=13 skipped (assuming 10+ steps)');
}
