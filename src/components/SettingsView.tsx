'use client';

/**
 * Settings & Advanced Settings View (`SettingsView.tsx`)
 *
 * Groups beginner board/audio preferences and specialist Advanced Settings
 * (Variable Node Budget <= 500 MB RAM & Device Calculator, Super Thinking, Model Studio,
 * Headless Training Lab, and Storage/Video Export) in one clean Vercel-style workspace.
 */

import React, { useState } from 'react';

import { ModelStudio } from './ModelStudio';
import { TrainingLab } from './TrainingLab';
import { useSession, type BoardTheme, type PieceStyle, type UiTheme } from '../context/CathedralSession';
import {
  CLOCK_PRESETS,
  MAX_NODES_UNDER_500MB,
  calculateDeviceNodeBudgetProfile,
  clampNodeBudgetToRamCap,
  estimateNodeRamMb,
  generateSmartGameFilename
} from '../lib/cathedral';
import {
  ANIMATION_SPEED_OPTIONS,
  BOARD_THEME_OPTIONS,
  DIFFICULTY_OPTIONS,
  OPPONENT_DELAY_OPTIONS,
  PIECE_STYLE_OPTIONS,
  SUPER_THINKING_OPTIONS
} from '../lib/options';

type SettingsTab = 'basic' | 'engine' | 'models' | 'training' | 'storage';

export function SettingsView() {
  const {
    settings,
    updateSettings,
    activeModel,
    transport,
    snapshot,
    mounted,
    playerRating,
    humanColor,
    exportVideoForGame
  } = useSession();

  const [tab, setTab] = useState<SettingsTab>('basic');
  const [deviceNotice, setDeviceNotice] = useState<string | null>(null);

  const devProfile = calculateDeviceNodeBudgetProfile();
  const nodeBudget = settings.customNodeBudget || 500000;
  const maxRamCapMb = settings.maxNodeRamMb || 500;
  const estRamMb = estimateNodeRamMb(nodeBudget);
  const ramPct = Math.min(100, Math.round((estRamMb / 500) * 100));

  return (
    <section className="settings-view" aria-label="Settings and Advanced Settings">
      <div className="panel-section">
        <div className="section-header">
          <span>Settings &amp; Advanced Configuration</span>
          <span>Active Evaluator: {activeModel.name}</span>
        </div>
        <div className="adv-tabs-bar" role="tablist">
          <button
            type="button"
            className={`adv-tab-btn ${tab === 'basic' ? 'active' : ''}`}
            onClick={() => setTab('basic')}
          >
            Board, Animation &amp; Audio
          </button>
          <button
            type="button"
            className={`adv-tab-btn ${tab === 'engine' ? 'active' : ''}`}
            onClick={() => setTab('engine')}
          >
            Advanced: Engine &amp; Node Budget (≤500 MB)
          </button>
          <button
            type="button"
            className={`adv-tab-btn ${tab === 'models' ? 'active' : ''}`}
            onClick={() => setTab('models')}
          >
            Advanced: Model Studio
          </button>
          <button
            type="button"
            className={`adv-tab-btn ${tab === 'training' ? 'active' : ''}`}
            onClick={() => setTab('training')}
          >
            Advanced: Training Lab
          </button>
          <button
            type="button"
            className={`adv-tab-btn ${tab === 'storage' ? 'active' : ''}`}
            onClick={() => setTab('storage')}
          >
            Storage &amp; Video Export
          </button>
        </div>
        {deviceNotice && <p className="save-toast">{deviceNotice}</p>}
      </div>

      {tab === 'basic' && (
        <div className="settings-grid">
          <div className="panel-section">
            <div className="section-header">
              <span>Board Theme &amp; Piece Set</span>
              <span>2D Vector</span>
            </div>

            <label className="field">
              <span>Board Theme</span>
              <select
                value={settings.boardTheme}
                onChange={e => updateSettings({ boardTheme: e.target.value as BoardTheme })}
              >
                {BOARD_THEME_OPTIONS.map(theme => (
                  <option key={theme.id} value={theme.id}>
                    {theme.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field" style={{ marginTop: '0.5rem' }}>
              <span>Piece Set Style</span>
              <select
                value={settings.pieceStyle || 'neo'}
                onChange={e => updateSettings({ pieceStyle: e.target.value as PieceStyle })}
              >
                {PIECE_STYLE_OPTIONS.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field" style={{ marginTop: '0.5rem' }}>
              <span>Interface Appearance</span>
              <select
                value={settings.uiTheme}
                onChange={e => updateSettings({ uiTheme: e.target.value as UiTheme })}
              >
                <option value="dark">Vercel Dark (Default)</option>
                <option value="light">Daylight Light</option>
              </select>
            </label>

            <label className="field-checkbox">
              <input
                type="checkbox"
                checked={settings.colorBlindMode}
                onChange={e => updateSettings({ colorBlindMode: e.target.checked })}
              />
              <span>High-contrast accessibility indicators</span>
            </label>

            <label className="field-checkbox">
              <input
                type="checkbox"
                checked={settings.showCoordinates}
                onChange={e => updateSettings({ showCoordinates: e.target.checked })}
              />
              <span>Show rank and file coordinates (a–h, 1–8)</span>
            </label>

            <label className="field-checkbox">
              <input
                type="checkbox"
                checked={settings.showLegalMoves}
                onChange={e => updateSettings({ showLegalMoves: e.target.checked })}
              />
              <span>Show legal destination and capture markers</span>
            </label>
          </div>

          <div className="panel-section">
            <div className="section-header">
              <span>Piece Motion, L-Path &amp; 1.5s Pacing</span>
              <span>Mathematical Trajectories</span>
            </div>

            <label className="field">
              <span>Opponent Response Presentation Delay</span>
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
            <p className="field-hint">
              Engine calculation starts immediately in parallel; if search finishes early, presentation waits the
              remaining time so opponent moves remain smooth and readable.
            </p>

            <label className="field" style={{ marginTop: '0.5rem' }}>
              <span>Piece Movement Speed</span>
              <select
                value={settings.animationSpeed || 'standard'}
                onChange={e =>
                  updateSettings({ animationSpeed: e.target.value as typeof settings.animationSpeed })
                }
              >
                {ANIMATION_SPEED_OPTIONS.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field-checkbox">
              <input
                type="checkbox"
                checked={settings.showMoveTrails !== false}
                onChange={e => updateSettings({ showMoveTrails: e.target.checked })}
              />
              <span>Show fading move trails and L-shaped Knight paths</span>
            </label>

            <label className="field-checkbox">
              <input
                type="checkbox"
                checked={settings.reducedMotion}
                onChange={e => updateSettings({ reducedMotion: e.target.checked })}
              />
              <span>Reduced motion mode (instant piece placement)</span>
            </label>
          </div>

          <div className="panel-section">
            <div className="section-header">
              <span>Audio Synthesiser</span>
              <span>WebAudio</span>
            </div>

            <label className="field-checkbox">
              <input
                type="checkbox"
                checked={settings.soundEnabled}
                onChange={e => updateSettings({ soundEnabled: e.target.checked })}
              />
              <span>Enable move, capture, and check audio cues</span>
            </label>

            <label className="field">
              <span>Volume — {settings.soundVolume ?? 75}%</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={settings.soundVolume ?? 75}
                disabled={!settings.soundEnabled}
                onChange={e => updateSettings({ soundVolume: Number(e.target.value) })}
              />
            </label>
          </div>
        </div>
      )}

      {tab === 'engine' && (
        <div className="panel-section">
          <div className="section-header">
            <span>Variable Node Budget, 500 MB Node RAM Cap &amp; Device Calculator</span>
            <span>
              Est. Node RAM: {estRamMb} MB / {maxRamCapMb} MB Cap
            </span>
          </div>
          <p className="honest-disclaimer">
            Enter any variable maximum node budget below. Each node consumes 20 bytes of structured search state,
            placing the hard 500 MB node RAM ceiling at {MAX_NODES_UNDER_500MB.toLocaleString()} nodes. Searches
            automatically terminate the instant your node budget or RAM ceiling is reached.
          </p>

          <div className="telemetry-grid" style={{ margin: '0.65rem 0' }}>
            <div className="metric-box">
              <span className="metric-label">Detected Device Profile</span>
              <span className="metric-value" style={{ fontSize: '0.86rem' }}>
                {devProfile.deviceTier}
              </span>
            </div>
            <div className="metric-box">
              <span className="metric-label">Hardware RAM / Cores</span>
              <span className="metric-value">
                {devProfile.effectiveRamGb} GB · {devProfile.cores} threads
              </span>
            </div>
            <div className="metric-box">
              <span className="metric-label">Device Max Safe Nodes</span>
              <span className="metric-value">
                {devProfile.maxNodesForDevice.toLocaleString()} ({devProfile.deviceSafeRamMb} MB)
              </span>
            </div>
            <div className="metric-box">
              <span className="metric-label">Configured Node RAM</span>
              <span className="metric-value">{estRamMb} MB / 500 MB</span>
            </div>
          </div>

          <div className="progress-track" style={{ marginBottom: '0.65rem' }}>
            <div className="progress-fill" style={{ width: `${ramPct}%` }} />
          </div>

          <div className="control-row" style={{ marginBottom: '0.75rem' }}>
            <button
              type="button"
              className="nav-btn primary"
              onClick={() => {
                updateSettings({
                  useVariableNodeBudget: true,
                  superThinkingPreset: 'Custom',
                  maxNodeRamMb: devProfile.deviceSafeRamMb,
                  customNodeBudget: devProfile.maxNodesForDevice
                });
                setDeviceNotice(
                  `Calculated for ${devProfile.deviceTier}: Max safe node budget set to ${devProfile.maxNodesForDevice.toLocaleString()} nodes (${devProfile.deviceSafeRamMb} MB RAM cap).`
                );
              }}
            >
              Auto-Calculate Max Safe Budget for This Device ({devProfile.maxNodesForDevice.toLocaleString()} nodes)
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => {
                updateSettings({
                  useVariableNodeBudget: true,
                  superThinkingPreset: 'Custom',
                  maxNodeRamMb: devProfile.deviceSafeRamMb,
                  customNodeBudget: devProfile.recommendedNodes
                });
                setDeviceNotice(
                  `Set recommended device budget: ${devProfile.recommendedNodes.toLocaleString()} nodes (${devProfile.recommendedRamMb} MB).`
                );
              }}
            >
              Set Recommended Device Budget ({devProfile.recommendedNodes.toLocaleString()} nodes)
            </button>
          </div>

          <div className="control-grid-4">
            <label className="field">
              <span>Variable Max Node Budget (20 – 26,214,400)</span>
              <input
                type="number"
                min={20}
                max={MAX_NODES_UNDER_500MB}
                step={10000}
                value={nodeBudget}
                onChange={e =>
                  updateSettings({
                    useVariableNodeBudget: true,
                    superThinkingPreset: 'Custom',
                    customNodeBudget: clampNodeBudgetToRamCap(Number(e.target.value), maxRamCapMb)
                  })
                }
              />
            </label>

            <label className="field">
              <span>Node RAM Cap (MB, Max 500 MB)</span>
              <select
                value={maxRamCapMb}
                onChange={e => {
                  const cap = Math.max(1, Math.min(500, Number(e.target.value) || 500));
                  updateSettings({
                    maxNodeRamMb: cap,
                    customNodeBudget: clampNodeBudgetToRamCap(nodeBudget, cap)
                  });
                }}
              >
                {[64, 128, 256, 384, 500].map(mb => (
                  <option key={mb} value={mb}>
                    {mb} MB ({Math.floor((mb * 1024 * 1024) / 20).toLocaleString()} max nodes)
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Default Opponent Strength (12 Tiers)</span>
              <select
                value={settings.difficulty}
                onChange={e => updateSettings({ difficulty: e.target.value })}
              >
                {DIFFICULTY_OPTIONS.map(option => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Super Thinking Preset</span>
              <select
                value={settings.superThinkingPreset || 'Balanced'}
                onChange={e => {
                  const p = SUPER_THINKING_OPTIONS.find(x => x.id === e.target.value) || SUPER_THINKING_OPTIONS[0];
                  updateSettings({
                    superThinkingPreset: p.id,
                    superThinkingEnabled: p.id === 'SuperThinking' || p.id === 'Deep' || p.id === 'Custom',
                    customNodeBudget: clampNodeBudgetToRamCap(p.nodeLimit, maxRamCapMb),
                    customMaxDepth: p.maxDepth,
                    customTimeBudgetMs: p.timeLimitMs,
                    ttMemoryMb: p.ttMemoryMb,
                    multiPvCount: p.multiPv
                  });
                }}
              >
                {SUPER_THINKING_OPTIONS.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Target Search Depth (1–24)</span>
              <input
                type="number"
                min={1}
                max={24}
                value={settings.customMaxDepth || 8}
                onChange={e =>
                  updateSettings({
                    superThinkingPreset: 'Custom',
                    customMaxDepth: Math.max(1, Math.min(24, Number(e.target.value) || 8))
                  })
                }
              />
            </label>

            <label className="field">
              <span>Time Budget (ms)</span>
              <input
                type="number"
                min={100}
                max={120000}
                step={250}
                value={settings.customTimeBudgetMs || 2500}
                onChange={e =>
                  updateSettings({
                    superThinkingPreset: 'Custom',
                    customTimeBudgetMs: Math.max(100, Math.min(120000, Number(e.target.value) || 2500))
                  })
                }
              />
            </label>

            <label className="field">
              <span>Transposition Table Memory</span>
              <select
                value={settings.ttMemoryMb || 16}
                onChange={e => updateSettings({ ttMemoryMb: Number(e.target.value) || 16 })}
              >
                {[4, 8, 16, 32, 64].map(mb => (
                  <option key={mb} value={mb}>
                    {mb} MB
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Analysis MultiPV Lines (1–5)</span>
              <select
                value={settings.multiPvCount || 2}
                onChange={e => updateSettings({ multiPvCount: Number(e.target.value) || 2 })}
              >
                {[1, 2, 3, 4, 5].map(n => (
                  <option key={n} value={n}>
                    {n} Candidate Line(s)
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="field-checkbox" style={{ marginTop: '0.5rem' }}>
            <input
              type="checkbox"
              checked={settings.useOpeningBook}
              onChange={e => updateSettings({ useOpeningBook: e.target.checked })}
            />
            <span>Enable verified Opening Book</span>
          </label>
        </div>
      )}

      {tab === 'models' && (
        <ModelStudio
          activeModelId={settings.activeModelId}
          onSelectModel={modelId => updateSettings({ activeModelId: modelId })}
        />
      )}

      {tab === 'training' && <TrainingLab />}

      {tab === 'storage' && (
        <div className="settings-grid">
          <div className="panel-section">
            <div className="section-header">
              <span>Smart Game Naming &amp; Replay Video Export</span>
              <span>IndexedDB + WebM</span>
            </div>
            <p className="text-muted">
              Default smart filename format:{' '}
              <code>
                {generateSmartGameFilename({
                  playerColor: humanColor,
                  opponentName: `Cathedral-${settings.difficulty}`,
                  result: 'Checkmate'
                })}
              </code>
            </p>
            <label className="field" style={{ marginTop: '0.5rem' }}>
              <span>Video Export Resolution</span>
              <select
                value={settings.videoExportResolution || 720}
                onChange={e => updateSettings({ videoExportResolution: Number(e.target.value) || 720 })}
              >
                <option value={720}>720×720 HD Square</option>
                <option value={1080}>1080×1080 Full HD Square</option>
              </select>
            </label>
            <label className="field" style={{ marginTop: '0.5rem' }}>
              <span>Video Replay Speed (ms per move)</span>
              <select
                value={settings.videoExportSpeedMs || 550}
                onChange={e => updateSettings({ videoExportSpeedMs: Number(e.target.value) || 550 })}
              >
                <option value={350}>Fast (350 ms / move)</option>
                <option value={550}>Standard (550 ms / move)</option>
                <option value={900}>Detailed (900 ms / move)</option>
              </select>
            </label>
            <button
              type="button"
              className="nav-btn primary"
              style={{ marginTop: '0.65rem' }}
              onClick={() => exportVideoForGame()}
              disabled={snapshot.moveCount === 0}
            >
              Export Current Game Video (.webm)
            </button>
          </div>

          <div className="panel-section">
            <div className="section-header">
              <span>System &amp; Privacy Diagnostics</span>
              <span>Local Execution</span>
            </div>
            <dl className="diagnostics">
              <dt>Renderer</dt>
              <dd>2D HTML/CSS/SVG Grid + Web Animations API</dd>
              <dt>Engine Transport</dt>
              <dd>{transport === 'pending' && !mounted ? 'Initialising…' : transport}</dd>
              <dt>Active Model</dt>
              <dd>
                {activeModel.name} ({activeModel.modelType})
              </dd>
              <dt>Local Estimated Rating</dt>
              <dd>
                {playerRating.rating} (±{playerRating.rd}) across {playerRating.gamesPlayed} rated games
              </dd>
              <dt>Active FEN</dt>
              <dd className="diag-mono">{snapshot.fen}</dd>
            </dl>
          </div>
        </div>
      )}
    </section>
  );
}
