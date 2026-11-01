/**
 * Persistence Layer (IndexedDB Primary Store + LocalStorage Sync Cache, Smart Naming & Player Rating)
 * Implements:
 * - Schema-versioned IndexedDB (`wizards_chess_production_db`, v2) for games, reviews, and training runs
 * - Smart, sanitised default game naming (`WizardChess_YYYY-MM-DD_White-vs-Cathedral-Apex_Checkmate`)
 * - Folders (`All`, `Tournament`, `Study`, `Blunder Review`, `Casual`), tags, favourites, and backup export/import
 * - Fast synchronous localStorage cache with corruption recovery and quota fallback
 * - Honest Local Player ELO Rating & Calibration tracker
 */

const DB_NAME = 'wizards_chess_production_db';
const DB_VERSION = 2;
const SETTINGS_KEY = 'wizards_chess_cathedral_settings_v3';
const HISTORY_KEY = 'wizards_chess_cathedral_games_v3';
const LEGACY_HISTORY_KEY = 'wizards_chess_cathedral_games_v2';
const RATING_KEY = 'wizards_chess_local_rating_v1';
const ACTIVE_GAME_KEY = 'wizards_chess_active_game_v1';

export const BOARD_THEMES = ['classic-green', 'tournament-slate', 'woodland', 'high-contrast'];
export const UI_THEMES = ['dark', 'light'];
export const GAME_FOLDERS = ['General', 'Tournament', 'Study', 'Blunder Review', 'Casual'];

export const DEFAULT_SETTINGS = {
  schemaVersion: 3,
  difficulty: 'ClubPlayer',
  searchTimeMs: 900,
  superThinkingEnabled: false,
  superThinkingPreset: 'Balanced',
  useVariableNodeBudget: true,
  customNodeBudget: 500000,
  maxNodeRamMb: 500,
  customMaxDepth: 8,
  customTimeBudgetMs: 2500,
  ttMemoryMb: 16,
  multiPvCount: 2,
  resourceMode: 'desktop_balanced',
  activeModelId: 'cathedral-classical-v3',
  opponentDelayMs: 1500,
  boardTheme: 'classic-green',
  pieceStyle: 'neo',
  uiTheme: 'dark',
  colorBlindMode: false,
  useOpeningBook: true,
  showLegalMoves: true,
  showMoveHints: true,
  showCoordinates: true,
  soundEnabled: true,
  soundVolume: 75,
  soundMove: true,
  soundCapture: true,
  soundCheck: true,
  soundGameOver: true,
  animationsEnabled: true,
  animationSpeed: 'standard',
  showMoveTrails: true,
  reducedMotion: false,
  immersiveMode: false,
  videoExportResolution: 720,
  videoExportSpeedMs: 550,
  visualQuality: 'high',
  timeControl: 'untimed'
};

export const DEFAULT_PLAYER_RATING = {
  schemaVersion: 1,
  rating: 1200,
  rd: 140,
  gamesPlayed: 0,
  wins: 0,
  draws: 0,
  losses: 0,
  peakRating: 1200,
  lastUpdated: null,
  history: [],
  disclaimer:
    'Estimated local rating calculated from completed, unassisted games against calibrated Cathedral Engine levels. Not an official FIDE, USCF, or Chess.com rating.'
};

function sanitizeString(val, maxLen = 500) {
  if (typeof val !== 'string') return '';
  return val.replace(/[<>]/g, '').slice(0, maxLen);
}

/**
 * Generates an editable, filesystem-safe smart game name from real match metadata:
 * e.g. `WizardChess_2026-10-16_White-vs-Cathedral-Apex_Checkmate`
 */
export function generateSmartGameFilename({
  dateIso = new Date().toISOString(),
  playerColor = 'w',
  mode = 'engine',
  opponentName = 'Cathedral-ClubPlayer',
  result = 'In-Progress',
  openingEco = ''
} = {}) {
  const datePart = String(dateIso).slice(0, 10).replace(/[^0-9-]/g, '') || '2026-10-16';
  const sideLabel = playerColor === 'b' ? 'Black' : 'White';
  const oppClean = mode === 'two-player'
    ? 'TwoPlayer'
    : String(opponentName || 'Cathedral')
        .replace(/[^a-zA-Z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 28);

  let outcomeTag = 'InProgress';
  const resLower = String(result || '').toLowerCase();
  if (resLower.includes('checkmate')) outcomeTag = 'Checkmate';
  else if (resLower.includes('stalemate')) outcomeTag = 'Stalemate';
  else if (resLower.includes('repetition')) outcomeTag = 'RepetitionDraw';
  else if (resLower.includes('resign')) outcomeTag = 'Resignation';
  else if (resLower.includes('time') || resLower.includes('flag')) outcomeTag = 'TimeForfeit';
  else if (resLower.includes('draw')) outcomeTag = 'Draw';

  const ecoPart = openingEco ? `_${String(openingEco).replace(/[^a-zA-Z0-9]/g, '').slice(0, 6)}` : '';
  const rawName = `WizardChess_${datePart}_${sideLabel}-vs-${oppClean}${ecoPart}_${outcomeTag}`;
  return rawName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 96);
}

export function sanitizeFilename(name, fallback = 'WizardChess_Game') {
  if (typeof name !== 'string' || !name.trim()) return fallback;
  const cleaned = name
    .trim()
    .replace(/[/\\?%*:|"<>.,;=+]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 96);
  return cleaned || fallback;
}

export function validateGameRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.id !== 'string' || !raw.id.trim()) return null;
  if (typeof raw.fen !== 'string' || !raw.fen.trim()) return null;

  const createdAt = typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString();
  const mode = raw.mode === 'two-player' ? 'two-player' : 'engine';
  const humanColor = raw.humanColor === 'b' ? 'b' : 'w';
  const difficulty = sanitizeString(raw.difficulty || 'ClubPlayer', 40);
  const result = sanitizeString(raw.result || 'In progress', 80);
  const openingName = sanitizeString(raw.openingName || '', 80);
  const ecoMatch = openingName.match(/^([A-E][0-9]{2})/);

  const defaultSmartName = generateSmartGameFilename({
    dateIso: createdAt,
    playerColor: humanColor,
    mode,
    opponentName: `Cathedral-${difficulty}`,
    result,
    openingEco: ecoMatch ? ecoMatch[1] : ''
  });

  return {
    id: sanitizeString(raw.id, 64),
    title: sanitizeString(raw.title || defaultSmartName, 120),
    smartName: sanitizeFilename(raw.smartName || raw.title || defaultSmartName, defaultSmartName),
    folder: GAME_FOLDERS.includes(raw.folder) ? raw.folder : 'General',
    tags: Array.isArray(raw.tags)
      ? raw.tags.map(t => sanitizeString(String(t), 24)).filter(Boolean).slice(0, 8)
      : [],
    pgn: typeof raw.pgn === 'string' ? raw.pgn.slice(0, 50000) : '',
    startFen:
      typeof raw.startFen === 'string'
        ? raw.startFen.slice(0, 140)
        : 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    fen:
      typeof raw.fen === 'string'
        ? raw.fen.slice(0, 140)
        : 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    result,
    difficulty,
    modelId: sanitizeString(raw.modelId || 'cathedral-classical-v3', 64),
    engineVersion: sanitizeString(raw.engineVersion || 'Cathedral-3.1', 32),
    timeControl: sanitizeString(raw.timeControl || 'untimed', 32),
    openingName,
    mode,
    humanColor,
    moveCount: typeof raw.moveCount === 'number' && raw.moveCount >= 0 ? Math.floor(raw.moveCount) : 0,
    favorite: Boolean(raw.favorite),
    archived: Boolean(raw.archived),
    annotations: sanitizeString(raw.annotations || '', 1000),
    moveMeta: Array.isArray(raw.moveMeta) ? raw.moveMeta.slice(0, 500) : [],
    createdAt,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString()
  };
}

let dbPromise = null;

export function openDatabase() {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise(resolve => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = event => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('games')) {
          const store = db.createObjectStore('games', { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
        if (!db.objectStoreNames.contains('training')) {
          db.createObjectStore('training', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('models')) {
          db.createObjectStore('models', { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch (_e) {
      resolve(null);
    }
  });
  return dbPromise;
}

export async function syncGameToIndexedDB(record) {
  const valid = validateGameRecord(record);
  if (!valid) return false;
  const db = await openDatabase();
  if (!db) return false;
  return new Promise(resolve => {
    try {
      const tx = db.transaction('games', 'readwrite');
      tx.objectStore('games').put(valid);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch (_e) {
      resolve(false);
    }
  });
}

export async function removeGameFromIndexedDB(id) {
  const db = await openDatabase();
  if (!db) return false;
  return new Promise(resolve => {
    try {
      const tx = db.transaction('games', 'readwrite');
      tx.objectStore('games').delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch (_e) {
      resolve(false);
    }
  });
}

export async function loadAllGamesFromIndexedDB() {
  const db = await openDatabase();
  if (!db) return null;
  return new Promise(resolve => {
    try {
      const tx = db.transaction('games', 'readonly');
      const req = tx.objectStore('games').getAll();
      req.onsuccess = () => {
        const items = Array.isArray(req.result) ? req.result.map(validateGameRecord).filter(Boolean) : [];
        items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        resolve(items);
      };
      req.onerror = () => resolve(null);
    } catch (_e) {
      resolve(null);
    }
  });
}

export function loadSettings() {
  try {
    if (typeof localStorage === 'undefined') return { ...DEFAULT_SETTINGS };
    const raw =
      localStorage.getItem(SETTINGS_KEY) ||
      localStorage.getItem('wizards_chess_cathedral_settings_v2') ||
      localStorage.getItem('wizards_chess_cathedral_settings_v1');
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed, schemaVersion: 3 };
  } catch (_e) {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, ...settings, schemaVersion: 3 }));
    return true;
  } catch (_e) {
    return false;
  }
}

export function loadGameArchive() {
  try {
    if (typeof localStorage === 'undefined') return [];
    let raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) {
      raw = localStorage.getItem(LEGACY_HISTORY_KEY) || localStorage.getItem('wizards_chess_cathedral_games_v1');
    }
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(validateGameRecord).filter(Boolean);
  } catch (_e) {
    return [];
  }
}

export function saveGameToArchive(record) {
  const valid = validateGameRecord(record);
  if (!valid) return loadGameArchive();
  void syncGameToIndexedDB(valid);
  try {
    if (typeof localStorage === 'undefined') return [valid];
    const list = loadGameArchive();
    const idx = list.findIndex(g => g.id === valid.id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...valid, updatedAt: new Date().toISOString() };
    } else {
      list.unshift({
        ...valid,
        createdAt: valid.createdAt || new Date().toISOString()
      });
    }
    const trimmed = list.slice(0, 120);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
    return trimmed;
  } catch (_e) {
    return [];
  }
}

export function updateArchivedGameMeta(id, patch) {
  try {
    const list = loadGameArchive();
    const idx = list.findIndex(g => g.id === id);
    if (idx < 0) return list;
    const updated = validateGameRecord({
      ...list[idx],
      ...patch,
      updatedAt: new Date().toISOString()
    });
    if (!updated) return list;
    list[idx] = updated;
    void syncGameToIndexedDB(updated);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
    }
    return list;
  } catch (_e) {
    return loadGameArchive();
  }
}

export function deleteGameFromArchive(id) {
  void removeGameFromIndexedDB(id);
  try {
    if (typeof localStorage === 'undefined') return [];
    const list = loadGameArchive().filter(g => g.id !== id);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
    return list;
  } catch (_e) {
    return [];
  }
}

export function clearAllArchivedGames() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(HISTORY_KEY);
      localStorage.removeItem(LEGACY_HISTORY_KEY);
      localStorage.removeItem('wizards_chess_cathedral_games_v1');
    }
    void openDatabase().then(db => {
      if (!db) return;
      const tx = db.transaction('games', 'readwrite');
      tx.objectStore('games').clear();
    });
    return [];
  } catch (_e) {
    return [];
  }
}

export function saveActiveGameSnapshot(snapshotData) {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(ACTIVE_GAME_KEY, JSON.stringify(snapshotData));
    return true;
  } catch (_e) {
    return false;
  }
}

export function loadActiveGameSnapshot() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(ACTIVE_GAME_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_e) {
    return null;
  }
}

export function loadPlayerRating() {
  try {
    if (typeof localStorage === 'undefined') return { ...DEFAULT_PLAYER_RATING };
    const raw = localStorage.getItem(RATING_KEY);
    if (!raw) return { ...DEFAULT_PLAYER_RATING };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_PLAYER_RATING,
      ...parsed,
      history: Array.isArray(parsed.history) ? parsed.history.slice(-50) : []
    };
  } catch (_e) {
    return { ...DEFAULT_PLAYER_RATING };
  }
}

export function updatePlayerRating({
  opponentId,
  opponentRating,
  outcome,
  usedHints = false,
  usedTakeback = false,
  plies = 0
}) {
  const current = loadPlayerRating();
  if (usedTakeback || plies < 4) {
    return { ...current, lastGameEligible: false };
  }

  const actualScore = outcome === 'win' ? 1.0 : outcome === 'draw' ? 0.5 : 0.0;
  const oppElo = typeof opponentRating === 'number' ? opponentRating : 1400;
  const expectedScore = 1 / (1 + Math.pow(10, (oppElo - current.rating) / 400));
  const baseK = current.gamesPlayed < 15 ? 32 : 20;
  const effectiveK = usedHints ? Math.round(baseK * 0.5) : baseK;
  const delta = Math.round(effectiveK * (actualScore - expectedScore));
  const nextRating = Math.max(400, Math.min(2800, current.rating + delta));
  const nextRd = Math.max(45, Math.round(current.rd * 0.94));

  const updated = {
    ...current,
    rating: nextRating,
    rd: nextRd,
    gamesPlayed: current.gamesPlayed + 1,
    wins: current.wins + (outcome === 'win' ? 1 : 0),
    draws: current.draws + (outcome === 'draw' ? 1 : 0),
    losses: current.losses + (outcome === 'loss' ? 1 : 0),
    peakRating: Math.max(current.peakRating, nextRating),
    lastUpdated: new Date().toISOString(),
    lastDelta: delta,
    lastGameEligible: true,
    history: [
      ...current.history.slice(-49),
      {
        timestamp: new Date().toISOString(),
        rating: nextRating,
        delta,
        opponentId,
        opponentRating: oppElo,
        outcome
      }
    ]
  };

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(RATING_KEY, JSON.stringify(updated));
    }
  } catch (_e) {
    // Ignore storage quota errors
  }
  return updated;
}
