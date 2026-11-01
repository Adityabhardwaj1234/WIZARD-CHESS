"""
Seeded SPSA (Simultaneous Perturbation Stochastic Approximation) 24-Parameter
Evaluation Optimizer in Python.
"""

import json
import os
import sys
from datetime import datetime, timezone
import numpy as np

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
from models.architectures.classical_eval import DEFAULT_EVAL_PARAMS, evaluate_fen_classical

PARAM_BOUNDS = {
    "pawnMg": (85, 115),
    "knightMg": (280, 360),
    "bishopMg": (295, 375),
    "rookMg": (450, 560),
    "queenMg": (860, 1020),
    "pawnEg": (95, 140),
    "knightEg": (270, 350),
    "bishopEg": (300, 380),
    "rookEg": (480, 590),
    "queenEg": (880, 1040),
    "pstScaleMg": (70, 135),
    "pstScaleEg": (70, 135),
    "bishopPairMg": (15, 60),
    "bishopPairEg": (20, 75),
    "mobilityWeight": (1, 9),
    "kingShieldBonus": (5, 28),
    "kingZoneAttack": (4, 26),
    "isolatedPawnPen": (5, 28),
    "doubledPawnPen": (5, 28),
    "passedPawnScale": (70, 150),
    "rookOpenFile": (10, 42),
    "rookSeventh": (10, 45),
    "outpostBonus": (6, 35),
    "tempoBonus": (5, 22),
}


def loss_on_dataset(params: dict, records: list) -> float:
    errs = []
    for r in records:
        pred = evaluate_fen_classical(r["fen"], params)
        errs.append((pred - r["targetWhiteCp"]) ** 2)
    return float(np.mean(errs))


def run_spsa_optimization(records: list, iterations: int = 30, seed: int = 202610) -> tuple[dict, list]:
    rng = np.random.default_rng(seed)
    keys = list(PARAM_BOUNDS.keys())
    theta = np.array([float(DEFAULT_EVAL_PARAMS[k]) for k in keys], dtype=np.float64)
    spans = np.array([float(PARAM_BOUNDS[k][1] - PARAM_BOUNDS[k][0]) for k in keys], dtype=np.float64)

    history = []
    subset = records[:400]

    for k in range(1, iterations + 1):
        ck = 0.04 / (k ** 0.16)
        ak = 0.008 / ((k + 10) ** 0.602)
        delta = rng.choice([-1.0, 1.0], size=len(keys))
        pert = ck * spans * delta

        theta_plus = np.clip(
            theta + pert,
            [PARAM_BOUNDS[key][0] for key in keys],
            [PARAM_BOUNDS[key][1] for key in keys],
        )
        theta_minus = np.clip(
            theta - pert,
            [PARAM_BOUNDS[key][0] for key in keys],
            [PARAM_BOUNDS[key][1] for key in keys],
        )

        p_plus = {keys[i]: int(round(theta_plus[i])) for i in range(len(keys))}
        p_minus = {keys[i]: int(round(theta_minus[i])) for i in range(len(keys))}

        loss_plus = loss_on_dataset(p_plus, subset)
        loss_minus = loss_on_dataset(p_minus, subset)

        grad_est = (loss_plus - loss_minus) / (2.0 * pert + 1e-9)
        theta = np.clip(
            theta - ak * grad_est,
            [PARAM_BOUNDS[key][0] for key in keys],
            [PARAM_BOUNDS[key][1] for key in keys],
        )
        if k % 5 == 0 or k == 1 or k == iterations:
            cur_p = {keys[i]: int(round(theta[i])) for i in range(len(keys))}
            cur_rmse = float(np.sqrt(loss_on_dataset(cur_p, subset)))
            history.append({"iteration": k, "rmseCp": round(cur_rmse, 2)})

    optimized = {keys[i]: int(round(theta[i])) for i in range(len(keys))}
    return optimized, history


if __name__ == "__main__":
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    dataset_path = os.path.join(base_dir, "datasets", "positions_dataset.jsonl")
    records = [json.loads(line) for line in open(dataset_path, "r", encoding="utf-8") if line.strip()]
    opt_params, hist = run_spsa_optimization(records, iterations=25, seed=202610)
    artifact = {
        "schemaVersion": 1,
        "id": "cathedral-spsa-python-v1",
        "name": "Cathedral SPSA Tuned Vector v1",
        "version": "1.0.0",
        "modelType": "classical_24",
        "supportedEngineInterface": "cathedral-eval-v1",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "trained": True,
        "description": "24-parameter evaluation vector tuned via Python SPSA against search targets.",
        "architecture": {"type": "Tapered-24-Param", "parameterCount": 24},
        "evalParams": opt_params,
        "trainingMetadata": {"method": "SPSA-24", "history": hist},
    }
    out_path = os.path.join(base_dir, "exports", "cathedral_spsa_v1.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(artifact, f, indent=2)
    print(f"Exported SPSA model -> {out_path}")
