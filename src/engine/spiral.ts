/**
 * Utilities for converting between Cartesian coordinates (x, y) 
 * and a square spiral index (n).
 * 
 * The spiral starts at (0, 0) for n = 0 and moves:
 * Right -> Up -> Left -> Down -> Right ...
 */

export interface Point {
  x: number;
  y: number;
}

/**
 * Converts a spiral index n to (x, y) coordinates.
 * O(1) complexity using algebraic properties of square spirals.
 */
export function numberToCoord(n: number): Point {
  if (n === 0) return { x: 0, y: 0 };

  // Determine the "layer" k (distance from center)
  // Layer k has (2k+1)^2 total squares (including all previous layers)
  // The side length of layer k is 2k.
  const k = Math.ceil((Math.sqrt(n + 1) - 1) / 2);
  const t = 2 * k; // Side length step
  
  // Max n in the previous layer (k-1)
  const m = Math.pow(2 * k - 1, 2);
  
  // Relative index within the current layer k
  const i = n - m;
  
  // Layer k consists of 4 segments of length t
  // Segment 0: (k, -(k-1)) to (k, k)     [Right side, moving Up]
  // Segment 1: (k-1, k) to (-k, k)       [Top side, moving Left]
  // Segment 2: (-k, k-1) to (-k, -k)     [Left side, moving Down]
  // Segment 3: (-(k-1), -k) to (k, -k)   [Bottom side, moving Right]
  
  if (i < t) return { x: k, y: -k + 1 + i };
  if (i < 2 * t) return { x: k - 1 - (i - t), y: k };
  if (i < 3 * t) return { x: -k, y: k - 1 - (i - 2 * t) };
  return { x: -k + 1 + (i - 3 * t), y: -k };
}

/**
 * Converts (x, y) coordinates to a spiral index n.
 * O(1) complexity.
 */
export function coordToNumber(x: number, y: number): number {
  if (x === 0 && y === 0) return 0;
  
  const k = Math.max(Math.abs(x), Math.abs(y));
  const m = Math.pow(2 * k - 1, 2);
  
  if (x === k && y > -k) return m + (y + k - 1);
  if (y === k) return m + (2 * k - 1) + (k - x);
  if (x === -k) return m + (4 * k - 1) + (k - y);
  return m + (6 * k - 1) + (x + k);
}
