# Architectural & Dependency Decisions (`docs/decisions.md`)

## ADR-001: Engine Architecture & Third-Party GPL Licence Compliance

- **Context**: We evaluated two paths for engine strength: (a) upgrading the custom TypeScript/JavaScript `CathedralEngine` and adding neural network evaluation (`CathedralNet`), and (b) bundling a third-party WebAssembly engine such as `nmrugg/stockfish.js` or `@lichess-org/stockfish-web`.
- **Findings**:
  1. **Licence Compatibility**: `Wizard-Chess-V3` is distributed under the **MIT License** (`package.json`). Both `stockfish.js` and `@lichess-org/stockfish-web` are licensed under the **GNU General Public License v3.0 (GPL-3.0)**, which is copyleft and incompatible with distributing inside an MIT-licensed bundle without relicensing the entire project to GPL-3.0 and providing complete corresponding source and attribution notices.
  2. **Cross-Origin Isolation & Bundle Cost**: `@lichess-org/stockfish-web` requires `SharedArrayBuffer` (`Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` HTTP headers) and multi-megabyte `.nnue` weights (`nn-1a298aa575a0.nnue`), which break zero-config static hosting and iframe previews when those headers are absent.
- **Decision**:
  - Preserve the **MIT License** and zero-backend static deployment compatibility by keeping `CathedralEngine` as the primary built-in engine.
  - Substantially strengthen `CathedralEngine` (iterative deepening, Aspiration Windows, PVS, Null-Move Pruning with Zugzwang guard, LMR, Check & 7th-Rank Pawn Extensions, Quiescence + SEE pruning, Countermove + Killer + History heuristics, configurable TT up to 64 MB, and pluggable `CathedralNet` neural / hybrid evaluation).
  - Provide an explicit, honest UCI External Worker hook in Advanced Settings so self-hosted users who supply their own GPL-3.0 `stockfish.js` worker file can connect it optionally without misrepresenting third-party engine play as Cathedral self-training.

## ADR-002: Python Model Ecosystem & Browser Inference Architecture

- **Context**: A static browser application cannot execute arbitrary uploaded `.py` files on a server or dynamically scan a server's `models/` directory at runtime. Loading a full Pyodide WebAssembly distribution (~25 MB+) on startup would severely degrade initial page load.
- **Decision**:
  1. **Top-Level `models/` Python Package**: Implement a complete, reproducible Python package (`models/pyproject.toml`, `models/architectures/`, `models/training/`, `models/evaluation/`, `models/datasets/`, `models/checkpoints/`, `models/exports/`, `models/tests/`) using `numpy` and `scipy`.
  2. **Genuine Neural Network (`CathedralNet`)**: Implement a 3-layer MLP (`780 -> 48 (ReLU) -> 24 (ReLU) -> 1 (tanh * 1500 cp)`, 38,665 parameters) trained on 2,000 positions (`models/datasets/positions_dataset.jsonl`). On the held-out test split, training reduces MAE from `659.27 cp` (untrained) to `182.99 cp` (`91.84%` sign accuracy, $r = 0.9744$), and the `Cathedral Hybrid Ensemble` (70% Classical + 30% Neural) achieves `118.03 cp` MAE ($93.6\%$ sign accuracy, $r = 0.9761$), outperforming the handcrafted classical evaluator (`129.85 cp` MAE).
  3. **Sparse-Input Browser Inference (`src/engine/modelRuntime.js`)**: Because the first 768 inputs of the 780-dim feature vector are binary piece-square indicators (at most 32 pieces on the board), our browser runtime accumulates only the active rows of `W1`, computing the exact same forward pass ~18× faster (`~41 µs/position`) with zero heap allocations inside search.
  4. **Untrusted `.py` Upload Safety**: When a user imports a `.py` file in Model Studio, it is parsed and stored as untrusted source text for inspection and interface validation, never executed with privileged access.

## ADR-003: Pure 2D SVG Rendering, L-Shaped Knight Trajectories & 1.5s Delay

- **Context**: The board must remain 2D (no Three.js/WebGL), work smoothly across desktop, Android, iPhone, and iPad (portrait and landscape), animate legal moves along accurate trajectories (including an L-shaped knight route), and provide a 1.5s opponent-response delay without wasting search time.
- **Decision**:
  - Derive move trajectories from logical square coordinates (`0..7` rank/file mapped through `boardFlipped`), rendered via percentage-based SVG overlays and Web Animations / `requestAnimationFrame` transforms so mid-animation window resizes never cause piece jumps.
  - Render Knight moves along a two-segment L-shaped polyline path (2 squares along the primary axis to the elbow waypoint, then 1 square perpendicular) with a subtle mid-flight scale elevation (`1.14x`) and a fading L-shaped SVG trail.
  - Start the engine worker search at `t = 0 ms` when the human moves, and hold presentation until `max(elapsedSearchMs, opponentDelayMs)` (default `1500 ms`), cancelling pending timers immediately on Undo, New Game, Resign, or Replay scrub.

## ADR-004: Real Video Export via Dedicated Canvas & `MediaRecorder`

- **Context**: Users need to export recorded games as real playable video files (`.webm` / `.mp4`) independently of live screen pixels.
- **Decision**:
  - Implement `src/sharing/videoExport.js` using a dedicated offscreen HTML5 `<canvas>` (`720x720` or `1080x1080`) that replays any game from its saved move list, rendering themed squares, vector piece silhouettes, move highlights, L-shaped/sliding piece interpolation, player banners, and move notation at 30 FPS into `canvas.captureStream(30)` + `MediaRecorder` (auto-detecting `video/webm;codecs=vp9`, `video/webm`, or `video/mp4`).
