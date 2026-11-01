'use client';

/**
 * Game Library, Smart Naming, Video Export & Serverless Sharing (`GameLibrary.tsx`)
 */

import React, { useMemo, useState } from 'react';

import { useSession, type ArchivedGame, type PrimaryView } from '../context/CathedralSession';
import { buildSafeSharePayload, decodeGameFromUrlHash } from '../sharing/shareUrl';

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function copyTextFallback(text: string): boolean {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      void navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_e) {
    // Fallback below
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return true;
  } catch (_e) {
    return false;
  }
}

function downloadPgn(record: ArchivedGame): void {
  const blob = new Blob([record.pgn || `[FEN "${record.fen}"]`], { type: 'application/x-chess-pgn' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${record.smartName || record.id}.pgn`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function GameLibrary({ onNavigate }: { onNavigate?: (view: PrimaryView) => void }) {
  const {
    archive,
    sessionGameId,
    openArchivedGame,
    toggleFavoriteGame,
    toggleArchiveGame,
    removeArchivedGame,
    clearArchive,
    saveCurrentGame,
    refreshArchive,
    importPgn,
    importFen,
    exportVideoForGame,
    snapshot
  } = useSession();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'engine' | 'two-player' | 'favorites' | 'archived'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'longest'>('newest');
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [importText, setImportText] = useState('');
  const [importTitle, setImportTitle] = useState('');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = archive.filter(record => {
      if (filter === 'favorites' && !record.favorite) return false;
      if (filter === 'archived' && !record.archived) return false;
      if (filter !== 'archived' && record.archived) return false;
      if ((filter === 'engine' || filter === 'two-player') && record.mode !== filter) return false;
      if (!needle) return true;
      return (
        record.title.toLowerCase().includes(needle) ||
        (record.smartName || '').toLowerCase().includes(needle) ||
        record.result.toLowerCase().includes(needle) ||
        (record.openingName || '').toLowerCase().includes(needle) ||
        record.pgn.toLowerCase().includes(needle)
      );
    });

    list.sort((a, b) => {
      if (sortBy === 'longest') return b.moveCount - a.moveCount;
      const ta = new Date(a.createdAt).getTime();
      const tb = new Date(b.createdAt).getTime();
      return sortBy === 'oldest' ? ta - tb : tb - ta;
    });
    return list;
  }, [archive, filter, query, sortBy]);

  const handleShareLink = async (record: ArchivedGame) => {
    const shareInfo = buildSafeSharePayload({
      pgn: record.pgn,
      startFen: record.startFen,
      fen: record.fen,
      title: record.title,
      notes: record.annotations || ''
    });

    if (!shareInfo.fitsInUrl || !shareInfo.url) {
      copyTextFallback(record.pgn);
      setNotice(shareInfo.fallbackReason || 'Game exceeds safe URL length; PGN text copied to clipboard instead.');
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: record.title,
          text: `${record.title} (${record.result})`,
          url: shareInfo.url
        });
        setNotice('Shared via native device share.');
        return;
      } catch (_e) {
        // Fall through to clipboard copy
      }
    }

    copyTextFallback(shareInfo.url);
    setNotice(`Compact share URL (${shareInfo.charLength} chars) copied to clipboard.`);
  };

  const handleCopyPositionLink = (record: ArchivedGame) => {
    const shareInfo = buildSafeSharePayload({
      pgn: record.pgn,
      startFen: record.startFen,
      fen: record.fen,
      title: record.title,
      notes: ''
    });
    copyTextFallback(shareInfo.positionUrl);
    setNotice('Position link (#fen=…) copied to clipboard.');
  };

  const handleCopyPgnText = (record: ArchivedGame) => {
    copyTextFallback(record.pgn || record.fen);
    setNotice('PGN text copied to clipboard.');
  };

  const handleImportSubmit = () => {
    const raw = importText.trim();
    if (!raw) return;

    if (raw.includes('#cathedral=') || raw.includes('#fen=') || raw.startsWith('cathedral=')) {
      const hashPart = raw.includes('#') ? '#' + raw.split('#')[1] : '#' + raw;
      const decoded = decodeGameFromUrlHash(hashPart);
      if (!decoded) {
        setNotice('Import failed: Shared link is invalid, corrupted, or exceeds safe size limits.');
        return;
      }
      if (decoded.pgn && decoded.pgn.trim()) {
        const res = importPgn(decoded.pgn, importTitle.trim() || decoded.title);
        if (res.ok) {
          setNotice(`Imported shared game "${decoded.title}".`);
          setImportText('');
          setImportTitle('');
        } else {
          setNotice(`Import error: ${res.error}`);
        }
      } else {
        const res = importFen(decoded.fen);
        setNotice(res.ok ? 'Imported shared FEN position.' : `Invalid FEN: ${res.error}`);
      }
      return;
    }

    if (!raw.includes('\n') && raw.split('/').length === 8) {
      const res = importFen(raw);
      if (res.ok) {
        setNotice('FEN position validated and loaded onto the board.');
        setImportText('');
        onNavigate?.('play');
      } else {
        setNotice(`FEN error: ${res.error}`);
      }
      return;
    }

    const res = importPgn(raw, importTitle.trim() || 'Imported PGN Match');
    if (res.ok) {
      setNotice('PGN game validated, imported, and saved to local library.');
      setImportText('');
      setImportTitle('');
      onNavigate?.('play');
    } else {
      setNotice(`PGN error: ${res.error}`);
    }
  };

  return (
    <section className="game-library-view" aria-label="Local Game Library, Video Export, and Sharing">
      <div className="panel-section">
        <div className="section-header">
          <span>Local Game Library, Smart Naming &amp; Video Export (IndexedDB + LocalStorage)</span>
          <span>{archive.length} saved games</span>
        </div>

        <p className="honest-disclaimer">
          Games are stored locally in your browser with smart sanitised filenames (`WizardChess_YYYY-MM-DD_White-vs-Opponent_Result`)
          and one-click WebM video export.
        </p>

        <div className="control-grid-4">
          <input
            className="library-search"
            value={query}
            placeholder="Search smart name, opening, result, or PGN…"
            onChange={e => setQuery(e.target.value)}
            aria-label="Search saved games"
          />

          <select value={filter} onChange={e => setFilter(e.target.value as typeof filter)} aria-label="Filter games">
            <option value="all">All Active Games</option>
            <option value="favorites">Favourites Only</option>
            <option value="engine">Vs Cathedral Engine</option>
            <option value="two-player">Local Two-Player</option>
            <option value="archived">Archived Games</option>
          </select>

          <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} aria-label="Sort games">
            <option value="newest">Sort: Newest First</option>
            <option value="oldest">Sort: Oldest First</option>
            <option value="longest">Sort: Most Plies</option>
          </select>

          <div className="control-row">
            <button type="button" className="nav-btn primary" onClick={() => saveCurrentGame()}>
              Save Current ({snapshot.moveCount} ply)
            </button>
            <button type="button" className="icon-btn" onClick={() => exportVideoForGame()}>
              Export Video
            </button>
            {archive.length > 0 && !confirmClearAll && (
              <button type="button" className="icon-btn danger" onClick={() => setConfirmClearAll(true)}>
                Clear All
              </button>
            )}
          </div>
        </div>

        {confirmClearAll && (
          <div className="inline-confirm-banner" role="alertdialog" aria-label="Confirm clearing all saved games">
            <span>Delete all {archive.length} saved games from local storage?</span>
            <div className="control-row">
              <button
                type="button"
                className="icon-btn danger"
                onClick={() => {
                  clearArchive();
                  setConfirmClearAll(false);
                  setNotice('All local saved games deleted.');
                }}
              >
                Confirm Delete All
              </button>
              <button type="button" className="icon-btn" onClick={() => setConfirmClearAll(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {notice && (
          <p className="save-toast" role="status">
            {notice}
          </p>
        )}
      </div>

      {/* Import PGN / FEN / Shared Link */}
      <div className="panel-section">
        <div className="section-header">
          <span>Import Shared Link, PGN, or FEN</span>
          <span>Untrusted input validated safely</span>
        </div>
        <div className="control-row">
          <input
            className="san-input"
            value={importTitle}
            placeholder="Optional game title…"
            onChange={e => setImportTitle(e.target.value)}
            aria-label="Imported game title"
          />
          <input
            className="library-search"
            style={{ flex: 2 }}
            value={importText}
            placeholder="Paste #cathedral=… URL, PGN moves, or FEN string…"
            onChange={e => setImportText(e.target.value)}
            aria-label="PGN, FEN, or Share URL to import"
          />
          <button type="button" className="nav-btn primary" onClick={handleImportSubmit} disabled={!importText.trim()}>
            Import &amp; Load
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="panel-section">
          <p className="text-muted">
            {archive.length === 0
              ? 'Your Game Library is empty. Play a match or import a PGN above to populate your archive.'
              : 'No saved games match the current filter.'}
          </p>
        </div>
      ) : (
        <ul className="library-list">
          {filtered.map(record => (
            <li key={record.id} className="library-item" data-current={record.id === sessionGameId || undefined}>
              <div className="library-item-main">
                <div className="library-title-row">
                  <button
                    type="button"
                    className={`star-btn ${record.favorite ? 'starred' : ''}`}
                    onClick={() => toggleFavoriteGame(record.id)}
                    title={record.favorite ? 'Remove from favourites' : 'Mark as favourite'}
                  >
                    {record.favorite ? 'Fav' : 'Fav'}
                  </button>
                  <strong className="library-title">{record.smartName || record.title}</strong>
                  <span className="library-result">{record.result}</span>
                </div>
                <span className="library-meta">
                  {record.mode === 'engine' ? `vs ${record.difficulty}` : 'Two Player'} · {record.moveCount} ply ·{' '}
                  {record.openingName ? `${record.openingName} · ` : ''}
                  {formatDate(record.createdAt)}
                </span>
                <code className="library-fen">{record.pgn || record.fen}</code>
              </div>

              <div className="library-item-actions">
                <button
                  type="button"
                  className="nav-btn primary"
                  onClick={() => {
                    openArchivedGame(record);
                    onNavigate?.('play');
                  }}
                >
                  Open &amp; Replay
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => exportVideoForGame(record)}
                  title="Render & download playable WebM replay video"
                >
                  Export Video
                </button>
                <button type="button" className="icon-btn" onClick={() => handleShareLink(record)}>
                  Share URL
                </button>
                <button type="button" className="icon-btn" onClick={() => handleCopyPositionLink(record)}>
                  Position Link
                </button>
                <button type="button" className="icon-btn" onClick={() => handleCopyPgnText(record)}>
                  Copy PGN
                </button>
                <button type="button" className="icon-btn" onClick={() => downloadPgn(record)}>
                  .PGN
                </button>
                <button type="button" className="icon-btn" onClick={() => toggleArchiveGame(record.id)}>
                  {record.archived ? 'Unarchive' : 'Archive'}
                </button>

                {confirmDeleteId === record.id ? (
                  <>
                    <button
                      type="button"
                      className="icon-btn danger"
                      onClick={() => {
                        removeArchivedGame(record.id);
                        setConfirmDeleteId(null);
                      }}
                    >
                      Confirm Delete
                    </button>
                    <button type="button" className="icon-btn" onClick={() => setConfirmDeleteId(null)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="icon-btn danger"
                    onClick={() => setConfirmDeleteId(record.id)}
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}