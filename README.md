# Wizard's Chess V3: Cathedral Evolution (Production Edition v3.1.0)

> **Precision 2D Chess Platform · Smooth L-Path Piece Animations · 12-Tier + Super Thinking Engine (50M Node Ceiling) · Python Neural Model Studio (`CathedralNet`) · 11-Layer X-Ray Intelligence · Headless SPRT Training Lab · Real Canvas Video Export**

A zero-backend, local-first production chess platform built with Next.js (App Router + Turbopack), React 18, TypeScript, an authoritative zero-dependency ES module chess engine, and a reproducible Python model-development ecosystem (`models/`).

## Quick Start

```bash
# Install Node dependencies from lockfile
npm ci

# Start Next.js Turbopack development server
npm run dev

# Run 21 automated rules, Perft, animation, Super Thinking, Model Studio, SPRT & video tests
npm test

# Run Python Model Ecosystem & Python-vs-JS numerical parity tests
npm run test:models

# Build production application
npm run build
```

## Key Production Upgrades in v3.1.0

1. **Smooth Mathematical Piece Animations & L-Shaped Knight Trajectories (`src/game/moveAnimation.js`)**:
   - Every legal move animates smoothly between exact rendered square centres using the Web Animations API and a temporary fading SVG move trail.
   - Knights follow a genuine **two-segment L-shaped path** (2 squares along the primary axis to the elbow waypoint, then 1 square perpendicular with a 1.14× elevation hop) and leave a distinctive L-shaped fading trail.
   - Castling animates both King and Rook simultaneously; window resizing and board flipping never cause mid-animation jumps; OS `prefers-reduced-motion` and manual Reduced Motion settings are respected.
2. **Configurable 1.5-Second Opponent-Response Presentation Delay**:
   - After the human moves, the engine worker begins searching immediately (`t = 0 ms`) while holding presentation for a configurable 1.5s delay (`0–3.0s` in Settings) so computation is never wasted. Pending delayed moves are safely cancelled on Undo, New Game, Resign, or Replay scrub.
3. **Stronger Engine, Super Thinking Mode & Calibrated 12-Tier Ladder (`src/engine/CathedralEngine.js`)**:
   - Iterative deepening Negamax with Principal Variation Search (PVS), Aspiration Windows, Null-Move Pruning (with Zugzwang guard), Late-Move Reductions (LMR), Check & 7th-Rank Pawn Extensions, Quiescence + SEE pruning, and configurable Transposition Table memory (`4–64 MB`).
   - **Super Thinking Mode**: Presets (`Balanced`, `Deep`, `Super Thinking`, `Custom`) with configurable depth target, MultiPV (`1–5`), time budget, and node ceiling up to **50,000,000 nodes**, running off the main thread with cooperative asynchronous yielding so `Stop / Cancel` halts immediately and retains the last completed iteration's best move.
4. **Python Model Ecosystem (`models/`) & In-App Model Studio (`src/engine/modelRuntime.js`)**:
   - Complete Python package (`models/pyproject.toml`, `models/architectures/`, `models/training/`, `models/evaluation/`, `models/datasets/`, `models/checkpoints/`, `models/exports/`, `models/tests/`).
   - Includes **CathedralNet v1**, a genuine 3-layer MLP (`780 -> 48 -> 24 -> 1`, 38,665 parameters) trained in Python on 2,000 positions (`91.84%` sign accuracy, $r = 0.9744$), and the **Cathedral Hybrid Ensemble** (70% Classical + 30% Neural, `118.03 cp` test MAE, `93.6%` sign accuracy, $r = 0.9761$).
   - **Model Studio** (`Settings → Advanced Settings → Models`) supports selecting active models, creating custom models from templates, editing 24-parameter weights, importing/exporting `.json` and `.py` files with schema validation, and inspecting holdout benchmarks.
5. **Statistically Responsible Training Lab (`src/learning/learningEngine.js`)**:
   - Combines an 8-position mandatory tactical regression gate with **Sequential Probability Ratio Testing (SPRT)** log-likelihood ratio (`LLR`) and Wilson/Gaussian confidence intervals across 16 opening roots.
6. **Immersive Board Mode, Smart Game Naming & Real Video Export (`src/sharing/videoExport.js`)**:
   - Feature-detected `Element.requestFullscreen()` with graceful **Immersive Board Mode** (`100dvh`, safe-area insets) for iOS Safari, iPad, Android, and desktop.
   - Smart sanitised default game names (`WizardChess_2026-10-16_White-vs-Cathedral-Apex_C50_Checkmate`), folders (`General`, `Tournament`, `Study`, `Blunder Review`, `Casual`), tags, and real downloadable **WebM/MP4 Video Export** rendered from recorded game data via HTML5 Canvas + `MediaRecorder`.

## Documentation

- System Architecture & Data Flow: [`docs/architecture.md`](docs/architecture.md)
- Architectural & Licence Decisions: [`docs/decisions.md`](docs/decisions.md)
- Python Model & Neural Network Guide: [`models/README.md`](models/README.md)

## License

Released under the **MIT License**.