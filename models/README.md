# Wizard's Chess V3 — Python Model & Neural Network Ecosystem (`models/`)

This directory contains the local Python model development, training, evaluation, and browser-artifact export workflow for **Wizard's Chess V3: Cathedral Evolution**.

## Architecture Overview

A static browser deployment cannot execute arbitrary untrusted `.py` files on a backend server, nor should every casual player be forced to download a 25 MB+ Python runtime on initial page load. Therefore, the model system separates responsibilities cleanly:

1. **Python Source Models (`models/architectures/`)**:
   - `classical_eval.py`: 780-dimensional FEN feature encoder (`encode_fen_features`) and the 24-parameter tapered Middlegame/Endgame evaluator (`evaluate_fen_classical`), maintaining 100% numerical parity with `src/engine/evaluation.js`.
   - `cathedral_net.py`: **CathedralNet**, a genuine 3-layer Multi-Layer Perceptron (`780 -> 48 (ReLU) -> 24 (ReLU) -> 1 (tanh * 1500 cp)`) with analytical backpropagation, L2 regularization, and Adam optimization.
2. **Dataset Generation (`models/datasets/`)**:
   - `generate_dataset.mjs`: Generates 2,000+ diverse, verified legal positions across 16 opening roots, middlegame trajectories, tactical puzzles, and endgame studies, labelled with teacher search evaluations (`positions_dataset.jsonl`).
3. **Training & SPSA Tuning (`models/training/`)**:
   - `train_nn.py`: Trains `CathedralNet` on a deterministic 70/15/15 train/validation/test split, records MSE, MAE (cp), sign accuracy, and Pearson correlation $r$, saves compressed NumPy checkpoints (`models/checkpoints/cathedral_net_v1.npz`), and exports browser-compatible JSON artifacts (`models/exports/cathedral_net_v1.json`, `cathedral_hybrid_v1.json`).
   - `train_spsa.py`: Tunes the 24-parameter classical evaluation vector via Simultaneous Perturbation Stochastic Approximation (`models/exports/cathedral_spsa_v1.json`).
4. **Evaluation & Cross-Language Parity (`models/evaluation/` & `models/tests/`)**:
   - `benchmark_models.py`: Evaluates all models in `models/registry.json` on the held-out test split and outputs `models/exports/benchmark_report.json`.
   - `test_models.py`: Verifies feature encoding, neural forward/backward passes, schema validity, and exact numerical consistency ($\le 1\text{ cp}$) between Python inference and Node.js/Browser inference (`src/engine/modelRuntime.js`).

## Quick Start & Reproducible Commands

```bash
# 1. Generate the 2,000-position training/validation/test dataset
node models/datasets/generate_dataset.mjs

# 2. Train CathedralNet neural network & export browser artifacts
PYTHONPATH=. python3 models/training/train_nn.py

# 3. Run SPSA 24-parameter optimization
PYTHONPATH=. python3 models/training/train_spsa.py

# 4. Benchmark all registered models on held-out test positions
PYTHONPATH=. python3 models/evaluation/benchmark_models.py

# 5. Build an example custom model artifact
PYTHONPATH=. python3 models/examples/custom_model_example.py

# 6. Run Python unit & Python-vs-JS numerical parity tests
PYTHONPATH=. python3 -m unittest discover -s models/tests -v
```

## Input & Output Specification (`cathedral-eval-v1`)

- **Input Feature Vector (`780` floats)**:
  - `[0..767]`: 12 binary piece planes (`P, N, B, R, Q, K, p, n, b, r, q, k`) $\times$ 64 squares (`a8=0 .. h1=63`).
  - `[768]`: Side to move (`+1.0` White, `-1.0` Black).
  - `[769..772]`: Castling rights (`WK, WQ, BK, BQ` $\in \{0.0, 1.0\}$).
  - `[773]`: Normalized game phase (`0.0` endgame to `1.0` opening).
  - `[774..779]`: Normalized material & bishop-pair differentials.
- **Output Convention**:
  - Scalar evaluation in **centipawns from White's perspective** (`+100` = +1.00 pawn advantage for White; `-100` = +1.00 pawn advantage for Black).
