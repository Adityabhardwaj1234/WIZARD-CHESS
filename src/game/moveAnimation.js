/**
 * Mathematical Piece Trajectory & SVG Move Trail Engine (`src/game/moveAnimation.js`)
 *
 * Computes exact rendered square centres, piece trajectories, L-shaped Knight paths,
 * castling rook paths, and temporary fading SVG trail descriptors.
 *
 * Separation of concerns:
 * - Authoritative chess legality always lives in `ChessGame.js`.
 * - This module derives visual trajectories purely from a validated move (`from`, `to`, `piece`, `flags`),
 *   board orientation (`boardFlipped`), and animation preferences (`durationMs`, `reducedMotion`, `style`).
 */

export const ANIMATION_SPEED_PRESETS = {
  instant: { id: 'instant', label: 'Instant (0 ms)', durationMs: 0 },
  fast: { id: 'fast', label: 'Fast (160 ms)', durationMs: 160 },
  standard: { id: 'standard', label: 'Standard (260 ms)', durationMs: 260 },
  smooth: { id: 'smooth', label: 'Smooth (380 ms)', durationMs: 380 }
};

/**
 * Converts an algebraic square ('a1'..'h8') to normalized board coordinates
 * on an 800x800 SVG viewBox (where each square is 100x100 and centres are at 50, 150, ..., 750)
 * as well as percentage offsets (0..100%).
 */
export function squareToBoardPoint(sq, boardFlipped = false) {
  if (!sq || typeof sq !== 'string' || sq.length !== 2) {
    return { col: 0, row: 0, svgX: 50, svgY: 50, pctX: 6.25, pctY: 6.25 };
  }
  const fileIdx = sq.charCodeAt(0) - 97; // 0..7
  const rankIdx = 8 - (sq.charCodeAt(1) - 48); // 0..7 (rank 8 = 0, rank 1 = 7)
  const col = boardFlipped ? 7 - fileIdx : fileIdx;
  const row = boardFlipped ? 7 - rankIdx : rankIdx;
  return {
    fileIdx,
    rankIdx,
    col,
    row,
    svgX: col * 100 + 50,
    svgY: row * 100 + 50,
    pctX: (col + 0.5) * 12.5,
    pctY: (row + 0.5) * 12.5
  };
}

/**
 * Computes the intermediate elbow square/point for a Knight's L-shaped movement:
 * A knight moves 2 squares along its primary axis, then turns 90 degrees for 1 square
 * along its secondary axis.
 */
export function computeKnightLPath(fromSq, toSq, boardFlipped = false) {
  const start = squareToBoardPoint(fromSq, boardFlipped);
  const end = squareToBoardPoint(toSq, boardFlipped);

  const dCol = end.col - start.col;
  const dRow = end.row - start.row;

  // Primary leg moves 2 squares along the axis with magnitude 2
  let elbowCol = start.col;
  let elbowRow = start.row;
  if (Math.abs(dCol) === 2) {
    elbowCol = start.col + dCol;
    elbowRow = start.row;
  } else {
    elbowCol = start.col;
    elbowRow = start.row + dRow;
  }

  const elbow = {
    col: elbowCol,
    row: elbowRow,
    svgX: elbowCol * 100 + 50,
    svgY: elbowRow * 100 + 50,
    pctX: (elbowCol + 0.5) * 12.5,
    pctY: (elbowRow + 0.5) * 12.5
  };

  return {
    isKnightLPath: true,
    start,
    elbow,
    end,
    svgPathD: `M ${start.svgX} ${start.svgY} L ${elbow.svgX} ${elbow.svgY} L ${end.svgX} ${end.svgY}`,
    waypoints: [start, elbow, end]
  };
}

/**
 * Computes a complete animation plan for a legal move, including:
 * - Primary piece trajectory (straight/diagonal for sliding pieces, L-shaped for Knights)
 * - Secondary rook trajectory for castling (`O-O` or `O-O-O`)
 * - SVG trail path (`svgPathD`) and effect type (`move`, `capture`, `castle`, `promote`, `check`, `checkmate`)
 * - Web Animations API keyframes (`keyframes`) relative to the destination square
 */
export function computeMoveAnimationPlan(moveVerbose, options = {}) {
  if (!moveVerbose || !moveVerbose.from || !moveVerbose.to) return null;
  const boardFlipped = Boolean(options.boardFlipped);
  const reducedMotion = Boolean(options.reducedMotion);
  const durationMs = reducedMotion ? 0 : (options.durationMs ?? 260);

  const start = squareToBoardPoint(moveVerbose.from, boardFlipped);
  const end = squareToBoardPoint(moveVerbose.to, boardFlipped);
  const isKnight = moveVerbose.piece === 'n' && !moveVerbose.promotion;

  let svgPathD = `M ${start.svgX} ${start.svgY} L ${end.svgX} ${end.svgY}`;
  let elbow = null;
  let keyframes = [];

  // Offset in square units from destination square (`end`) so we can animate the piece
  // inside its destination square from `(start - end)` to `(0, 0)` without layout thrashing!
  const dxSquares = start.col - end.col;
  const dySquares = start.row - end.row;

  if (isKnight) {
    const lPath = computeKnightLPath(moveVerbose.from, moveVerbose.to, boardFlipped);
    svgPathD = lPath.svgPathD;
    elbow = lPath.elbow;
    const elbowDxSq = elbow.col - end.col;
    const elbowDySq = elbow.row - end.row;
    keyframes = [
      { transform: `translate(${dxSquares * 100}%, ${dySquares * 100}%) scale(1)`, offset: 0 },
      { transform: `translate(${elbowDxSq * 100}%, ${elbowDySq * 100}%) scale(1.14)`, offset: 0.62 },
      { transform: 'translate(0%, 0%) scale(1)', offset: 1 }
    ];
  } else {
    keyframes = [
      { transform: `translate(${dxSquares * 100}%, ${dySquares * 100}%) scale(1.04)`, offset: 0 },
      { transform: 'translate(0%, 0%) scale(1)', offset: 1 }
    ];
  }

  // Secondary rook animation for castling
  let castlingRook = null;
  if (moveVerbose.flags === 'k' || moveVerbose.flags === 'q') {
    const rankChar = moveVerbose.color === 'w' ? '1' : '8';
    const rookFrom = (moveVerbose.flags === 'k' ? 'h' : 'a') + rankChar;
    const rookTo = (moveVerbose.flags === 'k' ? 'f' : 'd') + rankChar;
    const rStart = squareToBoardPoint(rookFrom, boardFlipped);
    const rEnd = squareToBoardPoint(rookTo, boardFlipped);
    castlingRook = {
      from: rookFrom,
      to: rookTo,
      start: rStart,
      end: rEnd,
      svgPathD: `M ${rStart.svgX} ${rStart.svgY} L ${rEnd.svgX} ${rEnd.svgY}`,
      keyframes: [
        { transform: `translate(${(rStart.col - rEnd.col) * 100}%, ${(rStart.row - rEnd.row) * 100}%)`, offset: 0 },
        { transform: 'translate(0%, 0%)', offset: 1 }
      ]
    };
  }

  let effectType = 'move';
  if (moveVerbose.san && moveVerbose.san.includes('#')) effectType = 'checkmate';
  else if (moveVerbose.san && moveVerbose.san.includes('+')) effectType = 'check';
  else if (moveVerbose.promotion) effectType = 'promote';
  else if (moveVerbose.captured || moveVerbose.flags === 'e') effectType = 'capture';
  else if (moveVerbose.flags === 'k' || moveVerbose.flags === 'q') effectType = 'castle';

  return {
    id: `${moveVerbose.from}-${moveVerbose.to}-${Date.now()}`,
    from: moveVerbose.from,
    to: moveVerbose.to,
    piece: moveVerbose.piece,
    color: moveVerbose.color,
    san: moveVerbose.san,
    isKnight,
    start,
    elbow,
    end,
    svgPathD,
    keyframes,
    castlingRook,
    effectType,
    durationMs,
    trailDurationMs: reducedMotion ? 0 : Math.max(420, durationMs + 220)
  };
}

/**
 * Interpolates a piece's (svgX, svgY) position at normalized progress `t` in [0, 1].
 * Used by both live canvas effects and the Video Exporter (`videoExport.js`).
 */
export function interpolateMovePoint(plan, t) {
  const clamped = Math.max(0, Math.min(1, t));
  // Ease out cubic
  const eased = 1 - Math.pow(1 - clamped, 3);
  if (plan.isKnight && plan.elbow) {
    if (eased < 0.62) {
      const u = eased / 0.62;
      return {
        svgX: plan.start.svgX + (plan.elbow.svgX - plan.start.svgX) * u,
        svgY: plan.start.svgY + (plan.elbow.svgY - plan.start.svgY) * u,
        scale: 1 + 0.14 * Math.sin(u * Math.PI * 0.5)
      };
    }
    const u = (eased - 0.62) / 0.38;
    return {
      svgX: plan.elbow.svgX + (plan.end.svgX - plan.elbow.svgX) * u,
      svgY: plan.elbow.svgY + (plan.end.svgY - plan.elbow.svgY) * u,
      scale: 1 + 0.14 * (1 - u)
    };
  }
  return {
    svgX: plan.start.svgX + (plan.end.svgX - plan.start.svgX) * eased,
    svgY: plan.start.svgY + (plan.end.svgY - plan.start.svgY) * eased,
    scale: 1 + 0.05 * Math.sin(eased * Math.PI)
  };
}
