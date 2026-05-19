/**
 * Definitions for Fairy Chess pieces and their movement patterns.
 */

export interface PieceDefinition {
  name: string;
  leap: { a: number; b: number }; // (a, b) vector
}

export const PIECE_LIBRARY: Record<string, PieceDefinition> = {
  VAZIR: { name: 'Vazir', leap: { a: 1, b: 0 } },
  FERS: { name: 'Fers', leap: { a: 1, b: 1 } },
  SATRAP: { name: 'Satrap', leap: { a: 2, b: 0 } },
  KNIGHT: { name: 'Knight', leap: { a: 2, b: 1 } },
  ASPBAD: { name: 'Aspbad', leap: { a: 2, b: 2 } },
  SPEHBED: { name: 'Spehbed', leap: { a: 3, b: 0 } },
  CAMEL: { name: 'Camel', leap: { a: 3, b: 1 } },
  ZEBRA: { name: 'Zebra', leap: { a: 3, b: 2 } },
  MARZBAN: { name: 'Marzban', leap: { a: 3, b: 3 } },
  GIRAFFE: { name: 'Giraffe', leap: { a: 4, b: 1 } },
  STAG: { name: 'Stag', leap: { a: 4, b: 2 } },
  ANTELOPE: { name: 'Antelope', leap: { a: 4, b: 3 } },
  RHINOCEROS: { name: 'Rhinoceros', leap: { a: 4, b: 4 } },
  ZEMEL: { name: 'Zemel', leap: { a: 5, b: 1 } },
  SATYR: { name: 'Satyr', leap: { a: 5, b: 2 } },
  ELAND: { name: 'Eland', leap: { a: 5, b: 3 } },
  OKAPI: { name: 'Okapi', leap: { a: 5, b: 4 } },
  FLAMINGO: { name: 'Flamingo', leap: { a: 5, b: 5 } },
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
