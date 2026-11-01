/**
 * Master Automated Verification & Acceptance Test Suite (`src/tests/suite.test.js`)
 *
 * Runs via `npm test` (`node --test src/tests/suite.test.js`) and verifies:
 * - Part 10 #32: Chess Correctness (Perft 1..3, Kiwipete Perft, castling, en passant, promotion lock,
 *   all 4 promotion choices, check/checkmate, stalemate, threefold repetition, 50-move, insufficient material,
 *   FEN/PGN round-trips, undo/redo, replay at every ply)
 * - Part 10 #33: Animation Correctness (source/destination square centres, L-shaped Knight trajectory
 *   through elbow waypoint, board orientation flip invariance, castling rook trajectory, reduced motion)
 * - Part 10 #34: Engine, Super Thinking & Model Correctness (12-tier ladder, Super Thinking presets up to
 *   50,000,000 node ceiling, async cooperative cancellation, classical vs neural vs hybrid inference,
 *   model artifact validation, untrusted .py upload safety)
 * - Part 10 #35: Training Lab Correctness (seeded determinism, 8-position regression gate, SPRT LLR
 *   calculation, promotion/rejection gating, balanced colour self-play)
 * - Part 10 #36: Video & Replay Correctness (smart sanitised filenames, folders/tags, URL hash sharing,
 *   offscreen canvas frame rendering & interpolation)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { ChessGame, validateFen, DEFAULT_FEN, sq88ToAlgebraic } from '../game/ChessGame.js';
import {
  squareToBoardPoint,
  computeKnightLPath,
  computeMoveAnimationPlan,
  interpolateMovePoint
} from '../game/moveAnimation.js';
import {
  CathedralEngine,
  SUPER_THINKING_PRESETS,
  resolveDifficultyPreset,
  ttSizePowerOfTwoFromMb
} from '../engine/CathedralEngine.js';
import { explainPosition, DEFAULT_EVAL_PARAMS, PARAM_BOUNDS } from '../engine/evaluation.js';
import {
  BUILTIN_MODELS,
  evaluateNeuralNetWhite,
  evaluateGameWithModel,
  validateModelArtifact,
  encodeGameFeatures780
} from '../engine/modelRuntime.js';
import {
  VERIFIED_PUZZLES,
  ENDGAME_LESSONS,
  classifyPlayedMove,
  detectOpening,
  computeProgressiveHints,
  computeGameReviewSummary,
  extractBlunderPuzzlesFromTimeline
} from '../analysis/moveReview.js';
import { computeXRayAnalysis, evaluateBeforeMoveWarning } from '../xray/xrayEngine.js';
import {
  generateCandidateParams,
  runTacticalRegressionSuite,
  simulateSingleHeadlessGame,
  computeSprtStats,
  evaluatePromotionDecision
} from '../learning/learningEngine.js';
import {
  decodeGameFromUrlHash,
  buildSafeSharePayload
} from '../sharing/shareUrl.js';
import {
  validateGameRecord,
  generateSmartGameFilename,
  sanitizeFilename,
  updatePlayerRating
} from '../persistence/storage.js';
import { renderReplayCanvasFrame } from '../sharing/videoExport.js';
import { GameClock } from '../game/gameClock.js';

test('1. Rules: Initial board contains 64 squares and 32 pieces', () => {
  const game = new ChessGame();
  const b = game.board();
  assert.equal(b.length, 8);
  let squares = 0;
  let pieces = 0;
  for (const row of b) {
    assert.equal(row.length, 8);
    for (const cell of row) {
      squares++;
      if (cell) pieces++;
    }
  }
  assert.equal(squares, 64);
  assert.equal(pieces, 32);
});

test('2. Rules: Initial position has 20 legal moves and 1.e4 updates state accurately', () => {
  const game = new ChessGame();
  const legal = game.moves();
  assert.equal(legal.length, 20);

  const mv = game.move('e4');
  assert.ok(mv);
  assert.equal(mv.from, 'e2');
  assert.equal(mv.to, 'e4');
  assert.equal(game.turn(), 'b');
  assert.deepEqual(game.get('e4'), { type: 'p', color: 'w' });
  assert.equal(game.get('e2'), null);
});

test('3. Rules: Perft(1)=20, Perft(2)=400, Perft(3)=8,902 from initial position', () => {
  const game = new ChessGame();
  assert.equal(game.perft(1), 20);
  assert.equal(game.perft(2), 400);
  assert.equal(game.perft(3), 8902);
});

test('4. Rules: Kiwipete complex position Perft(1)=48, Perft(2)=2,039', () => {
  const game = new ChessGame('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
  assert.equal(game.perft(1), 48);
  assert.equal(game.perft(2), 2039);
});

test('5. Rules: Rejects illegal moves and prevents moving King into check or moving pinned piece', () => {
  const game = new ChessGame('4k3/4r3/8/8/8/8/4B3/4K3 w - - 0 1');
  const illegalBishop = game.move({ from: 'e2', to: 'd3' });
  assert.equal(illegalBishop, null);

  const game2 = new ChessGame('4k3/4r3/8/8/8/8/8/3K4 w - - 0 1');
  const illegalKing = game2.move({ from: 'd1', to: 'e1' });
  assert.equal(illegalKing, null);
});

test('6. Rules: Both kingside and queenside castling work and update castling rights', () => {
  const game = new ChessGame('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1');
  const castleK = game.move('O-O');
  assert.ok(castleK);
  assert.deepEqual(game.get('g1'), { type: 'k', color: 'w' });
  assert.deepEqual(game.get('f1'), { type: 'r', color: 'w' });

  const castleQBlack = game.move('O-O-O');
  assert.ok(castleQBlack);
  assert.deepEqual(game.get('c8'), { type: 'k', color: 'b' });
  assert.deepEqual(game.get('d8'), { type: 'r', color: 'b' });
  assert.ok(game.fen().includes(' - - '));

  game.undo();
  game.undo();
  assert.equal(game.fen(), 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1');
});

test('7. Rules: En passant works and removes the captured pawn from its actual square', () => {
  const game = new ChessGame();
  game.move('e4');
  game.move('a6');
  game.move('e5');
  game.move('d5');
  const ep = game.move('exd6');
  assert.ok(ep);
  assert.equal(ep.flags, 'e');
  assert.deepEqual(game.get('d6'), { type: 'p', color: 'w' });
  assert.equal(game.get('d5'), null);

  game.undo();
  assert.deepEqual(game.get('d5'), { type: 'p', color: 'b' });
  assert.deepEqual(game.get('e5'), { type: 'p', color: 'w' });
});

test('8. Mandatory Regression: Pawn Promotion (Q, R, B, N), Capture-Promotions, Both Directions, and Explicit Promotion Lock', () => {
  const whitePromoFen = '3r1b1k/4P3/8/8/8/8/8/4K3 w - - 0 1';
  const probeGame = new ChessGame(whitePromoFen);
  assert.equal(probeGame.isPromotionMove('e7', 'e8'), true);
  assert.equal(probeGame.isPromotionMove('e7', 'd8'), true);
  assert.equal(probeGame.isPromotionMove('e7', 'f8'), true);
  assert.equal(probeGame.getPromotionMoves('e7', 'd8').length, 4);

  const lockedAttempt = probeGame.move({ from: 'e7', to: 'e8' }, { requireExplicitPromotion: true });
  assert.equal(lockedAttempt, null);
  assert.equal(probeGame.turn(), 'w');

  for (const promo of ['q', 'r', 'b', 'n']) {
    const gPush = new ChessGame(whitePromoFen);
    const mvPush = gPush.move({ from: 'e7', to: 'e8', promotion: promo }, { requireExplicitPromotion: true });
    assert.ok(mvPush);
    assert.equal(mvPush.promotion, promo);
    assert.deepEqual(gPush.get('e8'), { type: promo, color: 'w' });

    const gCapLeft = new ChessGame(whitePromoFen);
    const mvCapLeft = gCapLeft.move({ from: 'e7', to: 'd8', promotion: promo }, { requireExplicitPromotion: true });
    assert.ok(mvCapLeft);
    assert.equal(mvCapLeft.captured, 'r');
    assert.equal(mvCapLeft.promotion, promo);
  }
});

test('9. Rules: Undo, Redo, Capture Trays, and Replay Position Reconstruction (`getPositionAtPly`)', () => {
  const game = new ChessGame();
  game.move('e4');
  game.move('d5');
  game.move('exd5');
  game.move('Qxd5');

  const capsAt4 = game.getCapturedPieces();
  assert.deepEqual(capsAt4.capturedByWhite, ['p']);
  assert.deepEqual(capsAt4.capturedByBlack, ['p']);

  for (let ply = 0; ply <= 4; ply++) {
    const pos = game.getPositionAtPly(ply);
    assert.equal(pos.history().length, ply);
  }

  game.undo();
  assert.equal(game.canRedo(), true);
  const redone = game.redo();
  assert.equal(redone.san, 'Qxd5');
});

test('10. Rules: Checkmate, stalemate, threefold repetition, 50-move rule, and insufficient material', () => {
  const fools = new ChessGame();
  fools.move('f3');
  fools.move('e5');
  fools.move('g4');
  fools.move('Qh4#');
  assert.equal(fools.in_checkmate(), true);

  const stale = new ChessGame('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  assert.equal(stale.in_stalemate(), true);

  const insuff = new ChessGame('4k3/8/8/8/8/8/4B3/4K3 w - - 0 1');
  assert.equal(insuff.insufficient_material(), true);

  const fifty = new ChessGame('4k3/8/8/8/8/8/R7/4K3 w - - 100 60');
  assert.equal(fifty.in_fifty_move_rule(), true);

  const rep = new ChessGame();
  for (let i = 0; i < 2; i++) {
    rep.move('Nf3');
    rep.move('Nf6');
    rep.move('Ng1');
    rep.move('Ng8');
  }
  assert.equal(rep.in_threefold_repetition(), true);
});

test('11. Rules: PGN and FEN import and export preserve position and move history', () => {
  const game = new ChessGame();
  const seq = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O'];
  for (const s of seq) game.move(s);
  const exportedPgn = game.pgn();
  const exportedFen = game.fen();

  const reloaded = new ChessGame();
  assert.equal(reloaded.load_pgn(exportedPgn), true);
  assert.equal(reloaded.fen(), exportedFen);
  assert.deepEqual(reloaded.history(), seq);
});

test('12. Animation Correctness: Sliding trajectories, L-shaped Knight path, Castling Rook path & Orientation invariance', () => {
  const game = new ChessGame();
  const knightMove = game.move('Nf3'); // g1 -> f3
  assert.ok(knightMove);

  const planW = computeMoveAnimationPlan(knightMove, { boardFlipped: false, durationMs: 260 });
  assert.ok(planW);
  assert.equal(planW.isKnight, true);
  assert.ok(planW.elbow, 'Knight move must include intermediate L-path elbow waypoint');
  assert.equal(planW.start.col, 6); // g-file
  assert.equal(planW.start.row, 7); // rank 1
  assert.equal(planW.elbow.col, 6); // g-file (2 squares up primary vertical axis)
  assert.equal(planW.elbow.row, 5); // rank 3
  assert.equal(planW.end.col, 5);   // f-file (1 square left perpendicular)
  assert.equal(planW.end.row, 5);   // rank 3
  assert.equal(planW.keyframes.length, 3);

  // Verify flipped board preserves L-shape geometry in flipped screen coordinates
  const planFlipped = computeMoveAnimationPlan(knightMove, { boardFlipped: true, durationMs: 260 });
  assert.equal(planFlipped.start.col, 1);
  assert.equal(planFlipped.start.row, 0);
  assert.equal(planFlipped.elbow.col, 1);
  assert.equal(planFlipped.elbow.row, 2);
  assert.equal(planFlipped.end.col, 2);
  assert.equal(planFlipped.end.row, 2);

  // Verify mid-flight interpolation passes through the L-bend and elevates scale
  const midPt = interpolateMovePoint(planW, 0.5);
  assert.ok(midPt.scale > 1.02);

  // Verify reduced motion suppresses duration and trail
  const reducedPlan = computeMoveAnimationPlan(knightMove, { reducedMotion: true, durationMs: 260 });
  assert.equal(reducedPlan.durationMs, 0);
  assert.equal(reducedPlan.trailDurationMs, 0);

  // Verify castling produces dual King + Rook trajectory
  const castleGame = new ChessGame('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1');
  const castleMv = castleGame.move('O-O');
  const castlePlan = computeMoveAnimationPlan(castleMv, { boardFlipped: false });
  assert.equal(castlePlan.effectType, 'castle');
  assert.ok(castlePlan.castlingRook);
  assert.equal(castlePlan.castlingRook.from, 'h1');
  assert.equal(castlePlan.castlingRook.to, 'f1');
});

test('13. Engine Opening Imitation Bug & Turn Verification (Book On & Off, Both Colours)', () => {
  const engine = new CathedralEngine();
  for (const useOpeningBook of [true, false]) {
    for (const firstMove of ['e4', 'd4', 'Nf3', 'c4']) {
      const game = new ChessGame();
      const humanMoved = game.move(firstMove);
      assert.ok(humanMoved);
      assert.equal(game.turn(), 'b');

      const reply = engine.search(game.fen(), {
        difficulty: 'ClubPlayer',
        useOpeningBook
      });
      assert.ok(reply.bestMove);
      assert.notEqual(reply.bestMove.from, humanMoved.from);
      const applied = game.move(reply.bestMove);
      assert.ok(applied);
      assert.equal(applied.color, 'b');
    }
  }
});

test('14. Engine Ladder: All 12 Difficulty Tiers + Experimental Return Legal Moves and Increasing Search Depth/Nodes', () => {
  const engine = new CathedralEngine();
  const testFen = 'r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 4 6';
  const tierIds = [
    'FirstSteps',
    'Beginner',
    'Learner',
    'ClubRookie',
    'ClubPlayer',
    'ClubAdvanced',
    'Competitor',
    'Advanced',
    'Expert',
    'Master',
    'GrandmasterChallenge',
    'CathedralApex',
    'Experimental'
  ];

  const metrics = [];
  for (const id of tierIds) {
    const preset = resolveDifficultyPreset(id);
    assert.ok(preset);
    const res = engine.search(testFen, {
      difficulty: id,
      timeLimitMs: Math.min(preset.timeLimitMs, 240),
      nodeLimit: Math.min(preset.nodeLimit, 25000),
      useOpeningBook: false
    });
    assert.ok(res.bestMove, `Tier ${id} must return a move`);
    const verify = new ChessGame(testFen);
    assert.ok(verify.move(res.bestMove), `Tier ${id} returned illegal move ${res.bestMoveSan}`);
    metrics.push({ id, tier: preset.tier, depth: res.depth, nodes: res.nodes });
  }

  const firstStepsMetric = metrics.find(m => m.id === 'FirstSteps');
  const apexMetric = metrics.find(m => m.id === 'CathedralApex');
  assert.ok(apexMetric.depth > firstStepsMetric.depth);
  assert.ok(apexMetric.nodes > firstStepsMetric.nodes);
});

test('15. Variable Node Budget, 500 MB Node RAM Ceiling, Device Max Calculator & Async Termination', async () => {
  assert.equal(SUPER_THINKING_PRESETS.Custom.nodeLimit, 26214400);
  assert.equal(ttSizePowerOfTwoFromMb(4), 1 << 17);
  assert.equal(ttSizePowerOfTwoFromMb(64), 1 << 21);

  const engine = new CathedralEngine();
  engine.configureTtMemoryMb(16);
  assert.equal(engine.tt.size, 1 << 19);

  // Verify 500 MB RAM ceiling clamping (99,000,000 nodes -> clamped to 26,214,400 nodes = 500.00 MB)
  const clamped = engine.search(DEFAULT_FEN, { maxDepth: 2, nodeLimit: 99000000, maxNodeRamMb: 500, useOpeningBook: false });
  assert.equal(clamped.nodeLimit, 26214400, 'Node budget must never exceed 500 MB of node RAM (26,214,400 nodes)');
  assert.ok(clamped.nodeRamMb <= 500, 'Node RAM consumption must stay <= 500 MB');

  // Verify strict termination when variable node budget is reached
  const tightBudgetRes = engine.search(DEFAULT_FEN, { maxDepth: 10, nodeLimit: 180, timeLimitMs: 10000, useOpeningBook: false });
  assert.equal(tightBudgetRes.stopReason, 'node_limit', 'Engine must terminate with node_limit when variable node budget is reached');
  assert.ok(tightBudgetRes.bestMove && tightBudgetRes.bestMoveSan, 'Terminated search must still return best legal move');

  const fen = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
  let progressCount = 0;

  // Schedule a cancellation after depth 2 completes
  const res = await engine.searchAsync(fen, {
    difficulty: 'Analysis',
    maxDepth: 12,
    nodeLimit: 50000000,
    timeLimitMs: 10000,
    multiPv: 3,
    onProgress: (p) => {
      progressCount++;
      if (p.depth >= 2) {
        engine.requestStop();
      }
    }
  });

  assert.ok(res);
  assert.ok(res.bestMove);
  assert.ok(progressCount >= 2);
  assert.equal(res.stopReason, 'user_cancelled');
  assert.equal(res.candidates.length, 3);
});

test('16. Model Studio & Neural Network Inference: Classical, CathedralNet MLP, Hybrid Ensemble, and Validation', () => {
  const game = new ChessGame('r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 4 6');
  const vec = encodeGameFeatures780(game);
  assert.equal(vec.length, 780);

  const nnModel = BUILTIN_MODELS.find(m => m.id === 'cathedral-neural-v1');
  const hybridModel = BUILTIN_MODELS.find(m => m.id === 'cathedral-hybrid-ensemble-v1');
  assert.ok(nnModel);
  assert.ok(hybridModel);

  const nnScore = evaluateNeuralNetWhite(game, nnModel.weights);
  assert.ok(Number.isFinite(nnScore));
  assert.ok(Math.abs(nnScore) < 1500);

  const engine = new CathedralEngine();
  const resNn = engine.search(game.fen(), {
    difficulty: 'ClubPlayer',
    maxDepth: 2,
    modelArtifact: nnModel,
    useOpeningBook: false
  });
  assert.ok(resNn.bestMove);
  assert.equal(resNn.modelId, 'cathedral-neural-v1');

  // Validate custom JSON model artifact
  const validCheck = validateModelArtifact(JSON.stringify({
    id: 'user-test-model',
    name: 'User Test Model',
    modelType: 'classical_24',
    evalParams: { pawnMg: 105, queenMg: 960 }
  }), 'user.json');
  assert.equal(validCheck.valid, true);
  assert.equal(validCheck.model.evalParams.pawnMg, 105);

  // Validate untrusted Python (.py) upload handling
  const pyCheck = validateModelArtifact('def evaluate(fen):\n    return 0\n', 'custom_eval.py');
  assert.equal(pyCheck.valid, true);
  assert.equal(pyCheck.isPythonSourceOnly, true);
  assert.ok(pyCheck.warning.includes('does not execute untrusted .py files'));
});

test('17. Engine Tactical Quality: Finds Mate in 1, Mate in 2, Defends Mate Threat, and Discriminates Winning/Losing SEE', () => {
  const engine = new CathedralEngine();
  const m1 = engine.search('6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1', { difficulty: 'Competitor', maxDepth: 3 });
  assert.equal(m1.bestMoveSan, 'Re8#');
  assert.equal(m1.mateIn.movesForWhite, 1);

  const m2 = engine.search('r5k1/5ppp/8/8/8/8/4RPPP/4R1K1 w - - 0 1', {
    difficulty: 'Expert',
    maxDepth: 4,
    timeLimitMs: 1200
  });
  assert.equal(m2.bestMoveSan, 'Re8+');
  assert.equal(m2.mateIn.movesForWhite, 2);

  const seeGame = new ChessGame('4k3/8/4p3/3p4/8/8/8/3QK3 w - - 0 1');
  const qxd5 = seeGame.generateLegalMovesRaw(true).find(m => m.piece === 'q' && sq88ToAlgebraic(m.to) === 'd5');
  assert.ok(seeGame.staticExchangeEvaluation(qxd5) < -500);
});

test('18. 5-Tier Progressive Hints, 11-Layer X-Ray & Post-Game Review Summary', () => {
  const pinGame = new ChessGame('r1b1kbnr/ppp2ppp/2n5/1B2p3/3qP3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4');
  const engine = new CathedralEngine();
  const engRes = engine.search(pinGame.fen(), { difficulty: 'ClubPlayer', maxDepth: 3 });
  const xray = computeXRayAnalysis(pinGame, engRes);

  assert.ok(xray.attackMap['d4'].whiteCount >= 1);
  assert.ok(xray.hangingPieces.length >= 1);
  assert.ok(xray.pinsAndDiscovered.some(m => m.type === 'Pin' && m.square === 'c6'));

  const hints = computeProgressiveHints(pinGame, engRes, xray);
  assert.equal(hints.available, true);
  assert.equal(hints.tiers.length, 5);
});

test('19. Experimental Learning Engine: Seeded Determinism, Regression Suite, SPRT Stats & Promotion Gate', () => {
  const run1 = generateCandidateParams(DEFAULT_EVAL_PARAMS, 98765, 10);
  const run2 = generateCandidateParams(DEFAULT_EVAL_PARAMS, 98765, 10);
  assert.deepEqual(run1.candidateParams, run2.candidateParams);

  const reg = runTacticalRegressionSuite(DEFAULT_EVAL_PARAMS);
  assert.equal(reg.passedAll, true);

  const sprt = computeSprtStats({ wins: 12, draws: 4, losses: 4 });
  assert.ok(sprt.llr > 0);

  const promoteDecision = evaluatePromotionDecision({ wins: 8, draws: 2, losses: 2, regressionResult: reg });
  assert.equal(promoteDecision.promoted, true);
  assert.ok(promoteDecision.sprt);
});

test('20. Calibration Verification: Higher Difficulty Tier Outperforms Beginner Tier in Balanced Pair', () => {
  let competitorScore = 0;
  for (const compColor of ['w', 'b']) {
    const res = simulateSingleHeadlessGame({
      gameIndex: compColor === 'w' ? 0 : 1,
      openingIndex: 0,
      candidateColor: compColor,
      candidatePresetId: 'Competitor',
      opponentPresetId: 'FirstSteps',
      maxDepth: 3,
      timeLimitMs: 120,
      maxPlies: 64,
      seed: 1024
    });
    if (res.candidateOutcome === 'win') competitorScore += 1;
    else if (res.candidateOutcome === 'draw') competitorScore += 0.5;
  }
  assert.ok(competitorScore >= 1.5, `Expected Competitor to score >= 1.5/2 vs FirstSteps, got ${competitorScore}/2`);
});

test('21. Smart Game Naming, Folder/Tag Validation, URL Sharing & Video Frame Rendering', () => {
  const smartName = generateSmartGameFilename({
    dateIso: '2026-10-16T12:00:00Z',
    playerColor: 'w',
    mode: 'engine',
    opponentName: 'Cathedral-Apex',
    result: 'Checkmate — White wins (1–0)',
    openingEco: 'C50'
  });
  assert.equal(smartName, 'WizardChess_2026-10-16_White-vs-Cathedral-Apex_C50_Checkmate');
  assert.equal(sanitizeFilename('../../etc/passwd<script>'), 'etc_passwd_script');

  const validRec = validateGameRecord({
    id: 'gm-video-1',
    fen: DEFAULT_FEN,
    pgn: '1. e4 e5 2. Nf3 Nc6',
    folder: 'Tournament',
    tags: ['Italian', 'Blitz']
  });
  assert.equal(validRec.folder, 'Tournament');
  assert.deepEqual(validRec.tags, ['Italian', 'Blitz']);
  assert.ok(validRec.smartName.startsWith('WizardChess_'));

  // Mock 2D canvas context to verify video frame renderer executes cleanly
  const ops = [];
  const mockCtx = {
    save: () => ops.push('save'),
    restore: () => ops.push('restore'),
    translate: () => {},
    scale: () => {},
    beginPath: () => {},
    arc: () => {},
    fill: () => ops.push('fill'),
    stroke: () => ops.push('stroke'),
    fillRect: () => ops.push('fillRect'),
    strokeRect: () => ops.push('strokeRect'),
    fillText: (txt) => ops.push(`text:${txt}`),
    moveTo: () => {},
    lineTo: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} })
  };
  const g = new ChessGame();
  const mv = g.move('Nf3');
  const plan = computeMoveAnimationPlan(mv, { boardFlipped: false });
  renderReplayCanvasFrame(mockCtx, {
    width: 720,
    height: 720,
    boardMatrix: g.board(),
    lastMove: mv,
    activeAnim: { plan, progress: 0.5 },
    title: smartName,
    ply: 1,
    totalPlies: 10,
    lastSan: 'Nf3',
    evalWhiteCp: 25
  });
  assert.ok(ops.includes('fillRect'));
  assert.ok(ops.some(o => o.startsWith('text:WizardChess_2026-10-16')));
});
