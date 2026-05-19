import { PIECE_LIBRARY } from './pieces';
import type { Player } from './simulation';

export type Preset = {
  name: string;
  description: string;
  players: Omit<Player, 'id'>[];
}

export const PRESETS: Preset[] = [
  {
    name: '2 Knights',
    description: 'The classic dual-color competition.',
    players: [
      { color: '#3b82f6', pieceType: PIECE_LIBRARY.KNIGHT.leap },
      { color: '#ef4444', pieceType: PIECE_LIBRARY.KNIGHT.leap },
    ],
  },
  {
    name: '3 Knights',
    description: 'Triple-color interference patterns.',
    players: [
      { color: '#3b82f6', pieceType: PIECE_LIBRARY.KNIGHT.leap },
      { color: '#ef4444', pieceType: PIECE_LIBRARY.KNIGHT.leap },
      { color: '#10b981', pieceType: PIECE_LIBRARY.KNIGHT.leap },
    ],
  },
  {
    name: 'Knight + Antelope',
    description: 'Mixing short leaps with very long leaps.',
    players: [
      { color: '#3b82f6', pieceType: PIECE_LIBRARY.KNIGHT.leap },
      { color: '#f59e0b', pieceType: PIECE_LIBRARY.ANTELOPE.leap },
    ],
  },
  {
    name: 'The Fortress',
    description: 'High-density defensive pattern.',
    players: [
      { color: '#3b82f6', pieceType: PIECE_LIBRARY.KNIGHT.leap },
      { color: '#8b5cf6', pieceType: PIECE_LIBRARY.SATRAP.leap },
      { color: '#ec4899', pieceType: PIECE_LIBRARY.VAZIR.leap },
    ],
  },
  {
    name: 'Zebra Crossing',
    description: 'Interference between Zebra and Knight.',
    players: [
      { color: '#6366f1', pieceType: PIECE_LIBRARY.ZEBRA.leap },
      { color: '#ef4444', pieceType: PIECE_LIBRARY.KNIGHT.leap },
    ],
  },
  {
    name: 'Imperial Guard',
    description: 'The elite heavy cavalry and royal guards.',
    players: [
      { color: '#f59e0b', pieceType: PIECE_LIBRARY.ELAND.leap },
      { color: '#10b981', pieceType: PIECE_LIBRARY.SPEHBED.leap },
      { color: '#6366f1', pieceType: PIECE_LIBRARY.MARZBAN.leap },
    ],
  },
  {
    name: 'Leapers',
    description: 'Try to remove a few leapers.',
    players: [
      { color: '#6a00ff', pieceType: PIECE_LIBRARY.VAZIR.leap },
      { color: '#ff00ff', pieceType: PIECE_LIBRARY.KNIGHT.leap },
      { color: '#ff0040', pieceType: PIECE_LIBRARY.ZEBRA.leap },
      { color: '#ff9500', pieceType: PIECE_LIBRARY.ANTELOPE.leap },
      { color: '#ffff00', pieceType: { a: 5, b: 4 } },
      { color: '#aaff00', pieceType: { a: 6, b: 5 } },
      { color: '#00ff15', pieceType: { a: 7, b: 6 } },
      { color: '#00ffff', pieceType: { a: 8, b: 7 } },
      { color: '#0095ff', pieceType: { a: 9, b: 8 } },
    ],
  },
];
