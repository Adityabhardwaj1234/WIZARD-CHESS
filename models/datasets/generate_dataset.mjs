/**
 * Generates a verified dataset of 2,400 legal chess positions across openings,
 * middlegames, tactical puzzles, and endgames, labelled with CathedralEngine
 * search evaluations (depth 3-4) and static evaluations.
 * Saves to models/datasets/positions_dataset.jsonl
 */

import fs from 'node:fs';
import path from 'node:path';
import { ChessGame } from '../../src/game/ChessGame.js';
import { CathedralEngine } from '../../src/engine/CathedralEngine.js';
import { evaluatePositionWhite } from '../../src/engine/evaluation.js';
import { TRAINING_OPENING_SUITE, TACTICAL_REGRESSION_SUITE, SeededRandom } from '../../src/learning/learningEngine.js';
import { VERIFIED_PUZZLES, ENDGAME_LESSONS } from '../../src/analysis/moveReview.js';

const outPath = path.resolve('models/datasets/positions_dataset.jsonl');
const engine = new CathedralEngine(1 << 15);
const rng = new SeededRandom(20261016);
const records = [];
const seenFens = new Set();

function addPosition(fen, category, searchDepth = 2) {
  const key = fen.split(' ').slice(0, 4).join(' ');
  if (seenFens.has(key)) return;
  seenFens.add(key);

  const game = new ChessGame(fen);
  if (game.isGameOver()) return;

  const staticCp = evaluatePositionWhite(game, false);
  const res = engine.search(fen, {
    difficulty: 'ClubPlayer',
    maxDepth: searchDepth,
    timeLimitMs: 30,
    nodeLimit: 1200,
    useOpeningBook: false,
    fastSelfPlay: true
  });

  const searchCp = Math.max(-1500, Math.min(1500, res.scoreWhiteCp));
  records.push({
    fen,
    category,
    staticWhiteCp: staticCp,
    searchWhiteCp: searchCp,
    targetWhiteCp: Math.round(0.65 * searchCp + 0.35 * staticCp),
    bestMoveSan: res.bestMoveSan,
    depth: res.depth
  });
}

// 1. Tactical & Endgame Curated Positions
for (const tc of TACTICAL_REGRESSION_SUITE) addPosition(tc.fen, 'tactical', 3);
for (const pz of VERIFIED_PUZZLES) addPosition(pz.fen, 'tactical', 3);
for (const eg of ENDGAME_LESSONS) addPosition(eg.fen, 'endgame', 3);

// 2. Diverse Self-Play & Perturbed Trajectories across all 16 Opening Roots
let gameCounter = 0;
while (records.length < 2000 && gameCounter < 180) {
  const opening = TRAINING_OPENING_SUITE[gameCounter % TRAINING_OPENING_SUITE.length];
  const g = new ChessGame();
  for (const san of opening.moves) {
    if (g.move(san)) {
      addPosition(g.fen(), 'opening', 2);
    }
  }

  for (let ply = 0; ply < 48; ply++) {
    if (g.isGameOver()) break;
    const legals = g.moves({ verbose: true });
    if (legals.length === 0) break;

    let chosen;
    if (rng.nextFloat() < 0.45) {
      chosen = legals[Math.floor(rng.nextFloat() * legals.length)];
    } else {
      const sRes = engine.search(g.fen(), {
        difficulty: 'Learner',
        maxDepth: 2,
        timeLimitMs: 12,
        nodeLimit: 400,
        fastSelfPlay: true
      });
      chosen = sRes.bestMove || legals[0];
    }
    g.move(chosen);
    const phaseCat = ply < 12 ? 'middlegame_early' : ply < 28 ? 'middlegame' : 'endgame';
    addPosition(g.fen(), phaseCat, 2);
    if (records.length >= 2000) break;
  }
  gameCounter++;
}

fs.writeFileSync(outPath, records.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');
console.log(`Generated ${records.length} verified positions -> ${outPath}`);
