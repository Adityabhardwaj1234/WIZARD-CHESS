/**
 * Cathedral Typed Boundary (`src/lib/cathedral.ts`)
 *
 * Casts the plain JS rules engine, clock, move animation planner, model runtime,
 * analysis helpers, and video exporter into strict TypeScript interfaces.
 */

import { ChessGame as ChessGameImpl, DEFAULT_FEN, validateFen as validateFenImpl } from '../game/ChessGame.js';
import {
  BYTES_PER_NODE,
  MAX_NODE_RAM_MB,
  MAX_NODES_UNDER_500MB,
  estimateNodeRamBytes,
  estimateNodeRamMb,
  clampNodeBudgetToRamCap,
  calculateDeviceNodeBudgetProfile
} from '../engine/transpositionTable.js';

export {
  BYTES_PER_NODE,
  MAX_NODE_RAM_MB,
  MAX_NODES_UNDER_500MB,
  estimateNodeRamBytes,
  estimateNodeRamMb,
  clampNodeBudgetToRamCap,
  calculateDeviceNodeBudgetProfile
};
import { GameClock as GameClockImpl, TIME_CONTROL_PRESETS } from '../game/gameClock.js';
import { computeMoveAnimationPlan as computeMoveAnimationPlanImpl, ANIMATION_SPEED_PRESETS } from '../game/moveAnimation.js';
import {
  BUILTIN_MODELS as BUILTIN_MODELS_IMPL,
  MODEL_BENCHMARK_REPORT as MODEL_BENCHMARK_REPORT_IMPL,
  loadUserModels as loadUserModelsImpl,
  saveUserModelsList as saveUserModelsListImpl,
  validateModelArtifact as validateModelArtifactImpl,
  evaluateGameWithModel as evaluateWithModelImpl
} from '../engine/modelRuntime.js';
import {
  VERIFIED_PUZZLES as VERIFIED_PUZZLES_IMPL,
  ENDGAME_LESSONS as ENDGAME_LESSONS_IMPL,
  classifyPlayedMove,
  computeGameReviewSummary,
  computeProgressiveHints,
  detectOpening,
  extractBlunderPuzzlesFromTimeline
} from '../analysis/moveReview.js';
import { computeXRayAnalysis, evaluateBeforeMoveWarning } from '../xray/xrayEngine.js';
import { evaluateForSideToMove, evaluatePositionWhite } from '../engine/evaluation.js';
import { exportGameReplayVideo as exportGameReplayVideoImpl } from '../sharing/videoExport.js';
import { generateSmartGameFilename as generateSmartGameFilenameImpl } from '../persistence/storage.js';

export type PlayerColor = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export interface RawMove {
  from: number;
  to: number;
  color: PlayerColor;
  piece: PieceType;
  flags: string;
  promotion?: string;
  captured?: string;
}

export interface VerboseMove {
  color: PlayerColor;
  from: string;
  to: string;
  flags: string;
  piece: PieceType;
  captured?: PieceType;
  promotion?: PieceType;
  san: string;
  lan: string;
  before?: string;
  after?: string;
}

export interface BoardCell {
  square: string;
  type: PieceType;
  color: PlayerColor;
}

export interface CapturedSummary {
  capturedByWhite: PieceType[];
  capturedByBlack: PieceType[];
  whiteMaterial: number;
  blackMaterial: number;
  netWhiteAdvantage: number;
}

export interface OpeningEntry {
  eco: string;
  name: string;
  moves: string[];
}

export interface MoveClassification {
  id: string;
  label: string;
  badge: string;
  color: string;
  description: string;
  cpLoss: number;
  uncertain: boolean;
}

export interface ProgressiveHintTier {
  level: 1 | 2 | 3 | 4 | 5;
  title: string;
  badge: string;
  text: string;
}

export interface ProgressiveHintsResult {
  available: boolean;
  recommendedMove?: VerboseMove;
  originSquare?: string;
  targetSquare?: string;
  pv?: string[];
  depth?: number;
  tiers: ProgressiveHintTier[];
}

export interface SideReviewStats {
  best: number;
  excellent: number;
  good: number;
  inaccuracy: number;
  mistake: number;
  blunder: number;
  uncertain: number;
  totalAnalysed: number;
  totalCpLoss: number;
  acpl: number;
  accuracy: number | null;
}

export interface GameReviewSummary {
  w: SideReviewStats;
  b: SideReviewStats;
  evalSeries: {
    ply: number;
    san: string;
    side?: PlayerColor;
    whiteCp: number | null;
    classification: MoveClassification | null;
  }[];
  criticalMoments: {
    ply: number;
    moveNumber: number;
    side: PlayerColor;
    san: string;
    label: string;
    cpLoss: number;
    bestSan: string | null;
  }[];
}

export interface MoveAnimationPlan {
  from: string;
  to: string;
  piece: PieceType;
  color: PlayerColor;
  isKnight: boolean;
  pathType: 'knight-l-path' | 'linear-ray';
  durationMs: number;
  trailDurationMs: number;
  start: { col: number; row: number; svgX: number; svgY: number };
  end: { col: number; row: number; svgX: number; svgY: number };
  elbow: { square: string; col: number; row: number; svgX: number; svgY: number } | null;
  keyframes: Keyframe[];
  svgPathD: string;
  castlingRook: {
    from: string;
    to: string;
    svgPathD: string;
    keyframes: Keyframe[];
  } | null;
  enPassantClearedSquare: string | null;
  effectType: 'checkmate' | 'check' | 'promote' | 'capture' | 'castle' | 'move';
}

export interface ModelArtifact {
  id: string;
  name: string;
  version: string;
  modelType: 'classical_24' | 'neural_mlp' | 'hybrid_ensemble' | 'python_source_only';
  builtIn?: boolean;
  trained?: boolean;
  status?: string;
  description?: string;
  architecture?: {
    type?: string;
    parameterCount?: number;
    inputDim?: number;
    hiddenLayers?: number[];
  };
  evalParams?: Record<string, number>;
  weights?: Record<string, unknown>;
  classicalWeight?: number;
  neuralWeight?: number;
}

export interface XRayAttacker {
  square: string;
  type: PieceType;
  color: PlayerColor;
  value: number;
}

export interface XRaySquareInfo {
  square: string;
  whiteAttackers: XRayAttacker[];
  blackAttackers: XRayAttacker[];
  whiteCount: number;
  blackCount: number;
  netControl: number;
  control: 'white' | 'black' | 'contested' | 'neutral';
  epistemicType: 'fact';
}

export interface XRayDefendedPiece {
  square: string;
  type: PieceType;
  piece: PieceType;
  color: PlayerColor;
  defenders: number;
  attackers: number;
  defenderSquares: string[];
  epistemicType: 'fact';
  description: string;
}

export interface XRayVulnerablePiece {
  square: string;
  type: PieceType;
  piece: PieceType;
  color: PlayerColor;
  status: 'hanging' | 'unfavorable_exchange' | 'outnumbered_defense' | 'overloaded';
  severity: 'low' | 'medium' | 'high';
  attackers: number;
  defenders: number;
  netPressure: number;
  attackerSquare?: string;
  guardedSquares?: string[];
  epistemicType: 'fact';
  reason: string;
  description: string;
}

export interface XRayMotif {
  type: 'Pin' | 'Fork' | 'Skewer' | 'Discovered';
  subType?: string;
  confidence: 'Confirmed' | 'Possible';
  epistemicType: 'fact';
  color: PlayerColor;
  square: string;
  attackerSquare?: string;
  targetSquares: string[];
  description: string;
}

export interface XRayArrow {
  from: string;
  to: string;
  san: string;
  rank?: number;
  step?: number;
  scoreWhiteCp?: number;
  epistemicType: 'fact' | 'candidate_line' | 'prediction' | 'uncertainty';
}

export interface XRayAnalysis {
  attackMap: Record<string, XRaySquareInfo>;
  defendedPieces: XRayDefendedPiece[];
  hangingPieces: XRayVulnerablePiece[];
  overloadedDefenders: XRayVulnerablePiece[];
  vulnerablePieces: XRayVulnerablePiece[];
  pinsAndDiscovered: XRayMotif[];
  forksAndSkewers: XRayMotif[];
  motifs: XRayMotif[];
  kingSafety: {
    whiteInCheck: boolean;
    blackInCheck: boolean;
    whiteKingSquare: string | null;
    blackKingSquare: string | null;
    checkAttackers: { from: string; to: string; color: PlayerColor; piece: PieceType; description: string }[];
    candidateChecks: {
      from: string;
      to: string;
      square: string;
      color: PlayerColor;
      san: string;
      piece: PieceType;
      isMate?: boolean;
      description: string;
    }[];
    exposedKingZones: { square: string; defendingKingSide: PlayerColor; attackersCount: number; attackerSquare?: string }[];
  };
  candidateArrows: XRayArrow[];
  pvArrows: XRayArrow[];
  predictedReplyArrows: XRayArrow[];
  analysisDepth: number;
  isShallowUncertainty: boolean;
}

export interface BeforeMoveWarning {
  severity: 'critical' | 'high' | 'medium' | 'warning' | 'notice';
  epistemicType?: string;
  searchDepth?: number;
  title: string;
  message: string;
  refutationLine: string[];
  recommendedMove: string | null;
  from?: string;
  to?: string;
  cpDrop: number;
}

export interface ClockState {
  enabled: boolean;
  presetId: string;
  w: number;
  b: number;
  activeSide: PlayerColor | null;
  timedOutSide: PlayerColor | null;
}

export interface CathedralGame {
  hashHistory: string[];
  initialFen: string;
  load(fen: string, options?: Record<string, unknown>): boolean;
  reset(): void;
  fen(): string;
  turn(): PlayerColor;
  board(): (BoardCell | null)[][];
  get(square: string): { type: PieceType; color: PlayerColor } | null;
  getCapturedPieces(upToPly?: number | null): CapturedSummary;
  getPromotionMoves(fromAlg: string, toAlg: string): VerboseMove[];
  isPromotionMove(fromAlg: string, toAlg: string): boolean;
  getPositionAtPly(targetPly: number): CathedralGame;
  in_check(): boolean;
  isCheckmate(): boolean;
  isStalemate(): boolean;
  isInsufficientMaterial(): boolean;
  isThreefoldRepetition(): boolean;
  isFiftyMoveRule(): boolean;
  isDraw(): boolean;
  isGameOver(): boolean;
  moves(options?: { square?: string; verbose?: boolean }): VerboseMove[] | string[];
  move(
    moveInput: string | { from: string | number; to: string | number; promotion?: string },
    options?: { requireExplicitPromotion?: boolean; preserveRedo?: boolean }
  ): VerboseMove | null;
  undo(): VerboseMove | null;
  redo(): VerboseMove | null;
  canRedo(): boolean;
  history(options?: { verbose?: boolean }): VerboseMove[] | string[];
  pgn(options?: Record<string, unknown>): string;
  load_pgn(pgn: string): boolean;
}

export interface CathedralGameClock {
  configure(presetId: string): void;
  start(side: PlayerColor): void;
  switchTurn(completedSide: PlayerColor): void;
  stop(): void;
  getState(): ClockState;
}

interface EngineLike {
  search(fen: string, options: Record<string, unknown>): {
    bestMoveSan: string | null;
    scoreSideToMoveCp: number;
    scoreWhiteCp: number;
    mateIn: unknown;
    pv: string[];
    depth: number;
  };
}

const GameCtor = ChessGameImpl as unknown as new (fen?: string) => CathedralGame;
const ClockCtor = GameClockImpl as unknown as new (
  presetId?: string,
  onTick?: ((state: ClockState) => void) | null,
  onTimeout?: ((side: PlayerColor) => void) | null
) => CathedralGameClock;

const reviewApi = {
  classifyPlayedMove: classifyPlayedMove as unknown as (args: {
    playedSan: string;
    bestSan: string | null;
    bestScoreForMoverCp: number;
    playedScoreForMoverCp: number;
    searchDepth: number;
  }) => MoveClassification,
  detectOpening: detectOpening as unknown as (sanHistory: string[]) => OpeningEntry | null,
  computeProgressiveHints: computeProgressiveHints as unknown as (
    game: CathedralGame,
    engineResult?: unknown,
    existingXray?: XRayAnalysis | null
  ) => ProgressiveHintsResult,
  computeGameReviewSummary: computeGameReviewSummary as unknown as (
    sanHistory: string[],
    moveMeta?: unknown[]
  ) => GameReviewSummary,
  extractBlunderPuzzlesFromTimeline: extractBlunderPuzzlesFromTimeline as unknown as (
    timeline: { moveVerbose: { san: string; before: string }; classification: MoveClassification; bestSan?: string }[]
  ) => {
    id: string;
    title: string;
    theme: string;
    difficulty: string;
    fen: string;
    playedBadMove: string;
    solutionSan: string[];
    explanation: string;
  }[]
};

const xrayApi = {
  computeXRayAnalysis: computeXRayAnalysis as unknown as (game: CathedralGame, engineResult?: unknown) => XRayAnalysis,
  evaluateBeforeMoveWarning: evaluateBeforeMoveWarning as unknown as (
    game: CathedralGame,
    candidate: VerboseMove,
    engine: EngineLike
  ) => BeforeMoveWarning | null
};

export const DEFAULT_START_FEN = DEFAULT_FEN as string;
export const validateFen = validateFenImpl as unknown as (fen: string) => { valid: boolean; error: string | null };
export const CLOCK_PRESETS = TIME_CONTROL_PRESETS as Record<
  string,
  { id: string; label: string; initialMs: number; incrementMs: number }
>;
export const moveReview = reviewApi;
export const xray = xrayApi;
export const BUILTIN_MODELS = BUILTIN_MODELS_IMPL as ModelArtifact[];
export const MODEL_BENCHMARK_REPORT = MODEL_BENCHMARK_REPORT_IMPL as {
  generatedAt: string;
  testSetSize: number;
  models: {
    id: string;
    name: string;
    version: string;
    modelType: string;
    trained: boolean;
    testCount: number;
    maeCp: number;
    rmseCp: number;
    signAccuracyPct: number;
    pearsonR: number;
    inferenceLatencyUsPerPos: number;
  }[];
};
export const VERIFIED_PUZZLES = VERIFIED_PUZZLES_IMPL as {
  id: string;
  title: string;
  theme: string;
  difficulty: string;
  fen: string;
  solutionSan: string[];
  explanation: string;
}[];
export const ENDGAME_LESSONS = ENDGAME_LESSONS_IMPL as {
  id: string;
  title: string;
  theme: string;
  difficulty: string;
  fen: string;
  solutionSan: string[];
  explanation: string;
}[];

export const computeMoveAnimationPlan = computeMoveAnimationPlanImpl as unknown as (
  moveVerbose: VerboseMove | null,
  options?: { boardFlipped?: boolean; durationMs?: number; reducedMotion?: boolean }
) => MoveAnimationPlan | null;

export const loadUserModels = loadUserModelsImpl as unknown as () => ModelArtifact[];
export const saveUserModelsList = saveUserModelsListImpl as unknown as (models: ModelArtifact[]) => boolean;
export const validateModelArtifact = validateModelArtifactImpl as unknown as (
  rawInput: string | Record<string, unknown>,
  filename?: string
) => {
  valid: boolean;
  error: string | null;
  warning?: string;
  isPythonSourceOnly?: boolean;
  model?: ModelArtifact;
};
export const evaluateWithModel = evaluateWithModelImpl as unknown as (
  game: CathedralGame,
  modelArtifact?: ModelArtifact | null
) => number;
export const exportGameReplayVideo = exportGameReplayVideoImpl as unknown as (args: {
  startFen?: string;
  moves?: (string | VerboseMove)[];
  title?: string;
  result?: string;
  boardTheme?: string;
  boardFlipped?: boolean;
  resolution?: number;
  msPerMove?: number;
  fps?: number;
  onProgress?: (info: { ply: number; totalPlies: number; pct: number }) => void;
  signal?: AbortSignal;
}) => Promise<{
  ok: boolean;
  blob: Blob | null;
  url: string | null;
  mimeType: string;
  filename: string;
  sizeBytes: number;
  frameCount: number;
  error: string | null;
}>;
export const generateSmartGameFilename = generateSmartGameFilenameImpl as unknown as (args?: {
  dateIso?: string;
  playerColor?: PlayerColor;
  opponentName?: string;
  mode?: string;
  result?: string;
}) => string;

export function createGame(fen: string = DEFAULT_FEN): CathedralGame {
  return new GameCtor(fen);
}

export function createClock(
  presetId: string,
  onTick: ((state: ClockState) => void) | null,
  onTimeout: ((side: PlayerColor) => void) | null
): CathedralGameClock {
  return new ClockCtor(presetId, onTick, onTimeout);
}

export function quickEval(game: CathedralGame): number {
  return (evaluateForSideToMove as unknown as (g: CathedralGame) => number)(game);
}

export function evalWhite(game: CathedralGame, customParams: Record<string, number> | null = null): number {
  return (
    evaluatePositionWhite as unknown as (g: CathedralGame, detailed: boolean, params: Record<string, number> | null) => number
  )(game, false, customParams);
}

export function findKingSquare(game: CathedralGame, color: PlayerColor): string | null {
  for (const row of game.board()) {
    for (const cell of row) {
      if (cell && cell.color === color && cell.type === 'k') return cell.square;
    }
  }
  return null;
}

export function describeGameOver(game: CathedralGame): string | null {
  if (!game.isGameOver()) return null;
  if (game.isCheckmate()) {
    return game.turn() === 'w' ? 'Checkmate — Black wins (0–1)' : 'Checkmate — White wins (1–0)';
  }
  if (game.isStalemate()) return 'Stalemate — draw (½–½)';
  if (game.isThreefoldRepetition()) return 'Draw by threefold repetition (½–½)';
  if (game.isInsufficientMaterial()) return 'Draw by insufficient material (½–½)';
  return 'Draw by fifty-move rule (½–½)';
}

export function legalMovesFrom(game: CathedralGame, square: string): VerboseMove[] {
  if (!square) return [];
  const moves = game.moves({ square, verbose: true });
  return Array.isArray(moves) ? (moves as VerboseMove[]) : [];
}

export function allLegalMoves(game: CathedralGame): VerboseMove[] {
  const moves = game.moves({ verbose: true });
  return Array.isArray(moves) ? (moves as VerboseMove[]) : [];
}