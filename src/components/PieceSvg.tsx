'use client';

/**
 * Tournament Neo-Staunton & Cburnett Vector Chess Pieces (`src/components/PieceSvg.tsx`)
 *
 * Uses precision 45x45 tournament vector geometry (Cburnett / Chess.com Neo-Staunton)
 * with crisp outlines, inner seam detailing, and three tournament palettes:
 * - `neo`   : Chess.com Neo-Staunton (Warm Ivory `#f9f8f4` & Charcoal `#2b2927`)
 * - `wood`  : Championship Staunton Wood (`#f5deb3` & `#5c3a21`)
 * - `glass` : Slate & Ice (`#f1f5f9` & `#1e293b`)
 */

import React from 'react';
import type { PieceType, PlayerColor } from '../lib/cathedral';

const PIECE_NAMES: Record<PieceType, string> = {
  p: 'Pawn',
  n: 'Knight',
  b: 'Bishop',
  r: 'Rook',
  q: 'Queen',
  k: 'King'
};

export interface PieceSvgProps {
  type: PieceType;
  color: PlayerColor;
  size?: number | string;
  pieceStyle?: 'neo' | 'wood' | 'glass';
  styleId?: 'neo' | 'wood' | 'glass';
}

export function PieceSvg({ type, color, size = '100%', pieceStyle, styleId }: PieceSvgProps) {
  const activeStyle = styleId || pieceStyle || 'neo';
  const isW = color === 'w';
  const pal =
    activeStyle === 'wood'
      ? {
          fill: isW ? '#f7e6c4' : '#52341e',
          stop1: isW ? '#fff8eb' : '#6e472b',
          stop2: isW ? '#ebd09e' : '#3d2412',
          stroke: isW ? '#29170b' : '#170c05',
          seam: isW ? '#29170b' : '#dcb888'
        }
      : activeStyle === 'glass'
      ? {
          fill: isW ? '#f8fafc' : '#1e293b',
          stop1: isW ? '#ffffff' : '#334155',
          stop2: isW ? '#dbeafe' : '#0f172a',
          stroke: '#090d16',
          seam: isW ? '#1e293b' : '#cbd5e1'
        }
      : {
          fill: isW ? '#f8f7f2' : '#2c2b29',
          stop1: isW ? '#ffffff' : '#3d3b38',
          stop2: isW ? '#e6e3da' : '#1f1e1c',
          stroke: '#141413',
          seam: isW ? '#141413' : '#e6e3da'
        };

  const uid = `${activeStyle}-${color}-${type}`;
  const gradUrl = `url(#pg-${uid})`;
  const label = `${isW ? 'White' : 'Black'} ${PIECE_NAMES[type] || type}`;

  return (
    <svg
      viewBox="0 0 45 45"
      width={size}
      height={size}
      className={`chess-piece-svg piece-${color}-${type}`}
      role="img"
      aria-label={label}
      style={{
        display: 'block',
        userSelect: 'none',
        pointerEvents: 'none',
        filter: 'drop-shadow(0 1.8px 1.8px rgba(0,0,0,0.34))'
      }}
    >
      <defs>
        <linearGradient id={`pg-${uid}`} x1="18%" y1="10%" x2="82%" y2="92%">
          <stop offset="0%" stopColor={pal.stop1} />
          <stop offset="100%" stopColor={pal.stop2} />
        </linearGradient>
      </defs>

      {type === 'p' && (
        <g
          fill={gradUrl}
          stroke={pal.stroke}
          strokeWidth="1.65"
          strokeLinecap="round"
          strokeLinejoin="miter"
        >
          <path d="M 22.5,9 C 19.5,9 17,11.5 17,14.5 C 17,16.8 18.4,18.7 20.4,19.6 C 17.5,20.8 15.5,23.6 15.5,27.5 C 15.5,29.8 16.6,31.8 18.3,33 L 12.5,33 C 11.4,33 10.5,33.9 10.5,35 L 10.5,38 L 34.5,38 L 34.5,35 C 34.5,33.9 33.6,33 32.5,33 L 26.7,33 C 28.4,31.8 29.5,29.8 29.5,27.5 C 29.5,23.6 27.5,20.8 24.6,19.6 C 26.6,18.7 28,16.8 28,14.5 C 28,11.5 25.5,9 22.5,9 z" />
          <path d="M 18,19.8 L 27,19.8" fill="none" stroke={pal.seam} strokeWidth="1.25" />
          <path d="M 13,35.4 L 32,35.4" fill="none" stroke={pal.seam} strokeWidth="1.25" />
        </g>
      )}

      {type === 'r' && (
        <g
          fill={gradUrl}
          stroke={pal.stroke}
          strokeWidth="1.65"
          strokeLinecap="butt"
          strokeLinejoin="round"
        >
          <path d="M 9,39 L 36,39 L 36,36 L 9,36 L 9,39 z" />
          <path d="M 12,36 L 12,32 L 33,32 L 33,36 L 12,36 z" />
          <path d="M 14,29.5 L 14,16.5 L 31,16.5 L 31,29.5 L 14,29.5 z" />
          <path d="M 14,16.5 L 11,14 L 34,14 L 31,16.5 L 14,16.5 z" />
          <path d="M 11,14 L 11,9 L 15,9 L 15,11 L 20,11 L 20,9 L 25,9 L 25,11 L 30,11 L 30,9 L 34,9 L 34,14" />
          <path d="M 12,35.5 L 33,35.5" fill="none" stroke={pal.seam} strokeWidth="1.2" strokeLinecap="round" />
          <path d="M 14,29.5 L 31,29.5" fill="none" stroke={pal.seam} strokeWidth="1.2" strokeLinecap="round" />
          <path d="M 14,16.5 L 31,16.5" fill="none" stroke={pal.seam} strokeWidth="1.2" strokeLinecap="round" />
        </g>
      )}

      {type === 'n' && (
        <g
          fill={gradUrl}
          stroke={pal.stroke}
          strokeWidth="1.65"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M 22,10 C 32.5,11 38.5,18 38,39 L 15,39 C 15,30 25,32.5 23,18" />
          <path d="M 24,18 C 24.38,20.91 18.45,25.37 16,27 C 13,29 13.18,31.34 11,31 C 9.958,30.06 12.41,27.96 11,28 C 10,28 11.19,29.23 10,30 C 9,30 5.997,31 6,26 C 6,24 12,14 12,14 C 12,14 13.89,12.1 14,10.5 C 13.27,9.506 13.5,8.5 13.5,7.5 C 14.5,6.5 16.5,10 16.5,10 L 18.5,10 C 18.5,10 19.28,8.008 21,7 C 22,7 22,10 22,10" />
          <circle cx="9.5" cy="25.5" r="0.85" fill={pal.seam} stroke="none" />
          <ellipse cx="15" cy="15.5" rx="0.9" ry="1.45" transform="rotate(30 15 15.5)" fill={pal.seam} stroke="none" />
          <path d="M 15.5,36.5 L 37,36.5" fill="none" stroke={pal.seam} strokeWidth="1.25" />
        </g>
      )}

      {type === 'b' && (
        <g
          fill={gradUrl}
          stroke={pal.stroke}
          strokeWidth="1.65"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M 9,36 C 12.39,35.03 19.11,36.43 22.5,34 C 25.89,36.43 32.61,35.03 36,36 C 36,36 37.65,36.54 39,38 C 38.32,38.97 37.35,38.99 36,38.5 C 32.61,37.53 25.89,38.96 22.5,37.5 C 19.11,38.96 12.39,37.53 9,38.5 C 7.646,38.99 6.677,38.97 6,38 C 7.354,36.06 9,36 9,36 z" />
          <path d="M 15,32 C 17.5,34.5 27.5,34.5 30,32 C 30.5,30.5 30,30 30,30 C 30,27.5 27.5,26 27.5,26 C 33,24.5 33.5,14.5 22.5,10.5 C 11.5,14.5 12,24.5 17.5,26 C 17.5,26 15,27.5 15,30 C 15,30 14.5,30.5 15,32 z" />
          <circle cx="22.5" cy="8" r="2.3" />
          <path
            d="M 17.5,26 L 27.5,26 M 15,30 L 30,30 M 22.5,15.5 L 22.5,20.5 M 20,18 L 25,18"
            fill="none"
            stroke={pal.seam}
            strokeWidth="1.45"
          />
        </g>
      )}

      {type === 'q' && (
        <g
          fill={gradUrl}
          stroke={pal.stroke}
          strokeWidth="1.65"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M 9,26 C 17.5,24.5 30,24.5 36,26 L 38.5,13.5 L 31,25 L 30.7,10.9 L 25.5,24.5 L 22.5,10 L 19.5,24.5 L 14.3,10.9 L 14,25 L 6.5,13.5 L 9,26 z" />
          <path d="M 9,26 C 9,28 10.5,28 11.5,30 C 12.5,31.5 12.5,31 12,33.5 C 10.5,34.5 11,36 11,36 C 9.5,37.5 11,38.5 11,38.5 C 17.5,39.5 27.5,39.5 34,38.5 C 34,38.5 35.5,37.5 34,36 C 34,36 34.5,34.5 33,33.5 C 32.5,31 32.5,31.5 33.5,30 C 34.5,28 36,28 36,26 C 27.5,24.5 17.5,24.5 9,26 z" />
          <circle cx="6" cy="12" r="1.9" />
          <circle cx="14" cy="9" r="1.9" />
          <circle cx="22.5" cy="8" r="1.9" />
          <circle cx="31" cy="9" r="1.9" />
          <circle cx="39" cy="12" r="1.9" />
          <path
            d="M 11.5,30 C 15,29 30,29 33.5,30 M 12,33.5 C 18,32.5 27,32.5 33,33.5 M 11,36 C 18,35 27,35 34,36"
            fill="none"
            stroke={pal.seam}
            strokeWidth="1.3"
          />
        </g>
      )}

      {type === 'k' && (
        <g
          fill={gradUrl}
          stroke={pal.stroke}
          strokeWidth="1.65"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M 22.5,11.63 L 22.5,6 M 20,8 L 25,8" fill="none" stroke={pal.stroke} strokeWidth="1.85" />
          <path d="M 22.5,25 C 22.5,25 27,17.5 25.5,14.5 C 25.5,14.5 24.5,12 22.5,12 C 20.5,12 19.5,14.5 19.5,14.5 C 18,17.5 22.5,25 22.5,25" />
          <path d="M 11.5,37 C 17,40.5 27,40.5 32.5,37 L 32.5,30 C 32.5,30 41.5,25.5 38.5,19.5 C 34.5,13 25,16 22.5,23.5 L 22.5,27 L 22.5,23.5 C 19,16 9.5,13 6.5,19.5 C 3.5,25.5 11.5,29.5 11.5,29.5 L 11.5,37 z" />
          <path
            d="M 11.5,30 C 17,27 27,27 32.5,30 M 11.5,33.5 C 17,30.5 27,30.5 32.5,33.5 M 11.5,37 C 17,34 27,34 32.5,37"
            fill="none"
            stroke={pal.seam}
            strokeWidth="1.35"
          />
        </g>
      )}
    </svg>
  );
}
