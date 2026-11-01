# Wizard's Chess V3: Cathedral Evolution — System Architecture (`docs/architecture.md`)

## 1. Architectural Overview & Separation of Responsibilities

Wizard's Chess V3 is a zero-backend, local-first production chess application built with Next.js (App Router + Turbopack), React 18, TypeScript, a pure ES module chess engine, Web Workers, IndexedDB, and a companion Python model-development ecosystem (`models/`).

### Core Subsystem Boundaries

| Subsystem | Authoritative Files | Responsibility |
| :--- | :--- | :--- |
| **Orthodox Chess Rules & State** | `src/game/ChessGame.js`, `src/game/gameClock.js`, `src/engine/positionHash.js` | Single source of truth for FIDE legality: move generation, pinned-piece & check evasion validation, castling (`KQkq`), en passant, atomic promotion lock, 64-bit Zobrist repetition stack, 50-move rule, insufficient material, Static Exchange Evaluation (SEE), SAN/FEN/PGN round-tripping, and Perft. |
| **Search Engine & Super Thinking** | `src/engine/CathedralEngine.js`, `src/engine/moveOrdering.js`, `src/engine/transpositionTable.js`, `src/workers/engine.worker.js`, `src/lib/engineClient.ts` | Iterative deepening Negamax with Principal Variation Search (PVS), Aspiration Windows, Null-Move Pruning (with Zugzwang guard), Late-Move Reductions (LMR), Check & 7th-Rank Extensions, Quiescence + SEE pruning, configurable TT (`4 MB`–`64 MB`), **Super Thinking Mode** (up to `50,000,000` node ceiling), and cooperative + hard-termination worker cancellation. |
| **Model Runtime & Neural Inference** | `src/engine/evaluation.js`, `src/engine/modelRuntime.js`, `models/` | Pluggable evaluation interface (`cathedral-eval-v1`) supporting the 24-parameter tapered MG/EG evaluator (`classical_24`), the Python-trained 3-layer MLP neural network `CathedralNet` (`neural_mlp`, `780 -> 48 -> 24 -> 1`), and `hybrid_ensemble` (70% Classical + 30% Neural). |
| **2D Board, Piece Animations & Delay** | `src/components/CathedralBoard.tsx`, `src/components/PieceSvg.tsx`, `src/styles/global.css` | Pure 2D 8×8 HTML/CSS/SVG board (no Three.js), 3 piece sets (`Neo Staunton`, `Imperial Wood`, `Tournament Crystal`), 4 accessible board themes, mathematically derived piece trajectory animations (including genuine **L-shaped Knight trajectories** and fading SVG move trails), and configurable **1.5s opponent-response presentation delay**. |
| **X-Ray & Post-Game Review** | `src/xray/xrayEngine.js`, `src/analysis/moveReview.js`, `src/components/XRayOverlayPanel.tsx` | 11-layer tactical overlay distinguishing verified current position facts (attacks, defenders, SEE hanging pieces, pins, forks, skewers, overloaded defenders, king threats) from engine candidate lines and opponent reply predictions; 5-tier progressive hints; ACPL & accuracy review; tactical puzzles; and free position editor. |
| **Training Lab & Self-Play Pool** | `src/learning/learningEngine.js`, `src/workers/training.worker.js`, `src/components/TrainingLab.tsx` | Cooperative chunked/interruptible headless self-play across 16 opening roots, 8-position mandatory tactical regression gate, Sequential Probability Ratio Testing (SPRT) + confidence interval promotion gating, persistent resumable checkpoints, and downloadable reports. |
| **Persistence, Replay & Video Export** | `src/persistence/storage.js`, `src/sharing/shareUrl.js`, `src/sharing/videoExport.js`, `src/components/GameLibrary.tsx` | Versioned IndexedDB (`wizards_chess_production_db`) + `localStorage` fallback, smart sanitised game naming (`WizardChess_YYYY-MM-DD_White-vs-Opponent_Result`), folders/tags, URL-hash sharing, and real HTML5 Canvas + `MediaRecorder` WebM/MP4 video export. |

## 2. Data Flow & Concurrency Model

1. **Authoritative Move Flow & 1.5s Presentation Delay**:
   - When the human commits a legal move, `ChessGame` updates immediately and `CathedralBoard` animates the human piece along its trajectory (straight/diagonal slide or L-shaped knight hop).
   - If playing against the engine, the engine worker begins searching the new FEN **immediately** in the background (`t = 0 ms`), while a presentation timer (`default = 1500 ms`, configurable `0–3000 ms`) runs concurrently.
   - If the engine finishes searching at `t = 180 ms`, the result is held in a pending buffer until `t = 1500 ms` before applying and animating the engine's move. If the user clicks Undo, New Game, Resign, or navigates away during the delay, the pending move token is invalidated and discarded.
2. **Off-Main-Thread Super Thinking & Cancellation**:
   - Long searches run inside `engine.worker.js`. To guarantee responsive cancellation during a high-node search (up to 50,000,000 nodes), the search yields between depths and checks atomic cancellation flags every 64 nodes; additionally, `engineClient.ts` supports immediate `worker.terminate()` and worker replacement if an intensive search is aborted mid-ply.
3. **Python-to-Browser Model Pipeline**:
   - Models are authored, trained, and benchmarked in `models/` using Python (`numpy`/`scipy`) and exported as validated JSON artifacts (`models/exports/*.json`) listed in `models/registry.json`.
   - In the browser, `modelRuntime.js` validates schema and tensor dimensions before executing the sparse-input MLP forward pass (`O(active_pieces)` first-layer accumulation).
