import React from 'react';
import { useSession, type PrimaryView } from '../context/CathedralSession';

interface TopNavbarProps {
  activeView: PrimaryView;
  onNavigate: (view: PrimaryView) => void;
  uiDensity: 'comfortable' | 'compact';
  onToggleDensity: () => void;
}

export function TopNavbar({
  activeView,
  onNavigate,
  uiDensity,
  onToggleDensity
}: TopNavbarProps) {
  const { isFullscreenBoard, toggleFullscreenBoard, activeModel, settings } = useSession();

  const navItems: { id: PrimaryView; label: string }[] = [
    { id: 'home', label: 'Home' },
    { id: 'play', label: 'Play' },
    { id: 'analysis', label: 'Analysis' },
    { id: 'library', label: 'Game Library' },
    { id: 'settings', label: 'Settings' }
  ];

  return (
    <header className="top-nav" role="navigation" aria-label="Primary Navigation">
      <div className="brand-cluster" onClick={() => onNavigate('home')} style={{ cursor: 'pointer' }}>
        <div className="brand-crest" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v4M9 4h6M6 20h12M8 16h8l1-9-4 3-3-4-3 4-4-3 1 9z" />
          </svg>
        </div>
        <div className="brand-titles">
          <span className="brand-name">WIZARD&apos;S CHESS</span>
          <span className="brand-tagline">
            {activeModel.name} · {settings.superThinkingEnabled ? 'Super Thinking' : `${((settings.opponentDelayMs ?? 1500) / 1000).toFixed(1)}s Delay`} · {(settings.customNodeBudget || 500000).toLocaleString()} Nodes Max
          </span>
        </div>
      </div>

      <div className="nav-actions">
        {navItems.map(item => (
          <button
            key={item.id}
            type="button"
            className={`nav-btn ${activeView === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <span>{item.label}</span>
          </button>
        ))}
        <button
          type="button"
          className="nav-btn"
          onClick={() => {
            onNavigate('play');
            toggleFullscreenBoard();
          }}
          title="Toggle Fullscreen Board Mode (F)"
        >
          {isFullscreenBoard ? 'Exit Fullscreen' : 'Fullscreen'}
        </button>
        <button
          type="button"
          className="nav-btn"
          onClick={onToggleDensity}
          title="Toggle UI Density (Comfortable / Compact)"
        >
          {uiDensity === 'comfortable' ? 'Compact' : 'Comfort'}
        </button>
      </div>
    </header>
  );
}
