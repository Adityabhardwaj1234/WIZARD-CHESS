'use client';

/**
 * Distraction-Free Play View (`PlayView.tsx`)
 *
 * Keeps the live match completely focused on the large 2D Chess.com-style board and
 * the navigable Move History list. All configuration, X-Ray layers, progressive hints,
 * variable node budget calculators, Model Studio, and Training Lab live on their
 * dedicated pages (Home, Analysis, Library, and Settings -> Advanced Settings).
 */

import React, { useMemo } from 'react';

import { CathedralBoard } from './CathedralBoard';
import { useSession, type MoveMeta } from '../context/CathedralSession';
import { DIFFICULTY_OPTIONS } from '../lib/options';

function evalLabel(cp: number | null): string {
  if (cp === null || cp === undefined) return '0.00';
  if (Math.abs(cp) >= 28000) return cp > 0 ? '+M' : '-M';
  const pawns = cp / 100;
  return `${pawns > 0 ? '+' : ''}${pawns.toFixed(2)}`;
}

function evalBarWhitePercent(cp: number | null): number {
  if (cp === null || cp === undefined) return 50;
  if (cp >= 28000) return 98;
  if (cp <= -28000) return 2;
  const clamped = Math.max(-1000, Math.min(1000, cp));
  return Math.round(50 + (clamped / 1000) * 46);
}

export function PlayView() {
  const session = useSession();
  const {
    snapshot,
    moveMeta,
    opening,
    terminal,
    settings,
    activeModel,
    clockLabel,
    engineThinking,
    delayWaiting,
    skipDelayNow,
    engineProgress,
    engineResult,
    bestLineEval,
    stopEngine,
    undoMove,
    redoMove,
    newGame,
    resign,
    goToPly,
    stepFirst,
    stepPrev,
    stepNext,
    stepLast,
    isFullscreenBoard,
    toggleFullscreenBoard,
    playerRating
  } = session;

  const movePairs = useMemo(() => {
    const pairs: {
      number: number;
      whitePly: number;
      blackPly: number;
      white: string;
      black: string;
      meta: [MoveMeta | undefined, MoveMeta | undefined];
    }[] = [];
    for (let i = 0; i < snapshot.sanHistory.length; i += 2) {
      pairs.push({
        number: i / 2 + 1,
        whitePly: i + 1,
        blackPly: i + 2,
        white: snapshot.sanHistory[i],
        black: snapshot.sanHistory[i + 1] ?? '',
        meta: [moveMeta[i], moveMeta[i + 1]]
      });
    }
    return pairs;
  }, [snapshot.sanHistory, moveMeta]);

  const currentEvalCp = engineProgress?.scoreWhiteCp ?? engineResult?.scoreWhiteCp ?? bestLineEval ?? 0;
  const whitePct = evalBarWhitePercent(currentEvalCp);
  const currentPreset = DIFFICULTY_OPTIONS.find(o => o.id === settings.difficulty);

  return (
    <section className="play-view" aria-label="Live Chess Match — Board and Moves">
      <div className="play-layout">
        {/* Left / Primary Stage: Large 2D Board */}
        <div className="play-board-column">
          <div className="panel-section board-panel">
            <div className="board-top-bar">
              <div className="board-title-cluster">
                <span>{opening ? `${opening.eco} · ${opening.name}` : 'Live Match'}</span>
                {snapshot.isViewingHistory && (
                  <span className="badge-history">
                    Ply {snapshot.displayedPly}/{snapshot.moveCount}
                  </span>
                )}
              </div>
              <div className="turn-indicator" aria-live="polite" data-check={snapshot.inCheck || undefined}>
                {terminal
                  ? terminal.label
                  : snapshot.isViewingHistory
                  ? `Replay (${snapshot.displayedPly}/${snapshot.moveCount})`
                  : snapshot.inCheck
                  ? `${snapshot.turn === 'w' ? 'White' : 'Black'} in Check`
                  : `${snapshot.turn === 'w' ? 'White' : 'Black'} to move`}
              </div>
              <div className="board-top-actions">
                <span className="clock-chip" data-active={snapshot.turn === 'w' && !terminal}>
                  W {clockLabel('w')}
                </span>
                <span className="clock-chip" data-active={snapshot.turn === 'b' && !terminal}>
                  B {clockLabel('b')}
                </span>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => toggleFullscreenBoard()}
                  title="Toggle Fullscreen Board Mode (F)"
                >
                  {isFullscreenBoard ? 'Exit Fullscreen' : 'Fullscreen'}
                </button>
              </div>
            </div>

            <div className="board-with-eval-bar">
              <div className="eval-bar-vertical" title={`Evaluation (White): ${evalLabel(currentEvalCp)}`}>
                <div className="eval-bar-black" style={{ height: `${100 - whitePct}%` }} />
                <div className="eval-bar-white" style={{ height: `${whitePct}%` }} />
                <span className="eval-bar-score">{evalLabel(currentEvalCp)}</span>
              </div>
              <div className="board-main-stage">
                <CathedralBoard />
              </div>
            </div>

            <div className="replay-nav-bar" aria-label="Move navigation and match actions">
              <div className="replay-step-group">
                <button type="button" className="icon-btn" onClick={stepFirst} disabled={snapshot.displayedPly === 0}>
                  First
                </button>
                <button type="button" className="icon-btn" onClick={stepPrev} disabled={snapshot.displayedPly === 0}>
                  Prev
                </button>
                <button type="button" className="icon-btn" onClick={stepNext} disabled={!snapshot.isViewingHistory}>
                  Next
                </button>
                <button type="button" className="icon-btn" onClick={stepLast} disabled={!snapshot.isViewingHistory}>
                  Live
                </button>
              </div>

              <div className="match-action-group">
                <button type="button" className="nav-btn primary" onClick={() => newGame()}>
                  New Game
                </button>
                <button type="button" className="icon-btn" onClick={undoMove} disabled={snapshot.moveCount === 0}>
                  Undo
                </button>
                <button type="button" className="icon-btn" onClick={redoMove} disabled={!snapshot.canRedo}>
                  Redo
                </button>
                <button type="button" className="icon-btn danger" onClick={resign} disabled={!session.resignable}>
                  Resign
                </button>
              </div>
            </div>

            {terminal && (
              <div className="terminal-banner" role="status">
                <div>
                  <strong>{terminal.label}</strong>
                  <span className="text-muted" style={{ display: 'block', fontSize: '0.8rem' }}>
                    Local Estimated Rating: {playerRating.rating} (±{playerRating.rd})
                  </span>
                </div>
                <button type="button" className="nav-btn primary" onClick={() => newGame()}>
                  Play Again
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Side Rail: Pure Moves & Concise Status Only */}
        <div className="play-rail">
          <div className="panel-section" style={{ marginBottom: 0 }}>
            <div className="eval-readout" style={{ marginBottom: '0.65rem' }}>
              <div>
                <span className="eval-label" style={{ fontWeight: 700, fontSize: '0.84rem' }}>
                  {currentPreset?.shortLabel ?? settings.difficulty} · {activeModel.name.replace('Cathedral ', '')}
                </span>
                <div className="eval-sub">
                  {engineThinking
                    ? `Searching (Depth ${engineProgress?.depth ?? 1} · ${(engineProgress?.nodes ?? 0).toLocaleString()} nodes)…`
                    : delayWaiting
                    ? `Presenting move (${((settings.opponentDelayMs ?? 1500) / 1000).toFixed(1)}s delay)…`
                    : `Depth ${engineResult?.depth ?? 0} · ${(engineResult?.nodes ?? 0).toLocaleString()} nodes`}
                </div>
              </div>
              <div className="control-row">
                {engineThinking && (
                  <button type="button" className="icon-btn danger" onClick={stopEngine}>
                    Stop
                  </button>
                )}
                {delayWaiting && (
                  <button type="button" className="icon-btn" onClick={skipDelayNow}>
                    Move Now
                  </button>
                )}
                <span className="eval-value">{evalLabel(currentEvalCp)}</span>
              </div>
            </div>

            <div className="section-header">
              <span>Moves</span>
              <span>{snapshot.moveCount} ply</span>
            </div>

            {movePairs.length === 0 ? (
              <p className="text-muted">Click or drag a piece on the board to make your first move.</p>
            ) : (
              <ol className="move-list" style={{ maxHeight: '520px' }}>
                {movePairs.map(pair => {
                  const wActive = snapshot.displayedPly === pair.whitePly;
                  const bActive = snapshot.displayedPly === pair.blackPly;
                  return (
                    <li key={pair.number} className="move-row">
                      <span className="move-number">{pair.number}.</span>
                      <button
                        type="button"
                        className={`move-cell-btn ${wActive ? 'active-ply' : ''}`}
                        onClick={() => goToPly(pair.whitePly)}
                      >
                        <span>{pair.white}</span>
                        {pair.meta[0]?.classification && (
                          <em className="move-badge" style={{ color: pair.meta[0].classification.color }}>
                            {pair.meta[0].classification.badge}
                          </em>
                        )}
                      </button>
                      {pair.black ? (
                        <button
                          type="button"
                          className={`move-cell-btn ${bActive ? 'active-ply' : ''}`}
                          onClick={() => goToPly(pair.blackPly)}
                        >
                          <span>{pair.black}</span>
                          {pair.meta[1]?.classification && (
                            <em className="move-badge" style={{ color: pair.meta[1].classification.color }}>
                              {pair.meta[1].classification.badge}
                            </em>
                          )}
                        </button>
                      ) : (
                        <span className="move-cell-empty" />
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
