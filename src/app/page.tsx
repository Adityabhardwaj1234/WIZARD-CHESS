'use client';

/**
 * Application Shell (`page.tsx`)
 *
 * Wraps the entire router stage in `<SessionProvider>` so a match in progress
 * persists seamlessly across Home, Play, Analysis, Model Studio, Training Lab, Game Library, and Settings.
 * Also renders the global Replay Video Export Modal (`videoModal`).
 */

import React, { useCallback, useEffect, useState } from 'react';

import { TopNavbar } from '../components/TopNavbar';
import { HomeDashboard } from '../components/HomeDashboard';
import { PlayView } from '../components/PlayView';
import { XRayOverlayPanel } from '../components/XRayOverlayPanel';
import { ModelStudio } from '../components/ModelStudio';
import { TrainingLab } from '../components/TrainingLab';
import { GameLibrary } from '../components/GameLibrary';
import { SettingsView } from '../components/SettingsView';
import { SessionProvider, useSession, type PrimaryView } from '../context/CathedralSession';

export type { PrimaryView } from '../context/CathedralSession';

function AppStage() {
  const { settings, updateSettings, isFullscreenBoard, toggleFullscreenBoard, videoModal, cancelVideoExport, closeVideoModal } =
    useSession();
  const [activeView, setActiveView] = useState<PrimaryView>('home');
  const [uiDensity, setUiDensity] = useState<'comfortable' | 'compact'>('comfortable');

  const navigate = useCallback(
    (view: PrimaryView) => {
      if (view !== 'play' && isFullscreenBoard) {
        toggleFullscreenBoard(false);
      }
      setActiveView(view);
    },
    [isFullscreenBoard, toggleFullscreenBoard]
  );

  const toggleDensity = useCallback(
    () => setUiDensity(prev => (prev === 'comfortable' ? 'compact' : 'comfortable')),
    []
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const k = event.key.toLowerCase();
      if (k === 'escape' && isFullscreenBoard) {
        event.preventDefault();
        toggleFullscreenBoard(false);
        return;
      }
      if (k === 'f') {
        event.preventDefault();
        setActiveView('play');
        toggleFullscreenBoard();
        return;
      }
      const map: Record<string, PrimaryView> = {
        h: 'home',
        p: 'play',
        x: 'analysis',
        m: 'models',
        t: 'training',
        l: 'library',
        s: 'settings'
      };
      const view = map[k];
      if (view) {
        event.preventDefault();
        navigate(view);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFullscreenBoard, navigate, toggleFullscreenBoard]);

  return (
    <div
      className={`app-shell density-${uiDensity} ui-theme-${settings.uiTheme || 'dark'} ${
        settings.reducedMotion ? 'reduced-motion' : ''
      } ${isFullscreenBoard && activeView === 'play' ? 'fullscreen-board-mode' : ''}`}
    >
      <TopNavbar
        activeView={activeView}
        onNavigate={navigate}
        uiDensity={uiDensity}
        onToggleDensity={toggleDensity}
      />
      <main className="main-router-stage">
        {activeView === 'home' && <HomeDashboard onNavigate={navigate} />}
        {activeView === 'play' && <PlayView />}
        {activeView === 'analysis' && <XRayOverlayPanel />}
        {activeView === 'models' && (
          <ModelStudio
            activeModelId={settings.activeModelId}
            onSelectModel={modelId => updateSettings({ activeModelId: modelId })}
          />
        )}
        {activeView === 'training' && <TrainingLab />}
        {activeView === 'library' && <GameLibrary onNavigate={navigate} />}
        {activeView === 'settings' && <SettingsView />}
      </main>

      {videoModal && (
        <div className="video-modal-backdrop" role="dialog" aria-modal="true" aria-label="Replay Video Export">
          <div className="video-modal-card">
            <div className="section-header">
              <span>Replay Video Exporter ({videoModal.filename})</span>
              <button type="button" className="icon-btn" onClick={closeVideoModal}>
                Close
              </button>
            </div>
            {videoModal.running ? (
              <>
                <p className="text-muted">
                  Encoding move {videoModal.ply} of {videoModal.totalPlies} ({videoModal.pct}%)…
                </p>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${videoModal.pct}%` }} />
                </div>
                <button type="button" className="icon-btn danger" onClick={cancelVideoExport}>
                  Cancel Encoding
                </button>
              </>
            ) : videoModal.error ? (
              <p className="engine-error">{videoModal.error}</p>
            ) : videoModal.url ? (
              <>
                <p className="text-muted">
                  Encoded playable video ({(videoModal.sizeBytes / 1024).toFixed(1)} KB, {videoModal.frameCount} frames):
                </p>
                <video
                  src={videoModal.url}
                  controls
                  autoPlay
                  loop
                  style={{ width: '100%', maxHeight: '340px', borderRadius: '8px', background: '#000', margin: '0.4rem 0' }}
                />
                <div className="control-row" style={{ justifyContent: 'space-between', marginTop: '0.5rem' }}>
                  <a
                    href={videoModal.url}
                    download={videoModal.filename}
                    className="nav-btn primary"
                    style={{ textDecoration: 'none' }}
                  >
                    Download {videoModal.filename}
                  </a>
                  <button type="button" className="icon-btn" onClick={closeVideoModal}>
                    Done
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

export default function WizardsChessCathedralPage() {
  return (
    <SessionProvider>
      <AppStage />
    </SessionProvider>
  );
}