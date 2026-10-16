'use client';

/**
 * Original 2D SVG Chess Piece Artwork (`PieceSvg.tsx`)
 *
 * A single dependency-free, themeable piece renderer shared by the board, the
 * capture trays, the promotion modal, the training lab mini-boards and the
 * drag ghost. Every piece is drawn inside a 45x45 viewBox so stroke weights and
 * proportions stay identical regardless of the rendered pixel size.
 *
 * Colours are derived from the piece colour only, which keeps the artwork legible
 * on all four board themes (Classic Green, Tournament Slate, Woodland, High Contrast)
 * and under the colour-blind mode shape indicators layered on top of it.
 */

import React from 'react';

import type { PieceType, PlayerColor } from '../lib/cathedral';

export interface PieceSvgProps {
  type: PieceType;
  color: PlayerColor;
  /** Rendered edge length in pixels. Omit to fill the parent box (board squares). */
  size?: number;
  /** Overrides the default decorative treatment when you need a labelled piece. */
  ariaLabel?: string;
  className?: string;
}

interface Palette {
  fill: string;
  stroke: string;
  highlight: string;
  shade: string;
}

const PALETTES: Record<PlayerColor, Palette> = {
  w: { fill: '#f8fafc', stroke: '#0f172a', highlight: '#ffffff', shade: '#cbd5e1' },
  b: { fill: '#1e293b', stroke: '#e2e8f0', highlight: '#475569', shade: '#0b1220' }
};

const PIECE_NAMES: Record<PieceType, string> = {
  p: 'Pawn',
  n: 'Knight',
  b: 'Bishop',
  r: 'Rook',
  q: 'Queen',
  k: 'King'
};

/* Shared sub-pieces ------------------------------------------------------- */

/** Wide foot that every piece stands on. */
function Pedestal({ p }: { p: Palette }) {
  return (
    <g>
      <path d="M12.6 33.4h19.8l2.1 3.4H10.5z" fill={p.fill} stroke={p.stroke} strokeWidth={1.4} strokeLinejoin="round" />
      <rect x="8.4" y="36.6" width="28.2" height="3.6" rx="1.4" fill={p.fill} stroke={p.stroke} strokeWidth={1.4} />
    </g>
  );
}

/** Tapered stem connecting a piece head to the pedestal. */
function Stem({ p, top = 27.5 }: { p: Palette; top?: number }) {
  return (
    <path
      d={`M19.4 ${top}h6.2l1.6 5.9H17.8z`}
      fill={p.fill}
      stroke={p.stroke}
      strokeWidth={1.4}
      strokeLinejoin="round"
    />
  );
}

/* Individual pieces ------------------------------------------------------- */

function Pawn({ p }: { p: Palette }) {
  return (
    <g>
      <circle cx="22.5" cy="16.4" r="5.1" fill={p.fill} stroke={p.stroke} strokeWidth={1.5} />
      <path d="M18.6 19.6h7.8l1.3 3.4H17.3z" fill={p.fill} stroke={p.stroke} strokeWidth={1.4} strokeLinejoin="round" />
      <path d="M18.4 23h8.2l1.1 4.5H17.3z" fill={p.fill} stroke={p.stroke} strokeWidth={1.4} strokeLinejoin="round" />
      <Stem p={p} top={27.5} />
      <Pedestal p={p} />
    </g>
  );
}

function Rook({ p }: { p: Palette }) {
  return (
    <g>
      <path d="M12.8 6.5h4.6v3.4h3.1V6.5h4.9v3.4h3.1V6.5h4.6v7.9H12.8z" fill={p.fill} stroke={p.stroke} strokeWidth={1.4} strokeLinejoin="round" />
      <rect x="15.6" y="15.2" width="13.8" height="3" rx="1.2" fill={p.fill} stroke={p.stroke} strokeWidth={1.4} />
      <path d="M17.4 18.6h10.2l1.5 6.3H15.9z" fill={p.fill} stroke={p.stroke} strokeWidth={1.4} strokeLinejoin="round" />
      <path d="M15.6 25h13.8l1.9 2.4H13.7z" fill={p.fill} stroke={p.stroke} strokeWidth={1.4} strokeLinejoin="round" />
      <Stem p={p} top={27.4} />
      <Pedestal p={p} />
    </g>
  );
}

function Knight({ p }: { p: Palette }) {
  return (
    <g>
      <path
        d="M8.4 21.6c1.3-3.9 4.3-7.2 8.2-9l2.3-4.4 3.3 3.5 2.6-4.3 2.2 5c4.9 2 8.1 7 8.9 13.4.3 2.6.3 5.2.2 7.8H16.1c-.6-4.5-1.9-8.9-4-12.7-1.2.5-2.4.8-3.7.9z"
        fill={p.fill}
        stroke={p.stroke}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <circle cx="18" cy="15.2" r="1.3" fill={p.shade} stroke="none" />
      <path d="M17.4 24.8c2.6.9 5.4 1.2 8.4 1" fill="none" stroke={p.shade} strokeWidth={1.2} strokeLinecap="round" />
      <Stem p={p} top={27.5} />
      <Pedestal p={p} />
    </g>
  );
}

function Bishop({ p }: { p: Palette }) {
  return (
    <g>
      <circle cx="22.5" cy="6.2" r="2.2" fill={p.fill} stroke={p.stroke} strokeWidth={1.4} />
      <path
        d="M22.5 8.6c3.9 2.6 6.3 6 6.3 9.3 0 3.6-2.8 6.4-6.3 6.4s-6.3-2.8-6.3-6.4c0-3.3 2.4-6.7 6.3-9.3z"
        fill={p.fill}
        stroke={p.stroke}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <path d="M22.5 11.4l-2.6 4.6h5.2z" fill={p.shade} stroke="none" />
      <rect x="15.4" y="24.8" width="14.2" height="2.5" rx="1.2" fill={p.fill} stroke={p.stroke} strokeWidth={1.4} />
      <Stem p={p} top={27.3} />
      <Pedestal p={p} />
    </g>
  );
}

function Queen({ p }: { p: Palette }) {
  return (
    <g>
      <circle cx="9.4" cy="10.4" r="2.1" fill={p.fill} stroke={p.stroke} strokeWidth={1.4} />
      <circle cx="16" cy="7.4" r="2.1" fill={p.fill} stroke={p.stroke} strokeWidth={1.4} />
      <circle cx="22.5" cy="6.6" r="2.2" fill={p.fill} stroke={p.stroke} strokeWidth={1.4} />
      <circle cx="29" cy="7.4" r="2.1" fill={p.fill} stroke={p.stroke} strokeWidth={1.4} />
      <circle cx="35.6" cy="10.4" r="2.1" fill={p.fill} stroke={p.stroke} strokeWidth={1.4} />
      <path
        d="M8.3 12.2l3.1 11.4h22.2l3.1-11.4-5.5 5.3-3.5-8.2-3.2 9.1-3.2-11.4-3.2 11.4-3.2-9.1-3.5 8.2z"
        fill={p.fill}
        stroke={p.stroke}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <path d="M11.4 25.2h22.2l1.6 2.1H9.8z" fill={p.fill} stroke={p.stroke} strokeWidth={1.4} strokeLinejoin="round" />
      <Stem p={p} top={27.3} />
      <Pedestal p={p} />
    </g>
  );
}

function King({ p }: { p: Palette }) {
  return (
    <g>
      <rect x="21.2" y="3.2" width="2.6" height="6.4" rx="1" fill={p.fill} stroke={p.stroke} strokeWidth={1.4} />
      <rect x="18.6" y="5.6" width="7.8" height="2.4" rx="1.1" fill={p.fill} stroke={p.stroke} strokeWidth={1.4} />
      <path
        d="M22.5 9.8c3.7 2.5 6 5.7 6 8.8 0 3.4-2.7 6-6 6s-6-2.6-6-6c0-3.1 2.3-6.3 6-8.8z"
        fill={p.fill}
        stroke={p.stroke}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <path d="M22.5 12.6l-2.4 4.3h4.8z" fill={p.shade} stroke="none" />
      <rect x="15" y="24.6" width="15" height="2.6" rx="1.2" fill={p.fill} stroke={p.stroke} strokeWidth={1.4} />
      <Stem p={p} top={27.2} />
      <Pedestal p={p} />
    </g>
  );
}

const RENDERERS: Record<PieceType, (props: { p: Palette }) => React.JSX.Element> = {
  p: Pawn,
  n: Knight,
  b: Bishop,
  r: Rook,
  q: Queen,
  k: King
};

export function PieceSvg({ type, color, size, ariaLabel, className }: PieceSvgProps) {
  const palette = PALETTES[color];
  const Renderer = RENDERERS[type];
  const dimension = size ? { width: size, height: size } : { width: '100%', height: '100%' };

  return (
    <svg
      viewBox="0 0 45 45"
      {...dimension}
      className={className}
      role={ariaLabel ? 'img' : undefined}
      aria-hidden={ariaLabel ? undefined : true}
      aria-label={ariaLabel}
      focusable="false"
      style={{ display: 'block', overflow: 'visible' }}
    >
      {ariaLabel ? <title>{`${color === 'w' ? 'White' : 'Black'} ${PIECE_NAMES[type]}`}</title> : null}
      <Renderer p={palette} />
    </svg>
  );
}

export default PieceSvg;