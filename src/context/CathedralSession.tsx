'use client';

/**
 * Cathedral Session (`CathedralSession.tsx`)
 *
 * Single authoritative state orchestrator for the live match, 2D board interactions,
 * smooth L-shaped Knight & sliding piece animations, configurable 1.5s opponent delay,
 * Super Thinking Mode (up to 50M nodes, depth 24, MultiPV, TT memory), pluggable neural/hybrid
 * Model Studio evaluator, atomic pawn promotion, undo/redo, move-by-move replay, 5-tier hints,
 * 11-layer X-Ray, Fullscreen Arena mode, Replay Video Export, and IndexedDB + localStorage persistence.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';

import { createEngineClient, type EngineClient, type EngineProgress, type EngineResult } from '../lib/engineClient';
import { configureSound, playCue } from '../lib/sound';
import {
  BUILTIN_MODELS,
  DEFAULT_START_FEN,
  allLegalMoves,
  computeMoveAnimationPlan,
  createClock,
  createGame,
  describeGameOver,
  exportGameReplayVideo,
  findKingSquare,
  generateSmartGameFilename,
  legalMovesFrom,
  loadUserModels,
  moveReview,
  validateFen,
  type BoardCell,
  type CapturedSummary,
  type CathedralGame,
  type CathedralGameClock,
  type ClockState,
  type GameReviewSummary,
  type ModelArtifact,
  type MoveAnimationPlan,
  type MoveClassification,
  type OpeningEntry,
  type PieceType,
  type PlayerColor,
  type ProgressiveHintsResult,
  type VerboseMove
} from '../lib/cathedral';
import { resolveDifficultyPreset, SUPER_THINKING_PRESETS } from '../engine/CathedralEngine.js';
import { ANIMATION_SPEED_PRESETS } from '../game/moveAnimation.js';
import { loadLearningState } from '../learning/learningEngine.js';
import {
  DEFAULT_PLAYER_RATING,
  DEFAULT_SETTINGS,
  clearAllArchivedGames,
  deleteGameFromArchive,
  loadActiveGameSnapshot,
  loadAllGamesFromIndexedDB,
  loadGameArchive,
  loadPlayerRating,
  loadSettings,
  saveActiveGameSnapshot,
  saveGameToArchive,
  saveSettings,
  updateArchivedGameMeta,
  updatePlayerRating
} from '../persistence/storage.js';
import { decodeGameFromUrlHash } from '../sharing/shareUrl.js';
import { DEFAULT_XRAY_CONFIG } from '../xray/xrayEngine.js';

export type { PlayerColor } from '../lib/cathedral';

export type PlayMode = 'engine' | 'two-player';
export type VisualQuality = 'low' | 'medium' | 'high';
export type BoardTheme = 'classic-green' | 'tournament-slate' | 'woodland' | 'high-contrast';
export type PieceStyle = 'neo' | 'wood' | 'glass';
export type UiTheme = 'dark' | 'light';

export type PrimaryView = 'home' | 'play' | 'analysis' | 'models' | 'training' | 'library' | 'settings';

export interface Settings {
  schemaVersion?: number;
  difficulty: string;
  searchTimeMs: number;
  boardTheme: BoardTheme;
  pieceStyle: PieceStyle;
  uiTheme: UiTheme;
  colorBlindMode: boolean;
  useOpeningBook: boolean;
  showLegalMoves: boolean;
  showMoveHints: boolean;
  showCoordinates: boolean;
  soundEnabled: boolean;
  soundVolume: number;
  soundMove: boolean;
  soundCapture: boolean;
  soundCheck: boolean;
  soundGameOver: boolean;
  animationsEnabled: boolean;
  animationSpeed: 'fast' | 'standard' | 'cinematic' | 'off';
  showMoveTrails: boolean;
  reducedMotion: boolean;
  opponentDelayMs: number;
  useVariableNodeBudget?: boolean;
  superThinkingEnabled: boolean;
  superThinkingPreset: string;
  customNodeBudget: number;
  maxNodeRamMb?: number;
  customMaxDepth: number;
  customTimeBudgetMs: number;
  ttMemoryMb: number;
  multiPvCount: number;
  activeModelId: string;
  videoExportResolution: number;
  videoExportSpeedMs: number;
  visualQuality: VisualQuality;
  timeControl: string;
}

export interface MoveMeta {
  san: string;
  lan?: string;
  byPlayer: PlayerColor;
  scoreWhiteCp?: number | null;
  bestSan?: string | null;
  depth?: number;
  classification: MoveClassification | null;
}

export interface ArchivedGame {
  id: string;
  title: string;
  smartName?: string;
  pgn: string;
  startFen: string;
  fen: string;
  result: string;
  difficulty: string;
  engineVersion?: string;
  timeControl?: string;
  openingName?: string;
  mode: PlayMode;
  humanColor: PlayerColor;
  moveCount: number;
  favorite?: boolean;
  archived?: boolean;
  annotations?: string;
  moveMeta?: MoveMeta[];
  createdAt: string;
  updatedAt?: string;
}

export interface TerminalState {
  label: string;
  loser: PlayerColor | null;
  draw: boolean;
}

export interface SessionSnapshot {
  fen: string;
  startFen: string;
  turn: PlayerColor;
  sanHistory: string[];
  verboseHistory: VerboseMove[];
  moveCount: number;
  canRedo: boolean;
  lastMove: VerboseMove | null;
  checkSquare: string | null;
  inCheck: boolean;
  board: (BoardCell | null)[][];
  captured: CapturedSummary;
  displayedPly: number;
  isViewingHistory: boolean;
}

export interface XRayLayerConfig {
  enabled: boolean;
  attackedSquares: boolean;
  defendedPieces: boolean;
  hangingPieces: boolean;
  pinsAndDiscovered: boolean;
  forksAndSkewers: boolean;
  overloadedDefenders: boolean;
  kingThreats: boolean;
  candidateMoves: boolean;
  pvArrows: boolean;
  predictedReplies: boolean;
  preMoveWarnings: boolean;
  attackMap: boolean;
  vulnerable: boolean;
  kingSafety: boolean;
  motifs: boolean;
  prediction: boolean;
}

export const DEFAULT_XRAY_LAYERS: XRayLayerConfig = {
  ...(DEFAULT_XRAY_CONFIG as XRayLayerConfig)
};

export interface PlayerRatingState {
  rating: number;
  rd: number;
  gamesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  peakRating: number;
  lastUpdated: string | null;
  lastDelta?: number;
  lastGameEligible?: boolean;
  history: {
    timestamp: string;
    rating: number;
    delta: number;
    opponentId: string;
    opponentRating: number;
    outcome: 'win' | 'draw' | 'loss';
  }[];
  disclaimer: string;
}

export interface PendingPromotion {
  from: string;
  to: string;
  color: PlayerColor;
  isCapture: boolean;
  capturedPiece?: PieceType;
}

export interface VideoModalState {
  running: boolean;
  pct: number;
  ply: number;
  totalPlies: number;
  url: string | null;
  filename: string;
  sizeBytes: number;
  frameCount: number;
  error: string | null;
}

type SearchReason = 'reply' | 'analysis' | 'super_think';

interface BaselineEvaluation {
  fen: string;
  whiteCp: number;
  depth: number;
  bestSan: string | null;
  pv: string[];
}

export interface SessionApi {
  mounted: boolean;
  transport: 'worker' | 'main-thread' | 'pending';

  gameHandle: { current: CathedralGame | null };
  displayedGame: CathedralGame;

  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  activeModel: ModelArtifact;

  snapshot: SessionSnapshot;
  opening: OpeningEntry | null;
  moveMeta: MoveMeta[];
  reviewSummary: GameReviewSummary;
  terminal: TerminalState | null;

  selectedSquare: string | null;
  selectionMoves: VerboseMove[];
  clickSquare: (square: string) => void;
  attemptMove: (from: string, to: string, explicitPromotion?: PieceType) => boolean;
  clearSelection: () => void;

  activeMovePlan: MoveAnimationPlan | null;
  triggerDemoKnightAnimation: () => void;

  playMove: (move: VerboseMove) => boolean;
  playSan: (san: string) => boolean;
  importFen: (fen: string) => { ok: boolean; error: string | null };
  importPgn: (pgn: string, title?: string) => { ok: boolean; error: string | null };

  pendingPromotion: PendingPromotion | null;
  resolvePromotion: (piece: 'q' | 'r' | 'b' | 'n') => void;
  cancelPromotion: () => void;

  mode: PlayMode;
  setMode: (mode: PlayMode) => void;
  humanColor: PlayerColor;
  setHumanColor: (color: PlayerColor) => void;

  boardFlipped: boolean;
  flipBoard: () => void;
  isFullscreenBoard: boolean;
  toggleFullscreenBoard: (force?: boolean) => void;

  newGame: (options?: { color?: PlayerColor | 'random'; difficulty?: string; mode?: PlayMode; startFen?: string }) => void;
  undoMove: () => void;
  redoMove: () => void;
  resign: () => void;

  replayPly: number | null;
  goToPly: (ply: number | null) => void;
  stepFirst: () => void;
  stepPrev: () => void;
  stepNext: () => void;
  stepLast: () => void;
  autoReplay: boolean;
  toggleAutoReplay: () => void;
  autoReplaySpeedMs: number;
  setAutoReplaySpeedMs: (ms: number) => void;

  hintTier: 0 | 1 | 2 | 3 | 4 | 5;
  setHintTier: (tier: 0 | 1 | 2 | 3 | 4 | 5) => void;
  progressiveHints: ProgressiveHintsResult;
  hintMove: VerboseMove | null;
  requestHint: () => void;
  clearHint: () => void;
  resignable: boolean;

  lastHumanMove: VerboseMove | null;

  clock: ClockState;
  clockLabel: (side: PlayerColor) => string;

  engineThinking: boolean;
  delayWaiting: boolean;
  skipDelayNow: () => void;
  engineProgress: EngineProgress | null;
  engineResult: EngineResult | null;
  engineError: string | null;
  bestLine: string[];
  bestLineEval: number | null;
  stopEngine: () => void;
  triggerSuperThink: () => void;

  xrayLayers: XRayLayerConfig;
  setXrayLayer: (patch: Partial<XRayLayerConfig>) => void;

  playerRating: PlayerRatingState;

  archive: ArchivedGame[];
  sessionGameId: string | null;
  saveCurrentGame: (customTitle?: string, customNotes?: string) => ArchivedGame;
  openArchivedGame: (record: ArchivedGame) => boolean;
  toggleFavoriteGame: (id: string) => void;
  toggleArchiveGame: (id: string) => void;
  updateGameNotes: (id: string, notes: string) => void;
  removeArchivedGame: (id: string) => void;
  clearArchive: () => void;
  refreshArchive: () => void;

  videoModal: VideoModalState | null;
  exportVideoForGame: (record?: ArchivedGame) => void;
  cancelVideoExport: () => void;
  closeVideoModal: () => void;
}

const SessionContext = createContext<SessionApi | null>(null);

const IDLE_CLOCK: ClockState = {
  enabled: false,
  presetId: 'untimed',
  w: 0,
  b: 0,
  activeSide: null,
  timedOutSide: null
};

function buildSnapshot(game: CathedralGame, startFen: string, replayPly: number | null): SessionSnapshot {
  const sanHistory = game.history() as string[];
  const verbose = game.history({ verbose: true }) as VerboseMove[];
  const totalPlies = sanHistory.length;
  const effectivePly = replayPly !== null ? Math.max(0, Math.min(totalPlies, replayPly)) : totalPlies;
  const isViewingHistory = effectivePly < totalPlies;
  const viewGame = isViewingHistory ? game.getPositionAtPly(effectivePly) : game;
  const turn = viewGame.turn();
  const inCheck = viewGame.in_check();
  const viewVerbose = verbose.slice(0, effectivePly);

  return {
    fen: viewGame.fen(),
    startFen,
    turn,
    sanHistory,
    verboseHistory: verbose,
    moveCount: totalPlies,
    canRedo: game.canRedo(),
    lastMove: viewVerbose.length > 0 ? viewVerbose[viewVerbose.length - 1] : null,
    checkSquare: inCheck ? findKingSquare(viewGame, turn) : null,
    inCheck,
    board: viewGame.board(),
    captured: game.getCapturedPieces(effectivePly),
    displayedPly: effectivePly,
    isViewingHistory
  };
}

function newId(): string {
  return `gm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function loadChampionParams(): Record<string, number> | null {
  if (typeof window === 'undefined') return null;
  try {
    const state = loadLearningState() as { championParams?: Record<string, number> };
    return state?.championParams ?? null;
  } catch (_err) {
    return null;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const gameRef = useRef<CathedralGame | null>(null);
  if (gameRef.current === null) gameRef.current = createGame();

  const clockRef = useRef<CathedralGameClock | null>(null);
  const engineRef = useRef<EngineClient | null>(null);
  const startFenRef = useRef<string>(DEFAULT_START_FEN);
  const sessionIdRef = useRef<string>(newId());
  const moveMetaRef = useRef<MoveMeta[]>([]);
  const baselineRef = useRef<BaselineEvaluation | null>(null);
  const searchTokenRef = useRef(0);
  const thinkingRef = useRef(false);
  const terminalRef = useRef<TerminalState | null>(null);
  const lastHumanMoveRef = useRef<VerboseMove | null>(null);
  const modeRef = useRef<PlayMode>('engine');
  const humanColorRef = useRef<PlayerColor>('w');
  const pendingPromotionRef = useRef<PendingPromotion | null>(null);
  const usedHintsRef = useRef(false);
  const usedTakebackRef = useRef(false);
  const ratingUpdatedForGameRef = useRef(false);
  const replayPlyRef = useRef<number | null>(null);
  const pendingDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trailClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoAbortRef = useRef<AbortController | null>(null);

  const [mounted, setMounted] = useState(false);
  const [transport, setTransport] = useState<SessionApi['transport']>('pending');
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS as Settings);
  const [replayPly, setReplayPly] = useState<number | null>(null);
  const [autoReplay, setAutoReplay] = useState(false);
  const [autoReplaySpeedMs, setAutoReplaySpeedMs] = useState(900);
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(() =>
    buildSnapshot(gameRef.current!, startFenRef.current, null)
  );
  const [moveMeta, setMoveMeta] = useState<MoveMeta[]>([]);
  const [terminal, setTerminal] = useState<TerminalState | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [selectionMoves, setSelectionMoves] = useState<VerboseMove[]>([]);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const [mode, setModeState] = useState<PlayMode>('engine');
  const [humanColor, setHumanColorState] = useState<PlayerColor>('w');
  const [boardFlipped, setBoardFlipped] = useState(false);
  const [isFullscreenBoard, setIsFullscreenBoard] = useState(false);
  const [activeMovePlan, setActiveMovePlan] = useState<MoveAnimationPlan | null>(null);
  const [clock, setClock] = useState<ClockState>(IDLE_CLOCK);
  const [engineThinking, setEngineThinking] = useState(false);
  const [delayWaiting, setDelayWaiting] = useState(false);
  const [engineProgress, setEngineProgress] = useState<EngineProgress | null>(null);
  const [engineResult, setEngineResult] = useState<EngineResult | null>(null);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [bestLine, setBestLine] = useState<string[]>([]);
  const [bestLineEval, setBestLineEval] = useState<number | null>(null);
  const [hintTier, setHintTier] = useState<0 | 1 | 2 | 3 | 4 | 5>(0);
  const [lastHumanMove, setLastHumanMove] = useState<VerboseMove | null>(null);
  const [xrayLayers, setXrayLayers] = useState<XRayLayerConfig>(DEFAULT_XRAY_LAYERS);
  const [archive, setArchive] = useState<ArchivedGame[]>([]);
  const [sessionGameId, setSessionGameId] = useState<string | null>(null);
  const [playerRating, setPlayerRating] = useState<PlayerRatingState>(DEFAULT_PLAYER_RATING as PlayerRatingState);
  const [videoModal, setVideoModal] = useState<VideoModalState | null>(null);

  const activeModel = useMemo<ModelArtifact>(() => {
    const userModels = typeof window !== 'undefined' ? loadUserModels() : [];
    const all = [...BUILTIN_MODELS, ...userModels];
    return all.find(m => m.id === settings.activeModelId) || BUILTIN_MODELS[0];
  }, [settings.activeModelId]);

  const setPendingPromotionSynced = useCallback((val: PendingPromotion | null) => {
    pendingPromotionRef.current = val;
    setPendingPromotion(val);
  }, []);

  const clearPendingDelay = useCallback(() => {
    if (pendingDelayTimerRef.current) {
      clearTimeout(pendingDelayTimerRef.current);
      pendingDelayTimerRef.current = null;
    }
    setDelayWaiting(false);
  }, []);

  const scheduleMoveAnimation = useCallback(
    (moveVerbose: VerboseMove | null) => {
      if (!moveVerbose || settings.reducedMotion || !settings.animationsEnabled) {
        setActiveMovePlan(null);
        return;
      }
      const speedId = settings.animationSpeed || 'standard';
      const durationMs =
        (ANIMATION_SPEED_PRESETS as Record<string, { durationMs: number }>)[speedId]?.durationMs ?? 260;
      if (durationMs <= 0) {
        setActiveMovePlan(null);
        return;
      }
      const plan = computeMoveAnimationPlan(moveVerbose, {
        boardFlipped,
        reducedMotion: settings.reducedMotion,
        durationMs
      });
      setActiveMovePlan(plan);
      if (trailClearTimerRef.current) clearTimeout(trailClearTimerRef.current);
      if (plan) {
        trailClearTimerRef.current = setTimeout(() => {
          setActiveMovePlan(null);
        }, plan.trailDurationMs);
      }
    },
    [boardFlipped, settings.animationSpeed, settings.animationsEnabled, settings.reducedMotion]
  );

  const triggerDemoKnightAnimation = useCallback(() => {
    const demoMove: VerboseMove = {
      from: 'g1',
      to: 'f3',
      piece: 'n',
      color: 'w',
      flags: 'n',
      san: 'Nf3',
      lan: 'g1f3'
    };
    const plan = computeMoveAnimationPlan(demoMove, {
      boardFlipped,
      reducedMotion: false,
      durationMs: 420
    });
    setActiveMovePlan(plan);
    if (trailClearTimerRef.current) clearTimeout(trailClearTimerRef.current);
    trailClearTimerRef.current = setTimeout(() => setActiveMovePlan(null), 1600);
  }, [boardFlipped]);

  const toggleFullscreenBoard = useCallback((force?: boolean) => {
    setIsFullscreenBoard(prev => {
      const next = typeof force === 'boolean' ? force : !prev;
      try {
        if (next && document.documentElement.requestFullscreen && !document.fullscreenElement) {
          void document.documentElement.requestFullscreen().catch(() => {});
        } else if (!next && document.fullscreenElement && document.exitFullscreen) {
          void document.exitFullscreen().catch(() => {});
        }
      } catch (_e) {}
      return next;
    });
  }, []);

  const refresh = useCallback((customReplayPly?: number | null) => {
    const effectiveReplay = customReplayPly !== undefined ? customReplayPly : replayPlyRef.current;
    const live = gameRef.current!;
    const snap = buildSnapshot(live, startFenRef.current, effectiveReplay);
    setSnapshot(snap);
    setMoveMeta([...moveMetaRef.current]);
    saveActiveGameSnapshot({
      id: sessionIdRef.current,
      pgn: live.pgn(),
      startFen: startFenRef.current,
      fen: live.fen(),
      mode: modeRef.current,
      humanColor: humanColorRef.current,
      moveMeta: moveMetaRef.current
    });
  }, []);

  const refreshArchive = useCallback(() => {
    setArchive(loadGameArchive() as ArchivedGame[]);
    void loadAllGamesFromIndexedDB().then(items => {
      if (items && items.length > 0) {
        setArchive(items as ArchivedGame[]);
      }
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedSquare(null);
    setSelectionMoves([]);
  }, []);

  const stopEngine = useCallback(() => {
    searchTokenRef.current += 1;
    thinkingRef.current = false;
    clearPendingDelay();
    engineRef.current?.requestStop();
    setEngineThinking(false);
    setEngineProgress(null);
  }, [clearPendingDelay]);

  const resetTerminal = useCallback(() => {
    terminalRef.current = null;
    setTerminal(null);
  }, []);

  const clearLastHumanMove = useCallback(() => {
    lastHumanMoveRef.current = null;
    setLastHumanMove(null);
  }, []);

  const recordTerminalAndRating = useCallback(
    (term: TerminalState) => {
      terminalRef.current = term;
      setTerminal(term);
      clockRef.current?.stop();

      const live = gameRef.current!;
      const openingEntry = moveReview.detectOpening(live.history() as string[]);
      const smartName = generateSmartGameFilename({
        playerColor: humanColorRef.current,
        mode: modeRef.current,
        opponentName: `Cathedral-${settings.difficulty}`,
        result: term.label
      });

      const record: ArchivedGame = {
        id: sessionIdRef.current,
        title: `${modeRef.current === 'engine' ? `vs ${settings.difficulty}` : 'Two Player'} · ${live.history().length} ply`,
        smartName,
        pgn: live.pgn(),
        startFen: startFenRef.current,
        fen: live.fen(),
        result: term.label,
        difficulty: settings.difficulty,
        engineVersion: 'Cathedral-3.1',
        timeControl: settings.timeControl,
        openingName: openingEntry ? `${openingEntry.eco} ${openingEntry.name}` : '',
        mode: modeRef.current,
        humanColor: humanColorRef.current,
        moveCount: live.history().length,
        moveMeta: moveMetaRef.current,
        createdAt: new Date().toISOString()
      };
      saveGameToArchive(record);
      setSessionGameId(record.id);
      refreshArchive();

      if (modeRef.current === 'engine' && !ratingUpdatedForGameRef.current) {
        ratingUpdatedForGameRef.current = true;
        const preset = resolveDifficultyPreset(settings.difficulty) as { id: string; estimatedRating: number };
        const outcome: 'win' | 'draw' | 'loss' = term.draw
          ? 'draw'
          : term.loser === humanColorRef.current
          ? 'loss'
          : 'win';
        const nextRating = updatePlayerRating({
          opponentId: preset.id,
          opponentRating: preset.estimatedRating,
          outcome,
          usedHints: usedHintsRef.current,
          usedTakeback: usedTakebackRef.current,
          plies: live.history().length
        });
        setPlayerRating(nextRating as PlayerRatingState);
      }
    },
    [refreshArchive, settings.difficulty, settings.timeControl]
  );

  const applyClassification = useCallback((searchedFen: string, result: EngineResult) => {
    const baseline = baselineRef.current;
    const meta = moveMetaRef.current;
    const lastIndex = meta.length - 1;

    if (baseline && lastIndex >= 0 && meta[lastIndex].classification === null) {
      const played = meta[lastIndex];
      const moverIsWhite = played.byPlayer === 'w';
      const bestForMover = moverIsWhite ? baseline.whiteCp : -baseline.whiteCp;
      const playedForMover = moverIsWhite ? result.scoreWhiteCp : -result.scoreWhiteCp;
      const classification = moveReview.classifyPlayedMove({
        playedSan: played.san,
        bestSan: baseline.bestSan,
        bestScoreForMoverCp: bestForMover,
        playedScoreForMoverCp: playedForMover,
        searchDepth: baseline.depth
      });
      moveMetaRef.current = meta.map((m, i) =>
        i === lastIndex
          ? {
              ...m,
              classification,
              scoreWhiteCp: result.scoreWhiteCp,
              bestSan: baseline.bestSan,
              depth: result.depth
            }
          : m
      );
      setMoveMeta([...moveMetaRef.current]);
    } else if (lastIndex >= 0 && meta[lastIndex].scoreWhiteCp === undefined) {
      moveMetaRef.current = meta.map((m, i) =>
        i === lastIndex ? { ...m, scoreWhiteCp: result.scoreWhiteCp, depth: result.depth } : m
      );
      setMoveMeta([...moveMetaRef.current]);
    }

    baselineRef.current = {
      fen: searchedFen,
      whiteCp: result.scoreWhiteCp,
      depth: result.depth,
      bestSan: result.bestMoveSan,
      pv: result.pv ?? []
    };
  }, []);

  const handClockTo = useCallback((nextSide: PlayerColor) => {
    const clockInstance = clockRef.current;
    if (!clockInstance) return;
    clockInstance.start(nextSide);
    setClock(clockInstance.getState());
  }, []);

  const applyEngineReplyImmediate = useCallback(
    (result: EngineResult, searchedFen: string, searchedTurn: PlayerColor) => {
      const liveGame = gameRef.current!;
      if (
        modeRef.current !== 'engine' ||
        liveGame.turn() === humanColorRef.current ||
        liveGame.turn() !== searchedTurn ||
        liveGame.fen() !== searchedFen ||
        pendingPromotionRef.current
      ) {
        return;
      }

      const moveInput = result.bestMove
        ? {
            from: result.bestMove.from,
            to: result.bestMove.to,
            promotion: result.bestMove.promotion || undefined
          }
        : result.bestMoveSan;

      if (!moveInput) return;
      const applied = liveGame.move(moveInput);
      if (!applied) {
        setEngineError('Engine returned an invalid move; board preserved.');
        return;
      }
      scheduleMoveAnimation(applied);
      moveMetaRef.current = [
        ...moveMetaRef.current,
        {
          san: applied.san,
          lan: applied.lan,
          byPlayer: applied.color,
          scoreWhiteCp: result.scoreWhiteCp,
          bestSan: applied.san,
          depth: result.depth,
          classification: null
        }
      ];
      handClockTo(applied.color === 'w' ? 'b' : 'w');
      playCue(applied.captured ? 'capture' : applied.promotion ? 'promote' : 'move');
      refresh();
      if (liveGame.in_check()) playCue('check');
      if (liveGame.isGameOver()) {
        playCue('gameover');
        const label = describeGameOver(liveGame) ?? 'Game over';
        const isDraw = liveGame.isDraw();
        const loser: PlayerColor | null = isDraw ? null : liveGame.turn();
        recordTerminalAndRating({ label, loser, draw: isDraw });
      }
    },
    [handClockTo, recordTerminalAndRating, refresh, scheduleMoveAnimation]
  );

  const skipDelayNow = useCallback(() => {
    if (!delayWaiting || !engineResult) return;
    clearPendingDelay();
    const liveGame = gameRef.current!;
    applyEngineReplyImmediate(engineResult, liveGame.fen(), liveGame.turn());
  }, [applyEngineReplyImmediate, clearPendingDelay, delayWaiting, engineResult]);

  const runSearch = useCallback(
    (reason: SearchReason) => {
      const engine = engineRef.current;
      if (!engine) return;

      const liveGame = gameRef.current!;
      if (liveGame.isGameOver() || terminalRef.current || pendingPromotionRef.current) return;
      if (replayPlyRef.current !== null && replayPlyRef.current < (liveGame.history() as string[]).length) {
        return;
      }

      clearPendingDelay();
      if (thinkingRef.current) {
        searchTokenRef.current += 1;
        engine.requestStop();
        thinkingRef.current = false;
      }

      const searchedFen = liveGame.fen();
      const searchedTurn = liveGame.turn();
      const token = ++searchTokenRef.current;
      const searchStartTs = performance.now();
      thinkingRef.current = true;
      setEngineThinking(true);
      setEngineError(null);
      setEngineProgress(null);

      const evalParams =
        settings.difficulty === 'Experimental'
          ? loadChampionParams()
          : (activeModel.evalParams ?? null);

      const stPresetId = settings.superThinkingPreset || 'Balanced';
      const stPreset =
        (SUPER_THINKING_PRESETS as Record<string, { maxDepth: number; nodeLimit: number; timeLimitMs: number; ttMemoryMb: number; multiPv: number }>)[stPresetId] ||
        SUPER_THINKING_PRESETS.Balanced;
      const useSuper =
        reason === 'super_think' ||
        settings.superThinkingEnabled ||
        stPresetId === 'SuperThinking' ||
        stPresetId === 'Custom' ||
        stPresetId === 'Deep';
      const useVarNodes = settings.useVariableNodeBudget !== false || useSuper;
      const maxRamMb = Math.max(1, Math.min(500, settings.maxNodeRamMb || 500));
      const maxAllowedNodes = Math.floor((maxRamMb * 1024 * 1024) / 20);
      const effectiveNodeLimit = useVarNodes
        ? Math.max(20, Math.min(maxAllowedNodes, settings.customNodeBudget || stPreset.nodeLimit))
        : undefined;

      engine.search(
        searchedFen,
        {
          difficulty: reason === 'super_think' ? 'Analysis' : settings.difficulty,
          maxDepth: useSuper ? (settings.customMaxDepth || stPreset.maxDepth) : undefined,
          nodeLimit: effectiveNodeLimit,
          maxNodeRamMb: maxRamMb,
          timeLimitMs: useSuper
            ? (settings.customTimeBudgetMs || stPreset.timeLimitMs)
            : settings.searchTimeMs,
          ttMemoryMb: settings.ttMemoryMb || 16,
          useOpeningBook: reason === 'super_think' ? false : settings.useOpeningBook,
          multiPv: reason === 'reply' ? 1 : (settings.multiPvCount || 3),
          hashHistory: liveGame.hashHistory,
          evalParams,
          modelArtifact: activeModel
        },
        {
          onProgress: progress => {
            if (token !== searchTokenRef.current) return;
            setEngineProgress(progress);
          },
          onResult: result => {
            if (token !== searchTokenRef.current) return;
            thinkingRef.current = false;
            setEngineThinking(false);
            setEngineProgress(null);

            if (liveGame.fen() !== searchedFen || pendingPromotionRef.current) return;

            setEngineResult(result);
            applyClassification(searchedFen, result);

            if (reason === 'reply') {
              const configuredDelayMs = Math.max(0, Number(settings.opponentDelayMs ?? 1500));
              const elapsedMs = performance.now() - searchStartTs;
              const remainingWaitMs = Math.max(0, configuredDelayMs - elapsedMs);

              if (remainingWaitMs > 30) {
                setDelayWaiting(true);
                pendingDelayTimerRef.current = setTimeout(() => {
                  if (token !== searchTokenRef.current) return;
                  setDelayWaiting(false);
                  pendingDelayTimerRef.current = null;
                  applyEngineReplyImmediate(result, searchedFen, searchedTurn);
                }, remainingWaitMs);
              } else {
                applyEngineReplyImmediate(result, searchedFen, searchedTurn);
              }
            } else {
              setBestLine(result.pv ?? []);
              setBestLineEval(result.scoreWhiteCp);
            }
          },
          onError: message => {
            if (token !== searchTokenRef.current) return;
            thinkingRef.current = false;
            setEngineThinking(false);
            setEngineError(message);
          }
        }
      );
    },
    [
      activeModel,
      applyClassification,
      applyEngineReplyImmediate,
      clearPendingDelay,
      settings.customMaxDepth,
      settings.customNodeBudget,
      settings.customTimeBudgetMs,
      settings.difficulty,
      settings.multiPvCount,
      settings.opponentDelayMs,
      settings.searchTimeMs,
      settings.superThinkingEnabled,
      settings.superThinkingPreset,
      settings.ttMemoryMb,
      settings.useOpeningBook
    ]
  );

  const triggerSuperThink = useCallback(() => {
    runSearch('super_think');
  }, [runSearch]);

  const commitMove = useCallback(
    (moveInput: VerboseMove | { from: string; to: string; promotion?: string }) => {
      const liveGame = gameRef.current!;
      if (terminalRef.current || liveGame.isGameOver()) return false;

      clearPendingDelay();
      if (replayPlyRef.current !== null) {
        replayPlyRef.current = null;
        setReplayPly(null);
      }

      const applied = liveGame.move(
        {
          from: moveInput.from,
          to: moveInput.to,
          promotion: moveInput.promotion
        },
        { requireExplicitPromotion: true }
      );
      if (!applied) {
        playCue('illegal');
        return false;
      }

      scheduleMoveAnimation(applied);
      moveMetaRef.current = [
        ...moveMetaRef.current,
        {
          san: applied.san,
          lan: applied.lan,
          byPlayer: applied.color,
          scoreWhiteCp: bestLineEval,
          bestSan: baselineRef.current?.bestSan ?? null,
          depth: baselineRef.current?.depth ?? 0,
          classification: null
        }
      ];

      const playedByHuman = modeRef.current === 'two-player' || applied.color === humanColorRef.current;
      if (playedByHuman) {
        lastHumanMoveRef.current = applied;
        setLastHumanMove(applied);
      }

      setHintTier(0);
      clearSelection();
      setPendingPromotionSynced(null);
      handClockTo(applied.color === 'w' ? 'b' : 'w');

      playCue(applied.captured ? 'capture' : applied.promotion ? 'promote' : 'move');
      refresh(null);

      if (liveGame.in_check()) playCue('check');
      if (liveGame.isGameOver()) {
        playCue('gameover');
        const label = describeGameOver(liveGame) ?? 'Game over';
        const isDraw = liveGame.isDraw();
        const loser: PlayerColor | null = isDraw ? null : liveGame.turn();
        recordTerminalAndRating({ label, loser, draw: isDraw });
      }
      return true;
    },
    [bestLineEval, clearPendingDelay, clearSelection, handClockTo, recordTerminalAndRating, refresh, scheduleMoveAnimation, setPendingPromotionSynced]
  );

  const attemptMove = useCallback(
    (from: string, to: string, explicitPromotion?: PieceType): boolean => {
      const liveGame = gameRef.current!;
      if (!from || !to || from === to) return false;
      if (liveGame.isGameOver() || terminalRef.current) return false;
      if (replayPlyRef.current !== null && replayPlyRef.current < (liveGame.history() as string[]).length) {
        return false;
      }
      if (modeRef.current === 'engine' && liveGame.turn() !== humanColorRef.current) {
        return false;
      }

      const promoMoves = liveGame.getPromotionMoves(from, to);
      if (promoMoves.length > 0) {
        if (explicitPromotion && ['q', 'r', 'b', 'n'].includes(explicitPromotion)) {
          return commitMove({ from, to, promotion: explicitPromotion });
        }
        const firstPromo = promoMoves[0];
        setPendingPromotionSynced({
          from,
          to,
          color: firstPromo.color,
          isCapture: Boolean(firstPromo.captured),
          capturedPiece: firstPromo.captured
        });
        setSelectedSquare(from);
        setSelectionMoves(promoMoves);
        playCue('select');
        return true;
      }

      const legal = legalMovesFrom(liveGame, from).find(m => m.to === to);
      if (!legal) {
        playCue('illegal');
        return false;
      }
      return commitMove(legal);
    },
    [commitMove, setPendingPromotionSynced]
  );

  const clickSquare = useCallback(
    (square: string) => {
      const liveGame = gameRef.current!;
      if (!square || pendingPromotionRef.current) return;
      if (liveGame.isGameOver() || terminalRef.current) return;
      if (replayPlyRef.current !== null && replayPlyRef.current < (liveGame.history() as string[]).length) {
        return;
      }
      if (modeRef.current === 'engine' && liveGame.turn() !== humanColorRef.current) return;

      if (selectedSquare) {
        if (selectedSquare === square) {
          clearSelection();
          return;
        }
        const target = selectionMoves.find(m => m.to === square);
        if (target) {
          attemptMove(selectedSquare, square);
          return;
        }
      }

      const ownMoves = legalMovesFrom(liveGame, square);
      if (ownMoves.length > 0) {
        setSelectedSquare(square);
        setSelectionMoves(ownMoves);
        playCue('select');
        return;
      }

      clearSelection();
    },
    [attemptMove, clearSelection, selectedSquare, selectionMoves]
  );

  const resolvePromotion = useCallback(
    (piece: 'q' | 'r' | 'b' | 'n') => {
      const pending = pendingPromotionRef.current;
      if (!pending) return;
      const liveGame = gameRef.current!;
      const promoMoves = liveGame.getPromotionMoves(pending.from, pending.to);
      const chosen = promoMoves.find(m => m.promotion === piece);
      if (!chosen) {
        setPendingPromotionSynced(null);
        clearSelection();
        return;
      }
      commitMove(chosen);
    },
    [clearSelection, commitMove, setPendingPromotionSynced]
  );

  const cancelPromotion = useCallback(() => {
    setPendingPromotionSynced(null);
    clearSelection();
  }, [clearSelection, setPendingPromotionSynced]);

  const setMode = useCallback(
    (nextMode: PlayMode) => {
      stopEngine();
      modeRef.current = nextMode;
      setModeState(nextMode);
      setPendingPromotionSynced(null);
      clearSelection();
    },
    [clearSelection, setPendingPromotionSynced, stopEngine]
  );

  const setHumanColor = useCallback(
    (nextColor: PlayerColor) => {
      stopEngine();
      humanColorRef.current = nextColor;
      setHumanColorState(nextColor);
      setBoardFlipped(nextColor === 'b');
      setPendingPromotionSynced(null);
      clearSelection();
    },
    [clearSelection, setPendingPromotionSynced, stopEngine]
  );

  const newGame = useCallback(
    (options?: { color?: PlayerColor | 'random'; difficulty?: string; mode?: PlayMode; startFen?: string }) => {
      const liveGame = gameRef.current!;
      stopEngine();
      setAutoReplay(false);
      setActiveMovePlan(null);

      const targetFen = options?.startFen && validateFen(options.startFen).valid ? options.startFen : DEFAULT_START_FEN;
      liveGame.load(targetFen);
      startFenRef.current = targetFen;
      sessionIdRef.current = newId();
      moveMetaRef.current = [];
      baselineRef.current = null;
      usedHintsRef.current = false;
      usedTakebackRef.current = false;
      ratingUpdatedForGameRef.current = false;
      replayPlyRef.current = null;
      setReplayPly(null);

      if (options?.mode) {
        modeRef.current = options.mode;
        setModeState(options.mode);
      }
      if (options?.color) {
        const resolvedColor: PlayerColor =
          options.color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : options.color;
        humanColorRef.current = resolvedColor;
        setHumanColorState(resolvedColor);
        setBoardFlipped(resolvedColor === 'b');
      }
      if (options?.difficulty) {
        setSettings(prev => {
          const next = { ...prev, difficulty: options.difficulty! };
          saveSettings(next);
          return next;
        });
      }

      setSessionGameId(null);
      setMoveMeta([]);
      setHintTier(0);
      clearLastHumanMove();
      setEngineResult(null);
      setEngineProgress(null);
      setEngineError(null);
      setBestLine([]);
      setBestLineEval(null);
      resetTerminal();
      clearSelection();
      setPendingPromotionSynced(null);
      refresh(null);

      if (clockRef.current) {
        clockRef.current.configure(settings.timeControl);
        setClock(clockRef.current.getState());
        clockRef.current.start(liveGame.turn());
      }
    },
    [
      clearLastHumanMove,
      clearSelection,
      refresh,
      resetTerminal,
      setPendingPromotionSynced,
      settings.timeControl,
      stopEngine
    ]
  );

  const undoMove = useCallback(() => {
    const liveGame = gameRef.current!;
    if ((liveGame.history() as string[]).length === 0) return;

    stopEngine();
    setAutoReplay(false);
    setActiveMovePlan(null);
    replayPlyRef.current = null;
    setReplayPly(null);
    usedTakebackRef.current = true;

    const steps =
      modeRef.current === 'engine'
        ? liveGame.turn() === humanColorRef.current && (liveGame.history() as string[]).length >= 2
          ? 2
          : 1
        : 1;

    for (let i = 0; i < steps; i++) {
      if ((liveGame.history() as string[]).length === 0) break;
      liveGame.undo();
      if (moveMetaRef.current.length > 0) moveMetaRef.current = moveMetaRef.current.slice(0, -1);
    }

    baselineRef.current = null;
    setHintTier(0);
    clearLastHumanMove();
    setEngineResult(null);
    setEngineProgress(null);
    setBestLine([]);
    setBestLineEval(null);
    resetTerminal();
    clearSelection();
    setPendingPromotionSynced(null);

    if (clockRef.current) {
      clockRef.current.configure(settings.timeControl);
      setClock(clockRef.current.getState());
      clockRef.current.start(liveGame.turn());
    }
    refresh(null);
  }, [clearLastHumanMove, clearSelection, refresh, resetTerminal, setPendingPromotionSynced, settings.timeControl, stopEngine]);

  const redoMove = useCallback(() => {
    const liveGame = gameRef.current!;
    if (!liveGame.canRedo()) return;

    stopEngine();
    setAutoReplay(false);
    replayPlyRef.current = null;
    setReplayPly(null);

    const steps = modeRef.current === 'engine' ? 2 : 1;
    for (let i = 0; i < steps; i++) {
      if (!liveGame.canRedo()) break;
      const redone = liveGame.redo();
      if (redone) {
        scheduleMoveAnimation(redone);
        moveMetaRef.current = [
          ...moveMetaRef.current,
          { san: redone.san, lan: redone.lan, byPlayer: redone.color, classification: null }
        ];
      }
    }
    clearSelection();
    setPendingPromotionSynced(null);
    refresh(null);
  }, [clearSelection, refresh, scheduleMoveAnimation, setPendingPromotionSynced, stopEngine]);

  const resign = useCallback(() => {
    const liveGame = gameRef.current!;
    if (terminalRef.current) return;
    stopEngine();
    setAutoReplay(false);

    const loser: PlayerColor = modeRef.current === 'engine' ? humanColorRef.current : liveGame.turn();
    const winner = loser === 'w' ? 'Black' : 'White';
    playCue('gameover');
    recordTerminalAndRating({
      label: `${loser === 'w' ? 'White' : 'Black'} resigned — ${winner} wins`,
      loser,
      draw: false
    });
  }, [recordTerminalAndRating, stopEngine]);

  const requestHint = useCallback(() => {
    usedHintsRef.current = true;
    setHintTier(prev => (prev < 5 ? ((prev + 1) as 1 | 2 | 3 | 4 | 5) : 1));
  }, []);

  const clearHint = useCallback(() => setHintTier(0), []);

  const flipBoard = useCallback(() => setBoardFlipped(prev => !prev), []);

  const playMove = useCallback(
    (move: VerboseMove) => {
      if (terminalRef.current || gameRef.current!.isGameOver()) return false;
      return attemptMove(move.from, move.to, move.promotion);
    },
    [attemptMove]
  );

  const playSan = useCallback(
    (san: string) => {
      const liveGame = gameRef.current!;
      const rawText = san.trim();
      if (!rawText) return false;
      const cleanInput = rawText
        .replace(/[+#!?]+$/g, '')
        .replace(/0-0-0/g, 'O-O-O')
        .replace(/0-0/g, 'O-O');

      const legals = allLegalMoves(liveGame);
      const match = legals.find(m => {
        const cleanSan = m.san.replace(/[+#!?]+$/g, '');
        const cleanSanNoEq = cleanSan.replace('=', '');
        return (
          m.san === rawText ||
          cleanSan === cleanInput ||
          cleanSanNoEq === cleanInput ||
          m.lan.toLowerCase() === cleanInput.toLowerCase()
        );
      });

      if (!match) {
        playCue('illegal');
        return false;
      }
      return commitMove(match);
    },
    [commitMove]
  );

  const importFen = useCallback(
    (fen: string): { ok: boolean; error: string | null } => {
      const v = validateFen(fen);
      if (!v.valid) return { ok: false, error: v.error };
      newGame({ startFen: fen.trim() });
      return { ok: true, error: null };
    },
    [newGame]
  );

  const importPgn = useCallback(
    (pgn: string, title?: string): { ok: boolean; error: string | null } => {
      const liveGame = gameRef.current!;
      stopEngine();
      setAutoReplay(false);

      const testGame = createGame();
      if (!testGame.load_pgn(pgn)) {
        return { ok: false, error: 'Invalid PGN or illegal move sequence detected.' };
      }

      liveGame.load_pgn(pgn);
      startFenRef.current = liveGame.initialFen || DEFAULT_START_FEN;
      sessionIdRef.current = newId();
      const verbose = liveGame.history({ verbose: true }) as VerboseMove[];
      moveMetaRef.current = verbose.map(m => ({
        san: m.san,
        lan: m.lan,
        byPlayer: m.color,
        classification: null
      }));
      baselineRef.current = null;
      replayPlyRef.current = null;
      setReplayPly(null);
      clearSelection();
      setPendingPromotionSynced(null);
      resetTerminal();

      const label = describeGameOver(liveGame);
      if (label) {
        const isDraw = liveGame.isDraw();
        terminalRef.current = { label, loser: isDraw ? null : liveGame.turn(), draw: isDraw };
        setTerminal(terminalRef.current);
      }

      refresh(null);
      if (title) {
        const saved = saveGameToArchive({
          id: sessionIdRef.current,
          title,
          pgn: liveGame.pgn(),
          startFen: startFenRef.current,
          fen: liveGame.fen(),
          result: label ?? 'Imported Game',
          difficulty: settings.difficulty,
          mode: modeRef.current,
          humanColor: humanColorRef.current,
          moveCount: verbose.length,
          moveMeta: moveMetaRef.current,
          createdAt: new Date().toISOString()
        });
        setArchive(saved as ArchivedGame[]);
      }
      return { ok: true, error: null };
    },
    [clearSelection, refresh, resetTerminal, setPendingPromotionSynced, settings.difficulty, stopEngine]
  );

  const goToPly = useCallback(
    (ply: number | null) => {
      const total = (gameRef.current!.history() as string[]).length;
      if (ply === null || ply >= total) {
        replayPlyRef.current = null;
        setReplayPly(null);
        refresh(null);
      } else {
        const clamped = Math.max(0, Math.min(total, ply));
        replayPlyRef.current = clamped;
        setReplayPly(clamped);
        refresh(clamped);
      }
      clearSelection();
    },
    [clearSelection, refresh]
  );

  const stepFirst = useCallback(() => {
    setAutoReplay(false);
    goToPly(0);
  }, [goToPly]);

  const stepPrev = useCallback(() => {
    setAutoReplay(false);
    const total = (gameRef.current!.history() as string[]).length;
    const cur = replayPlyRef.current !== null ? replayPlyRef.current : total;
    goToPly(Math.max(0, cur - 1));
  }, [goToPly]);

  const stepNext = useCallback(() => {
    const total = (gameRef.current!.history() as string[]).length;
    const cur = replayPlyRef.current !== null ? replayPlyRef.current : total;
    if (cur + 1 >= total) {
      goToPly(null);
    } else {
      goToPly(cur + 1);
    }
  }, [goToPly]);

  const stepLast = useCallback(() => {
    setAutoReplay(false);
    goToPly(null);
  }, [goToPly]);

  const toggleAutoReplay = useCallback(() => {
    setAutoReplay(prev => {
      if (!prev) {
        const total = (gameRef.current!.history() as string[]).length;
        if (total === 0) return false;
        if (replayPlyRef.current === null || replayPlyRef.current >= total) {
          goToPly(0);
        }
        return true;
      }
      return false;
    });
  }, [goToPly]);

  useEffect(() => {
    if (!autoReplay) return;
    const timer = setInterval(() => {
      const total = (gameRef.current!.history() as string[]).length;
      const cur = replayPlyRef.current !== null ? replayPlyRef.current : total;
      if (cur >= total) {
        setAutoReplay(false);
        goToPly(null);
      } else {
        goToPly(cur + 1);
        playCue('move');
      }
    }, Math.max(250, autoReplaySpeedMs));
    return () => clearInterval(timer);
  }, [autoReplay, autoReplaySpeedMs, goToPly]);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const setXrayLayer = useCallback((patch: Partial<XRayLayerConfig>) => {
    setXrayLayers(prev => ({ ...prev, ...patch }));
  }, []);

  const saveCurrentGame = useCallback(
    (customTitle?: string, customNotes?: string) => {
      const liveGame = gameRef.current!;
      const openingEntry = moveReview.detectOpening(liveGame.history() as string[]);
      const smartName = generateSmartGameFilename({
        playerColor: humanColorRef.current,
        mode: modeRef.current,
        opponentName: `Cathedral-${settings.difficulty}`,
        result: terminalRef.current?.label ?? 'InProgress'
      });
      const record: ArchivedGame = {
        id: sessionIdRef.current,
        title:
          customTitle ||
          `${modeRef.current === 'engine' ? `vs ${settings.difficulty}` : 'Two Player'} · ${liveGame.history().length} ply`,
        smartName,
        pgn: liveGame.pgn(),
        startFen: startFenRef.current,
        fen: liveGame.fen(),
        result: terminalRef.current?.label ?? 'In progress',
        difficulty: settings.difficulty,
        engineVersion: 'Cathedral-3.1',
        timeControl: settings.timeControl,
        openingName: openingEntry ? `${openingEntry.eco} ${openingEntry.name}` : '',
        mode: modeRef.current,
        humanColor: humanColorRef.current,
        moveCount: liveGame.history().length,
        annotations: customNotes ?? '',
        moveMeta: moveMetaRef.current,
        createdAt: new Date().toISOString()
      };
      saveGameToArchive(record);
      setSessionGameId(record.id);
      refreshArchive();
      return record;
    },
    [refreshArchive, settings.difficulty, settings.timeControl]
  );

  const exportVideoForGame = useCallback(
    (record?: ArchivedGame) => {
      const liveGame = gameRef.current!;
      let moves = liveGame.history() as string[];
      let startFen = startFenRef.current || DEFAULT_START_FEN;
      let title = generateSmartGameFilename({
        playerColor: humanColorRef.current,
        mode: modeRef.current,
        opponentName: `Cathedral-${settings.difficulty}`,
        result: terminalRef.current?.label || 'Match'
      });
      let result = terminalRef.current?.label || '';

      if (record) {
        const tmp = createGame(record.startFen || DEFAULT_START_FEN);
        if (record.pgn) tmp.load_pgn(record.pgn);
        moves = tmp.history() as string[];
        startFen = record.startFen || DEFAULT_START_FEN;
        title = record.smartName || record.title;
        result = record.result || '';
      }

      if (moves.length === 0) {
        setVideoModal({
          running: false,
          pct: 0,
          ply: 0,
          totalPlies: 0,
          url: null,
          filename: `${title}.webm`,
          sizeBytes: 0,
          frameCount: 0,
          error: 'Play at least one move or open a saved game from the Library to export a replay video.'
        });
        return;
      }

      const abortCtrl = new AbortController();
      videoAbortRef.current = abortCtrl;
      setVideoModal({
        running: true,
        pct: 0,
        ply: 0,
        totalPlies: moves.length,
        url: null,
        filename: `${title}.webm`,
        sizeBytes: 0,
        frameCount: 0,
        error: null
      });

      void exportGameReplayVideo({
        startFen,
        moves,
        title,
        result,
        boardTheme: settings.boardTheme,
        boardFlipped,
        resolution: settings.videoExportResolution || 720,
        msPerMove: settings.videoExportSpeedMs || 450,
        fps: 24,
        signal: abortCtrl.signal,
        onProgress: p => {
          setVideoModal(prev => (prev ? { ...prev, pct: p.pct, ply: p.ply } : null));
        }
      }).then(vRes => {
        setVideoModal(prev => {
          if (!prev) return null;
          if (vRes.ok) {
            return {
              ...prev,
              running: false,
              url: vRes.url,
              filename: vRes.filename,
              sizeBytes: vRes.sizeBytes,
              frameCount: vRes.frameCount,
              error: null
            };
          }
          return { ...prev, running: false, error: vRes.error || 'Video export failed.' };
        });
      });
    },
    [boardFlipped, settings.boardTheme, settings.difficulty, settings.videoExportResolution, settings.videoExportSpeedMs]
  );

  const cancelVideoExport = useCallback(() => {
    videoAbortRef.current?.abort();
    videoAbortRef.current = null;
    setVideoModal(null);
  }, []);

  const closeVideoModal = useCallback(() => {
    videoAbortRef.current?.abort();
    videoAbortRef.current = null;
    setVideoModal(null);
  }, []);

  const openArchivedGame = useCallback(
    (record: ArchivedGame) => {
      const liveGame = gameRef.current!;
      stopEngine();
      setAutoReplay(false);

      const target = record.startFen || DEFAULT_START_FEN;
      const ok = liveGame.load(target);
      if (!ok) return false;
      if (record.pgn && record.pgn.trim().length > 0) {
        liveGame.load_pgn(record.pgn);
      }

      startFenRef.current = target;
      sessionIdRef.current = record.id;
      const verbose = liveGame.history({ verbose: true }) as VerboseMove[];
      moveMetaRef.current =
        Array.isArray(record.moveMeta) && record.moveMeta.length === verbose.length
          ? record.moveMeta
          : verbose.map(m => ({
              san: m.san,
              lan: m.lan,
              byPlayer: m.color,
              classification: null
            }));

      baselineRef.current = null;
      replayPlyRef.current = null;
      setReplayPly(null);

      setSessionGameId(record.id);
      setHintTier(0);
      clearLastHumanMove();
      setEngineResult(null);
      setEngineProgress(null);
      setBestLine([]);
      setBestLineEval(null);
      resetTerminal();
      clearSelection();
      setPendingPromotionSynced(null);

      if (clockRef.current) {
        clockRef.current.configure(settings.timeControl);
        setClock(clockRef.current.getState());
      }
      refresh(null);

      const label = describeGameOver(liveGame);
      if (label) {
        const isDraw = liveGame.isDraw();
        terminalRef.current = { label, loser: isDraw ? null : liveGame.turn(), draw: isDraw };
        setTerminal(terminalRef.current);
      }
      return true;
    },
    [clearLastHumanMove, clearSelection, refresh, resetTerminal, setPendingPromotionSynced, settings.timeControl, stopEngine]
  );

  const toggleFavoriteGame = useCallback(
    (id: string) => {
      const target = archive.find(g => g.id === id);
      if (!target) return;
      updateArchivedGameMeta(id, { favorite: !target.favorite });
      refreshArchive();
    },
    [archive, refreshArchive]
  );

  const toggleArchiveGame = useCallback(
    (id: string) => {
      const target = archive.find(g => g.id === id);
      if (!target) return;
      updateArchivedGameMeta(id, { archived: !target.archived });
      refreshArchive();
    },
    [archive, refreshArchive]
  );

  const updateGameNotes = useCallback(
    (id: string, notes: string) => {
      updateArchivedGameMeta(id, { annotations: notes });
      refreshArchive();
    },
    [refreshArchive]
  );

  const removeArchivedGame = useCallback(
    (id: string) => {
      deleteGameFromArchive(id);
      setSessionGameId(prev => (prev === id ? null : prev));
      refreshArchive();
    },
    [refreshArchive]
  );

  const clearArchive = useCallback(() => {
    clearAllArchivedGames();
    setSessionGameId(null);
    setArchive([]);
  }, []);

  useEffect(() => {
    setMounted(true);

    const loaded = loadSettings() as Settings;
    setSettings(loaded);
    configureSound({
      enabled: loaded.soundEnabled,
      volume: loaded.soundVolume ?? 75,
      move: loaded.soundMove ?? true,
      capture: loaded.soundCapture ?? true,
      check: loaded.soundCheck ?? true,
      gameover: loaded.soundGameOver ?? true
    });
    setPlayerRating(loadPlayerRating() as PlayerRatingState);
    refreshArchive();

    const clockInstance = createClock(
      loaded.timeControl,
      state => setClock(state),
      side => {
        if (terminalRef.current) return;
        const winner = side === 'w' ? 'Black' : 'White';
        playCue('gameover');
        thinkingRef.current = false;
        setEngineThinking(false);
        recordTerminalAndRating({
          label: `${side === 'w' ? 'White' : 'Black'} flagged on time — ${winner} wins`,
          loser: side,
          draw: false
        });
      }
    );
    clockRef.current = clockInstance;
    setClock(clockInstance.getState());

    const client = createEngineClient();
    engineRef.current = client;
    setTransport(client.mode);

    if (typeof window !== 'undefined' && window.location.hash) {
      const shared = decodeGameFromUrlHash(window.location.hash);
      if (shared) {
        const live = gameRef.current!;
        live.load(shared.startFen || DEFAULT_START_FEN);
        if (shared.pgn) live.load_pgn(shared.pgn);
        startFenRef.current = shared.startFen || DEFAULT_START_FEN;
        const verbose = live.history({ verbose: true }) as VerboseMove[];
        moveMetaRef.current = verbose.map(m => ({
          san: m.san,
          lan: m.lan,
          byPlayer: m.color,
          classification: null
        }));
        refresh(null);
        return;
      }
    }

    const activeSaved = loadActiveGameSnapshot() as {
      id?: string;
      pgn?: string;
      startFen?: string;
      mode?: PlayMode;
      humanColor?: PlayerColor;
      moveMeta?: MoveMeta[];
    } | null;
    if (activeSaved && activeSaved.pgn && activeSaved.pgn.trim().length > 0) {
      const live = gameRef.current!;
      if (live.load_pgn(activeSaved.pgn)) {
        startFenRef.current = activeSaved.startFen || DEFAULT_START_FEN;
        if (activeSaved.id) sessionIdRef.current = activeSaved.id;
        if (Array.isArray(activeSaved.moveMeta)) moveMetaRef.current = activeSaved.moveMeta;
        refresh(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    configureSound({
      enabled: settings.soundEnabled,
      volume: settings.soundVolume ?? 75,
      move: settings.soundMove ?? true,
      capture: settings.soundCapture ?? true,
      check: settings.soundCheck ?? true,
      gameover: settings.soundGameOver ?? true
    });
  }, [
    settings.soundEnabled,
    settings.soundVolume,
    settings.soundMove,
    settings.soundCapture,
    settings.soundCheck,
    settings.soundGameOver
  ]);

  useEffect(() => {
    if (!mounted || !clockRef.current) return;
    clockRef.current.configure(settings.timeControl);
    setClock(clockRef.current.getState());
  }, [mounted, settings.timeControl]);

  useEffect(
    () => () => {
      stopEngine();
      engineRef.current?.dispose();
      clockRef.current?.stop();
    },
    [stopEngine]
  );

  const liveFen = gameRef.current ? gameRef.current.fen() : snapshot.fen;
  const searchEpoch = `${liveFen}|${mode}|${humanColor}|${settings.difficulty}|${settings.searchTimeMs}|${settings.useOpeningBook}|${settings.activeModelId}|${settings.superThinkingEnabled}|${settings.superThinkingPreset}|${mounted}|${Boolean(pendingPromotion)}|${snapshot.isViewingHistory}`;

  useEffect(() => {
    if (!mounted) return;
    const liveGame = gameRef.current!;
    if (liveGame.isGameOver() || terminalRef.current || pendingPromotion) return;
    if (snapshot.isViewingHistory) return;
    if (mode !== 'engine') return;

    const engineToMove = liveGame.turn() !== humanColor;
    runSearch(engineToMove ? 'reply' : 'analysis');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchEpoch]);

  const displayedGame = useMemo(() => {
    const live = gameRef.current!;
    if (snapshot.isViewingHistory) {
      return live.getPositionAtPly(snapshot.displayedPly);
    }
    return live;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.fen, snapshot.displayedPly, snapshot.isViewingHistory]);

  const opening = useMemo(() => moveReview.detectOpening(snapshot.sanHistory), [snapshot.sanHistory]);

  const reviewSummary = useMemo(
    () => moveReview.computeGameReviewSummary(snapshot.sanHistory, moveMeta),
    [snapshot.sanHistory, moveMeta]
  );

  const progressiveHints = useMemo(
    () => moveReview.computeProgressiveHints(displayedGame, engineResult, null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [displayedGame, snapshot.fen, engineResult]
  );

  const hintMove = useMemo(() => {
    if (hintTier < 4 || !progressiveHints.available || !progressiveHints.recommendedMove) return null;
    return progressiveHints.recommendedMove;
  }, [hintTier, progressiveHints]);

  const clockLabel = useCallback(
    (side: PlayerColor) => (clock.enabled ? formatClock(side === 'w' ? clock.w : clock.b) : '∞'),
    [clock]
  );

  const resignable = !terminal && snapshot.moveCount > 0;

  const api = useMemo<SessionApi>(
    () => ({
      mounted,
      transport,
      gameHandle: gameRef,
      displayedGame,
      settings,
      updateSettings,
      activeModel,
      snapshot,
      opening,
      moveMeta,
      reviewSummary,
      terminal,
      selectedSquare,
      selectionMoves,
      clickSquare,
      attemptMove,
      clearSelection,
      activeMovePlan,
      triggerDemoKnightAnimation,
      playMove,
      playSan,
      importFen,
      importPgn,
      pendingPromotion,
      resolvePromotion,
      cancelPromotion,
      mode,
      setMode,
      humanColor,
      setHumanColor,
      boardFlipped,
      flipBoard,
      isFullscreenBoard,
      toggleFullscreenBoard,
      newGame,
      undoMove,
      redoMove,
      resign,
      replayPly,
      goToPly,
      stepFirst,
      stepPrev,
      stepNext,
      stepLast,
      autoReplay,
      toggleAutoReplay,
      autoReplaySpeedMs,
      setAutoReplaySpeedMs,
      hintTier,
      setHintTier,
      progressiveHints,
      hintMove,
      requestHint,
      clearHint,
      resignable,
      lastHumanMove,
      clock,
      clockLabel,
      engineThinking,
      delayWaiting,
      skipDelayNow,
      engineProgress,
      engineResult,
      engineError,
      bestLine,
      bestLineEval,
      stopEngine,
      triggerSuperThink,
      xrayLayers,
      setXrayLayer,
      playerRating,
      archive,
      sessionGameId,
      saveCurrentGame,
      openArchivedGame,
      toggleFavoriteGame,
      toggleArchiveGame,
      updateGameNotes,
      removeArchivedGame,
      clearArchive,
      refreshArchive,
      videoModal,
      exportVideoForGame,
      cancelVideoExport,
      closeVideoModal
    }),
    [
      activeModel,
      activeMovePlan,
      archive,
      attemptMove,
      autoReplay,
      autoReplaySpeedMs,
      bestLine,
      bestLineEval,
      boardFlipped,
      cancelPromotion,
      cancelVideoExport,
      clearArchive,
      clearHint,
      clearSelection,
      clickSquare,
      clock,
      clockLabel,
      closeVideoModal,
      delayWaiting,
      displayedGame,
      engineError,
      engineProgress,
      engineResult,
      engineThinking,
      exportVideoForGame,
      flipBoard,
      goToPly,
      hintMove,
      hintTier,
      humanColor,
      importFen,
      importPgn,
      isFullscreenBoard,
      lastHumanMove,
      mode,
      mounted,
      moveMeta,
      newGame,
      openArchivedGame,
      opening,
      pendingPromotion,
      playMove,
      playSan,
      playerRating,
      progressiveHints,
      redoMove,
      refreshArchive,
      removeArchivedGame,
      replayPly,
      requestHint,
      resign,
      resignable,
      resolvePromotion,
      reviewSummary,
      saveCurrentGame,
      selectedSquare,
      selectionMoves,
      sessionGameId,
      setHumanColor,
      setMode,
      setXrayLayer,
      settings,
      skipDelayNow,
      snapshot,
      stepFirst,
      stepLast,
      stepNext,
      stepPrev,
      stopEngine,
      terminal,
      toggleArchiveGame,
      toggleAutoReplay,
      toggleFavoriteGame,
      toggleFullscreenBoard,
      transport,
      triggerDemoKnightAnimation,
      triggerSuperThink,
      undoMove,
      updateGameNotes,
      updateSettings,
      videoModal,
      xrayLayers
    ]
  );

  return <SessionContext.Provider value={api}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionApi {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}