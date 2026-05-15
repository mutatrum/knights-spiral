/**
 * Definitions for Fairy Chess pieces and their movement patterns.
 */

export interface PieceDefinition {
  name: string;
  leap: { a: number; b: number }; // (a, b) vector
  description: string;
}

export const PIECE_LIBRARY: Record<string, PieceDefinition> = {
  KNIGHT: {
    name: 'Knight',
    leap: { a: 2, b: 1 },
    description: 'The classic L-jump.',
  },
  FERS: {
    name: 'Fers',
    leap: { a: 1, b: 1 },
    description: 'A one-square diagonal leap.',
  },
  VAZIR: {
    name: 'Vazir',
    leap: { a: 1, b: 0 },
    description: 'A one-square orthogonal leap.',
  },
  CAMEL: {
    name: 'Camel',
    leap: { a: 3, b: 1 },
    description: 'A long L-jump.',
  },
  ZEBRA: {
    name: 'Zebra',
    leap: { a: 3, b: 2 },
    description: 'A longer, sharper L-jump.',
  },
  ANTELOPE: {
    name: 'Antelope',
    leap: { a: 4, b: 3 },
    description: 'A very long leap.',
  },
  ELAND: {
    name: 'Eland',
    leap: { a: 5, b: 3 },
    description: 'A massive 5x3 leap.',
  },
  SATRAP: {
    name: 'Satrap',
    leap: { a: 2, b: 0 },
    description: 'A two-square orthogonal leap.',
  },
  ASPBAD: {
    name: 'Aspbad',
    leap: { a: 2, b: 2 },
    description: 'A two-square diagonal leap.',
  },
  SPEHBED: {
    name: 'Spehbed',
    leap: { a: 3, b: 0 },
    description: 'A three-square orthogonal leap.',
  },
  MARZBAN: {
    name: 'Marzban',
    leap: { a: 3, b: 3 },
    description: 'A three-square diagonal leap.',
  },
};

/**
 * Generates all possible attack deltas for a piece defined by (a, b).
 * For a leap (a, b), the possible moves are:
 * (±a, ±b) and (±b, ±a)
 */
export function getAttackOffsets(a: number, b: number): Array<[number, number]> {
  const offsets = new Set<string>();
  const add = (dx: number, dy: number) => offsets.add(`${dx},${dy}`);

  const signs = [1, -1];
  for (const s1 of signs) {
    for (const s2 of signs) {
      add(s1 * a, s2 * b);
      add(s1 * b, s2 * a);
    }
  }

  return Array.from(offsets).map(s => {
    const [x, y] = s.split(',').map(Number);
    return [x, y];
  });
}
