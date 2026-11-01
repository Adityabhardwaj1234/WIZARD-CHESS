'use client';

/**
 * Landing Page & Home Dashboard (`HomeDashboard.tsx`)
 *
 * Combines a Vercel-style product landing hero, 4-card architecture bento grid,
 * personal performance telemetry, and the full pre-game match configurator.
 */

import React, { useEffect, useMemo, useState } from 'react';

import { PieceSvg } from './PieceSvg';
import { useSession, type BoardTheme, type PlayerColor, type PrimaryView } from '../context/CathedralSession';
import { BUILTIN_MODELS, CLOCK_PRESETS, estimateNodeRamMb, loadUserModels } from '../lib/cathedral';
import {
  BOARD_THEME_OPTIONS,
  DIFFICULTY_OPTIONS,
  OPPONENT_DELAY_OPTIONS
} from '../lib/options';

export function HomeDashboard({ onNavigate }: { onNavigate: (view: PrimaryView) => void }) {
  const {
    snapshot,
    settings,
    updateSettings,
    activeModel,
    archive,
    terminal,
    mounted,
    newGame,
    openArchivedGame,
    toggleFullscreenBoard,
    exportVideoForGame,
    playerRating
  } = useSession();

  const [setupColor, setSetupColor] = useState<'w' | 'b' | 'random'>('w');
  const [setupDifficulty, setSetupDifficulty] = useState<string>(settings.difficulty || 'ClubPlayer');
  const [setupTimeControl, setSetupTimeControl] = useState<string>(settings.timeControl || 'untimed');
  const [setupTheme, setSetupTheme] = useState<BoardTheme>(settings.boardTheme || 'classic-green');

  const allModels = useMemo(() => {
    const custom = mounted ? loadUserModels() : [];
    return [...BUILTIN_MODELS, ...custom].filter(m => m.modelType !== 'python_source_only');
  }, [mounted]);

  useEffect(() => {
    setSetupDifficulty(settings.difficulty);
    setSetupTimeControl(settings.timeControl);
    setSetupTheme(settings.boardTheme);
  }, [settings.boardTheme, settings.difficulty, settings.timeControl]);

  const hasUnfinishedGame = snapshot.moveCount > 0 && !terminal;
  const selectedPreset = useMemo(
    () => DIFFICULTY_OPTIONS.find(d => d.id === setupDifficulty) ?? DIFFICULTY_OPTIONS[4],
    [setupDifficulty]
  );

  const handleQuickStart = (
    overrideMode?: 'engine' | 'two-player',
    overrideDiff?: string,
    enableSuperThinking = false
  ) => {
    const diff = overrideDiff ?? setupDifficulty;
    updateSettings({
      difficulty: diff,
      timeControl: setupTimeControl,
      boardTheme: setupTheme,
      superThinkingEnabled: enableSuperThinking,
      superThinkingPreset: enableSuperThinking ? 'SuperThinking' : settings.superThinkingPreset
    });
    newGame({
      mode: overrideMode ?? 'engine',
      color: setupColor as PlayerColor | 'random',
      difficulty: diff
    });
    onNavigate('play');
  };

  return (
    <section className="home-dashboard" aria-label="Wizard's Chess Landing Page and Match Hub">
      {/* Vercel-Style Landing Hero */}
      <div className="landing-hero">
        <div>
          <div className="landing-eyebrow">
            <span>Wizard’s Chess V3 · Cathedral Evolution</span>
            <span>·</span>
            <span>{activeModel.name}</span>
          </div>
          <h1 className="landing-headline">
            Precision 2D Chess, Neural Evaluation &amp; Distraction-Free Arena.
          </h1>
          <p className="landing-subhead">
            Play against 12 calibrated engine tiers with Cburnett/Neo-Staunton vector pieces, smooth 2-segment L-shaped
            Knight trajectories, {((settings.opponentDelayMs ?? 1500) / 1000).toFixed(1)}s response pacing, and a
            configurable Variable Node Budget strictly capped at 500 MB of node RAM.
          </p>
          <div className="control-row">
            {hasUnfinishedGame && (
              <button type="button" className="nav-btn primary" onClick={() => onNavigate('play')}>
                Continue Active Game ({snapshot.moveCount} ply)
              </button>
            )}
            <button
              type="button"
              className={hasUnfinishedGame ? 'icon-btn' : 'nav-btn primary'}
              onClick={() => handleQuickStart('engine')}
            >
              Play Now vs {selectedPreset?.shortLabel ?? setupDifficulty}
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => handleQuickStart('engine', 'CathedralApex', true)}
            >
              Launch Super Thinking Match
            </button>
            <button type="button" className="icon-btn" onClick={() => onNavigate('analysis')}>
              11-Layer X-Ray &amp; Analysis
            </button>
            <button type="button" className="icon-btn" onClick={() => onNavigate('settings')}>
              Advanced Settings &amp; Models
            </button>
          </div>
        </div>

        {/* Interactive / Animated 4x4 Tactical Preview Card */}
        <div className="mini-preview-card" aria-label="Tactical Board & L-Path Trajectory Preview">
          <div className="section-header" style={{ marginBottom: '0.45rem' }}>
            <span>Cburnett Vector &amp; Knight L-Path Preview</span>
            <span>#ebecd0 / #739552</span>
          </div>
          <div style={{ position: 'relative', width: '100%', maxWidth: '240px', aspectRatio: '1/1', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderRadius: '6px', overflow: 'hidden', border: '1px solid #262626' }}>
            {[
              { light: true, p: null }, { light: false, p: { t: 'q' as const, c: 'b' as const } }, { light: true, p: { t: 'k' as const, c: 'b' as const } }, { light: false, p: { t: 'r' as const, c: 'b' as const } },
              { light: false, p: { t: 'p' as const, c: 'b' as const } }, { light: true, p: { t: 'b' as const, c: 'b' as const } }, { light: false, p: { t: 'p' as const, c: 'b' as const } }, { light: true, p: null },
              { light: true, p: null }, { light: false, p: { t: 'n' as const, c: 'w' as const } }, { light: true, p: null }, { light: false, p: { t: 'B' as any, c: 'w' as const } },
              { light: false, p: { t: 'p' as const, c: 'w' as const } }, { light: true, p: null }, { light: false, p: { t: 'q' as const, c: 'w' as const } }, { light: true, p: { t: 'k' as const, c: 'w' as const } }
            ].map((sq, idx) => (
              <div
                key={idx}
                style={{
                  background: idx === 9 || idx === 14 ? '#f5f682' : sq.light ? '#ebecd0' : '#739552',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '4px'
                }}
              >
                {sq.p && <PieceSvg type={(sq.p.t.toLowerCase() as any)} color={sq.p.c} size="86%" />}
              </div>
            ))}
            <svg viewBox="0 0 400 400" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
              <path d="M 250 350 L 250 250 L 150 250" fill="none" stroke="#38bdf8" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" opacity="0.88" />
              <circle cx="250" cy="250" r="14" fill="#38bdf8" opacity="0.85" />
            </svg>
          </div>
        </div>
      </div>

      {/* 4-Card Bento Architecture Grid */}
      <div className="landing-bento-grid">
        <div className="bento-card">
          <span className="bento-card-kicker">01 · Search &amp; Memory</span>
          <h2 className="bento-card-title">Variable Node Budget (≤500 MB Cap)</h2>
          <p className="bento-card-desc">
            Enter any custom node budget up to 26,214,400 nodes (500 MB at 20 bytes/node) or auto-calculate safe device limits with instant termination.
          </p>
        </div>
        <div className="bento-card">
          <span className="bento-card-kicker">02 · Board &amp; Motion</span>
          <h2 className="bento-card-title">L-Shaped Knight Path &amp; 1.5s Delay</h2>
          <p className="bento-card-desc">
            Cburnett/Neo-Staunton 2D pieces animate along true board rays and 2-segment Knight L-paths with a natural 1.5s opponent presentation delay.
          </p>
        </div>
        <div className="bento-card">
          <span className="bento-card-kicker">03 · Model Studio</span>
          <h2 className="bento-card-title">Python Neural MLP &amp; Hybrid Eval</h2>
          <p className="bento-card-desc">
            Switch live between Classical 24-param, CathedralNet v1 (38,665-param MLP), and Hybrid Ensemble (118.0 cp MAE, 93.6% sign accuracy).
          </p>
        </div>
        <div className="bento-card">
          <span className="bento-card-kicker">04 · Diagnostics &amp; Media</span>
          <h2 className="bento-card-title">11-Layer X-Ray &amp; WebM Replay Video</h2>
          <p className="bento-card-desc">
            Inspect pins, forks, hanging pieces, and 5-tier hints on the dedicated Analysis page, or export any match as a playable WebM video.
          </p>
        </div>
      </div>

      {/* Match Setup & Telemetry Grid */}
      <div className="dashboard-grid">
        <div className="panel-section">
          <div className="section-header">
            <span>Configure New Match</span>
            <span>12 Tiers + Model Selection</span>
          </div>
          <div className="control-grid-2">
            <label className="field">
              <span>Your Colour</span>
              <select value={setupColor} onChange={e => setSetupColor(e.target.value as 'w' | 'b' | 'random')}>
                <option value="w">White</option>
                <option value="b">Black</option>
                <option value="random">Random Colour</option>
              </select>
            </label>

            <label className="field">
              <span>Engine Tier (1–12 + Lab)</span>
              <select value={setupDifficulty} onChange={e => setSetupDifficulty(e.target.value)}>
                {DIFFICULTY_OPTIONS.map(opt => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Evaluation Model</span>
              <select
                value={settings.activeModelId}
                onChange={e => updateSettings({ activeModelId: e.target.value })}
              >
                {allModels.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.modelType})
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Opponent Response Delay</span>
              <select
                value={settings.opponentDelayMs ?? 1500}
                onChange={e => updateSettings({ opponentDelayMs: Number(e.target.value) })}
              >
                {OPPONENT_DELAY_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Time Control</span>
              <select value={setupTimeControl} onChange={e => setSetupTimeControl(e.target.value)}>
                {Object.values(CLOCK_PRESETS).map(preset => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Board Theme</span>
              <select value={setupTheme} onChange={e => setSetupTheme(e.target.value as BoardTheme)}>
                {BOARD_THEME_OPTIONS.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="control-row" style={{ marginTop: '0.75rem' }}>
            <button type="button" className="nav-btn primary" onClick={() => handleQuickStart('engine')}>
              Enter Play Arena
            </button>
            <button type="button" className="icon-btn" onClick={() => handleQuickStart('two-player')}>
              Pass &amp; Play (2P)
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => {
                onNavigate('play');
                toggleFullscreenBoard(true);
              }}
            >
              Fullscreen Board
            </button>
          </div>
        </div>

        <div className="panel-section">
          <div className="section-header">
            <span>Telemetry, Recent Matches &amp; Specialist Tools</span>
            <span>Local Storage</span>
          </div>
          <div className="telemetry-grid">
            <div className="metric-box">
              <span className="metric-label">Est. Local Rating</span>
              <span className="metric-value">
                {playerRating.rating} <small className="text-muted">±{playerRating.rd}</small>
              </span>
            </div>
            <div className="metric-box">
              <span className="metric-label">Node Budget</span>
              <span className="metric-value" style={{ fontSize: '0.9rem' }}>
                {(settings.customNodeBudget || 500000).toLocaleString()} ({estimateNodeRamMb(settings.customNodeBudget || 500000)} MB)
              </span>
            </div>
            <div className="metric-box">
              <span className="metric-label">Record (W/D/L)</span>
              <span className="metric-value">
                {playerRating.wins} / {playerRating.draws} / {playerRating.losses}
              </span>
            </div>
            <div className="metric-box">
              <span className="metric-label">Saved Games</span>
              <span className="metric-value">{archive.length}</span>
            </div>
          </div>

          {archive.length > 0 && (
            <ul className="recent-games-list" style={{ marginTop: '0.6rem' }}>
              {archive.slice(0, 2).map(g => (
                <li key={g.id} className="recent-game-row">
                  <div>
                    <strong>{g.smartName || g.title}</strong>
                    <span className="text-muted" style={{ display: 'block', fontSize: '0.76rem' }}>
                      {g.result}
                    </span>
                  </div>
                  <div className="control-row">
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => {
                        openArchivedGame(g);
                        onNavigate('play');
                      }}
                    >
                      Replay
                    </button>
                    <button type="button" className="icon-btn" onClick={() => exportVideoForGame(g)}>
                      Export Video
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="launch-grid" style={{ marginTop: '0.75rem' }}>
            <button type="button" className="icon-btn" onClick={() => onNavigate('analysis')}>
              Analysis &amp; 11-Layer X-Ray
            </button>
            <button type="button" className="icon-btn" onClick={() => onNavigate('library')}>
              Game Library &amp; Video Export
            </button>
            <button type="button" className="icon-btn" onClick={() => onNavigate('settings')}>
              Advanced: Node Budget &amp; Model Studio
            </button>
            <button type="button" className="icon-btn" onClick={() => onNavigate('settings')}>
              Advanced: SPSA Training Lab
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
