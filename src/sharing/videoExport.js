/**
 * Real Replay Video Exporter (`src/sharing/videoExport.js`)
 *
 * Renders a saved or active game from its recorded move list onto a dedicated
 * HTML5 `<canvas>` and encodes a genuine playable video file (`.webm` or `.mp4`
 * depending on browser `MediaRecorder` codec support).
 *
 * Features:
 * - Codec detection (`video/webm;codecs=vp9`, `video/webm;codecs=vp8`, `video/webm`, `video/mp4`)
 * - Smooth piece movement interpolation per ply (including L-shaped Knight paths!)
 * - Framed 2D board with coordinates, player headers, move counter, evaluation bar, and final result banner
 * - Progress reporting, safe cancellation (`AbortSignal`), and deterministic frame rendering for testing
 */

import { ChessGame, DEFAULT_FEN, FILES, RANKS } from '../game/ChessGame.js';
import { computeMoveAnimationPlan, interpolateMovePoint, squareToBoardPoint } from '../game/moveAnimation.js';
import { evaluatePositionWhite } from '../engine/evaluation.js';

export const VIDEO_THEME_PALETTES = {
  'classic-green': { light: '#eeeed2', dark: '#769656', bg: '#0f172a', border: '#334155', text: '#f8fafc' },
  'tournament-slate': { light: '#dee3e6', dark: '#5b738b', bg: '#0f172a', border: '#334155', text: '#f8fafc' },
  'woodland': { light: '#f0d9b5', dark: '#b58863', bg: '#1c1917', border: '#44403c', text: '#fafaf9' },
  'high-contrast': { light: '#f8fafc', dark: '#334155', bg: '#020617', border: '#94a3b8', text: '#ffffff' }
};

const PIECE_GLYPHS = {
  wp: '♙', wn: '♘', wb: '♗', wr: '♖', wq: '♕', wk: '♔',
  bp: '♟', bn: '♞', bb: '♝', br: '♜', bq: '♛', bk: '♚'
};

export function detectSupportedVideoMimeType() {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
    return { supported: false, mimeType: null, extension: null };
  }
  const candidates = [
    { mimeType: 'video/webm;codecs=vp9', extension: 'webm', label: 'WebM (VP9)' },
    { mimeType: 'video/webm;codecs=vp8', extension: 'webm', label: 'WebM (VP8)' },
    { mimeType: 'video/webm', extension: 'webm', label: 'WebM' },
    { mimeType: 'video/mp4;codecs=avc1', extension: 'mp4', label: 'MP4 (H.264)' },
    { mimeType: 'video/mp4', extension: 'mp4', label: 'MP4' }
  ];
  for (const c of candidates) {
    try {
      if (typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(c.mimeType)) {
        return { supported: true, ...c };
      }
    } catch (_e) {
      // Continue probing
    }
  }
  return { supported: true, mimeType: '', extension: 'webm', label: 'Browser Default Video' };
}

/**
 * Draws a single vector chess piece onto a 2D canvas context at `(cx, cy)` with radius `r`.
 */
export function drawCanvasChessPiece(ctx, type, color, cx, cy, squareSize, scale = 1) {
  ctx.save();
  ctx.translate(cx, cy);
  if (scale !== 1) ctx.scale(scale, scale);

  const isWhite = color === 'w';
  const radius = squareSize * 0.38;

  // Crisp tournament medallion + Neo-Staunton silhouette
  ctx.beginPath();
  ctx.arc(0, 2, radius, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
  ctx.fill();

  const grad = ctx.createLinearGradient(-radius, -radius, radius, radius);
  if (isWhite) {
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, '#dfd9cc');
  } else {
    grad.addColorStop(0, '#3e4756');
    grad.addColorStop(1, '#151921');
  }

  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = Math.max(2, squareSize * 0.045);
  ctx.strokeStyle = isWhite ? '#1e293b' : '#cbd5e1';
  ctx.stroke();

  const glyph = PIECE_GLYPHS[color + type] || type.toUpperCase();
  ctx.font = `700 ${Math.round(squareSize * 0.56)}px "Segoe UI Symbol", "Apple Symbols", "Noto Sans Symbols 2", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = isWhite ? '#0f172a' : '#f8fafc';
  ctx.fillText(glyph, 0, squareSize * 0.03);
  ctx.restore();
}

/**
 * Renders a complete framed replay frame onto a 2D canvas context.
 */
export function renderReplayCanvasFrame(ctx, {
  width = 720,
  height = 720,
  boardMatrix,
  boardTheme = 'classic-green',
  boardFlipped = false,
  lastMove = null,
  activeAnim = null, // { plan, progress }
  title = "Wizard's Chess Replay",
  subtitle = '',
  ply = 0,
  totalPlies = 0,
  lastSan = 'Start',
  evalWhiteCp = 0,
  resultText = ''
}) {
  const pal = VIDEO_THEME_PALETTES[boardTheme] || VIDEO_THEME_PALETTES['classic-green'];
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, width, height);

  const headerH = Math.round(height * 0.11);
  const footerH = Math.round(height * 0.10);
  const availH = height - headerH - footerH;
  const boardSize = Math.min(width - Math.round(width * 0.12), availH);
  const sqSize = boardSize / 8;
  const boardX = Math.round((width - boardSize) / 2);
  const boardY = headerH + Math.round((availH - boardSize) / 2);

  // Header Banner
  ctx.fillStyle = '#f8fafc';
  ctx.font = `700 ${Math.round(width * 0.028)}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(title.slice(0, 48), boardX, headerH * 0.42);

  ctx.fillStyle = '#94a3b8';
  ctx.font = `600 ${Math.round(width * 0.021)}px Inter, system-ui, sans-serif`;
  ctx.fillText(subtitle || `Ply ${ply} of ${totalPlies} · Move: ${lastSan}`, boardX, headerH * 0.76);

  // Eval badge on right header
  const evalPawns = (evalWhiteCp >= 0 ? '+' : '') + (evalWhiteCp / 100).toFixed(2);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#38bdf8';
  ctx.font = `700 ${Math.round(width * 0.026)}px ui-monospace, monospace`;
  ctx.fillText(`Eval ${evalPawns}`, boardX + boardSize, headerH * 0.55);

  // Draw 64 squares
  for (let dRow = 0; dRow < 8; dRow++) {
    const r = boardFlipped ? 7 - dRow : dRow;
    for (let dCol = 0; dCol < 8; dCol++) {
      const f = boardFlipped ? 7 - dCol : dCol;
      const sq = FILES[f] + RANKS[r];
      const isLight = (r + f) % 2 === 0;
      const isLast = lastMove && (lastMove.from === sq || lastMove.to === sq);

      const x = boardX + dCol * sqSize;
      const y = boardY + dRow * sqSize;
      ctx.fillStyle = isLast ? (isLight ? '#f5f682' : '#b9ca43') : (isLight ? pal.light : pal.dark);
      ctx.fillRect(x, y, sqSize, sqSize);

      if (dCol === 0) {
        ctx.fillStyle = isLight ? pal.dark : pal.light;
        ctx.font = `700 ${Math.round(sqSize * 0.18)}px Inter, sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(RANKS[r], x + 4, y + 3);
      }
      if (dRow === 7) {
        ctx.fillStyle = isLight ? pal.dark : pal.light;
        ctx.font = `700 ${Math.round(sqSize * 0.18)}px Inter, sans-serif`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(FILES[f], x + sqSize - 4, y + sqSize - 3);
      }
    }
  }

  // Draw active move trail if animating
  if (activeAnim && activeAnim.plan) {
    const { plan } = activeAnim;
    const toCanvasXY = (pt) => ({
      x: boardX + (pt.svgX / 800) * boardSize,
      y: boardY + (pt.svgY / 800) * boardSize
    });
    ctx.save();
    ctx.strokeStyle = plan.isKnight ? 'rgba(56, 189, 248, 0.78)' : 'rgba(250, 204, 21, 0.72)';
    ctx.lineWidth = Math.max(3, sqSize * 0.09);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const sPt = toCanvasXY(plan.start);
    ctx.moveTo(sPt.x, sPt.y);
    if (plan.isKnight && plan.elbow) {
      const ePt = toCanvasXY(plan.elbow);
      ctx.lineTo(ePt.x, ePt.y);
    }
    const endPt = toCanvasXY(plan.end);
    ctx.lineTo(endPt.x, endPt.y);
    ctx.stroke();
    ctx.restore();
  }

  // Draw stationary pieces
  const movingToSq = activeAnim?.plan?.to || null;
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const cell = boardMatrix[r][f];
      if (!cell) continue;
      if (movingToSq && cell.square === movingToSq) continue;
      const pt = squareToBoardPoint(cell.square, boardFlipped);
      const cx = boardX + (pt.svgX / 800) * boardSize;
      const cy = boardY + (pt.svgY / 800) * boardSize;
      drawCanvasChessPiece(ctx, cell.type, cell.color, cx, cy, sqSize, 1);
    }
  }

  // Draw interpolated moving piece on top
  if (activeAnim && activeAnim.plan) {
    const interp = interpolateMovePoint(activeAnim.plan, activeAnim.progress);
    const cx = boardX + (interp.svgX / 800) * boardSize;
    const cy = boardY + (interp.svgY / 800) * boardSize;
    const pieceType = activeAnim.plan.effectType === 'promote' ? 'q' : activeAnim.plan.piece;
    drawCanvasChessPiece(ctx, pieceType, activeAnim.plan.color, cx, cy, sqSize, interp.scale);
  }

  // Board border
  ctx.strokeStyle = pal.border;
  ctx.lineWidth = 3;
  ctx.strokeRect(boardX, boardY, boardSize, boardSize);

  // Footer status / Result bar
  const footerY = height - footerH * 0.5;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#e2e8f0';
  ctx.font = `700 ${Math.round(width * 0.024)}px Inter, system-ui, sans-serif`;
  ctx.fillText(
    resultText ? `${resultText} · Wizard's Chess V3` : `Move ${Math.ceil(ply / 2)} (${lastSan}) · Wizard's Chess V3`,
    width / 2,
    footerY
  );
}

/**
 * Exports a recorded game as a real downloadable video blob (`.webm` / `.mp4`) using
 * an offscreen/dedicated HTML5 Canvas and `MediaRecorder`.
 */
export async function exportGameReplayVideo({
  startFen = DEFAULT_FEN,
  moves = [], // array of SAN strings or verbose moves
  title = "Wizard's Chess Match",
  result = '',
  boardTheme = 'classic-green',
  boardFlipped = false,
  resolution = 720,
  msPerMove = 550,
  fps = 30,
  onProgress = null,
  signal = null
}) {
  const codecInfo = detectSupportedVideoMimeType();
  const game = new ChessGame(startFen);
  const framesMeta = [
    {
      boardMatrix: game.board(),
      lastMove: null,
      moveVerbose: null,
      ply: 0,
      lastSan: 'Start',
      evalWhiteCp: evaluatePositionWhite(game, false)
    }
  ];

  for (let i = 0; i < moves.length; i++) {
    const mv = game.move(moves[i]);
    if (!mv) break;
    framesMeta.push({
      boardMatrix: game.board(),
      lastMove: mv,
      moveVerbose: mv,
      ply: i + 1,
      lastSan: mv.san,
      evalWhiteCp: evaluatePositionWhite(game, false)
    });
  }

  const totalPlies = framesMeta.length - 1;
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (!canvas) {
    return {
      ok: false,
      error: 'HTML5 Canvas is required for video encoding (unavailable in headless Node without DOM).',
      totalPlies,
      framesMeta
    };
  }

  canvas.width = resolution;
  canvas.height = resolution;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { ok: false, error: '2D Canvas context unavailable.', totalPlies };
  }

  if (!codecInfo.supported || typeof canvas.captureStream !== 'function') {
    return {
      ok: false,
      error: 'MediaRecorder / canvas.captureStream is not supported in this browser. Use PGN or Share Link export instead.',
      totalPlies
    };
  }

  const stream = canvas.captureStream(fps);
  const recorderOpts = codecInfo.mimeType ? { mimeType: codecInfo.mimeType, videoBitsPerSecond: 2500000 } : {};
  const recorder = new MediaRecorder(stream, recorderOpts);
  const chunks = [];

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const stopPromise = new Promise((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = (err) => reject(err);
  });

  recorder.start(100);
  const startTime = performance.now();
  let renderedFrames = 0;

  try {
    for (let idx = 0; idx < framesMeta.length; idx++) {
      if (signal?.aborted) {
        recorder.stop();
        return { ok: false, cancelled: true, error: 'Video export cancelled by user.' };
      }

      const item = framesMeta[idx];
      const isFinal = idx === framesMeta.length - 1;
      const plan = item.moveVerbose
        ? computeMoveAnimationPlan(item.moveVerbose, { boardFlipped, durationMs: Math.min(260, msPerMove * 0.6) })
        : null;

      const animSteps = plan ? Math.max(3, Math.round((msPerMove * 0.55) / (1000 / fps))) : 1;
      const holdSteps = isFinal ? Math.max(8, Math.round(900 / (1000 / fps))) : Math.max(2, Math.round((msPerMove * 0.45) / (1000 / fps)));

      // 1. Animate piece transition
      if (plan) {
        for (let s = 0; s < animSteps; s++) {
          if (signal?.aborted) break;
          renderReplayCanvasFrame(ctx, {
            width: resolution,
            height: resolution,
            boardMatrix: item.boardMatrix,
            boardTheme,
            boardFlipped,
            lastMove: item.lastMove,
            activeAnim: { plan, progress: (s + 1) / animSteps },
            title,
            ply: item.ply,
            totalPlies,
            lastSan: item.lastSan,
            evalWhiteCp: item.evalWhiteCp,
            resultText: isFinal ? result : ''
          });
          renderedFrames++;
          await new Promise(r => setTimeout(r, Math.round(1000 / fps)));
        }
      }

      // 2. Hold settled board frame
      for (let h = 0; h < holdSteps; h++) {
        if (signal?.aborted) break;
        renderReplayCanvasFrame(ctx, {
          width: resolution,
          height: resolution,
          boardMatrix: item.boardMatrix,
          boardTheme,
          boardFlipped,
          lastMove: item.lastMove,
          activeAnim: null,
          title,
          ply: item.ply,
          totalPlies,
          lastSan: item.lastSan,
          evalWhiteCp: item.evalWhiteCp,
          resultText: isFinal ? result : ''
        });
        renderedFrames++;
        await new Promise(r => setTimeout(r, Math.round(1000 / fps)));
      }

      if (onProgress) {
        onProgress({
          ply: item.ply,
          totalPlies,
          pct: Math.round(((idx + 1) / framesMeta.length) * 100),
          renderedFrames
        });
      }
    }

    recorder.stop();
    await stopPromise;

    const blob = new Blob(chunks, { type: codecInfo.mimeType || 'video/webm' });
    const url = URL.createObjectURL(blob);
    const safeTitle = String(title || 'WizardChess_Replay')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 72);
    const filename = `${safeTitle || 'WizardChess_Replay'}.${codecInfo.extension || 'webm'}`;

    return {
      ok: blob.size > 0,
      blob,
      url,
      filename,
      mimeType: blob.type,
      extension: codecInfo.extension,
      sizeBytes: blob.size,
      durationMs: Math.round(performance.now() - startTime),
      frameCount: renderedFrames,
      width: resolution,
      height: resolution,
      totalPlies
    };
  } catch (err) {
    try {
      if (recorder.state !== 'inactive') recorder.stop();
    } catch (_e) {}
    return {
      ok: false,
      error: err && err.message ? err.message : 'Video encoding failed.'
    };
  }
}
