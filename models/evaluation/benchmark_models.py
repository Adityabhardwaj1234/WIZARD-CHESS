"""
Benchmarks all registered models in models/exports/ on the held-out test set
and tactical/endgame suites, producing models/exports/benchmark_report.json.
"""

import json
import os
import sys
import time
import numpy as np

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
from models.architectures.classical_eval import encode_fen_features, evaluate_fen_classical
from models.architectures.cathedral_net import CathedralNet, OUTPUT_CP_SCALE


def evaluate_artifact_on_fens(artifact: dict, fens: list[str], X: np.ndarray) -> np.ndarray:
    mtype = artifact["modelType"]
    if mtype == "classical_24":
        params = artifact.get("evalParams", {})
        return np.array([evaluate_fen_classical(f, params) for f in fens], dtype=np.float32)
    elif mtype == "neural_mlp":
        w = artifact["weights"]
        W1 = np.array(w["W1"], dtype=np.float32)
        b1 = np.array(w["b1"], dtype=np.float32)
        W2 = np.array(w["W2"], dtype=np.float32)
        b2 = np.array(w["b2"], dtype=np.float32)
        W3 = np.array(w["W3"], dtype=np.float32)[:, None]
        b3 = np.array([w["b3"]], dtype=np.float32)
        a1 = np.maximum(0.0, X @ W1 + b1)
        a2 = np.maximum(0.0, a1 @ W2 + b2)
        y = np.tanh(a2 @ W3 + b3)[:, 0] * OUTPUT_CP_SCALE
        return y.astype(np.float32)
    elif mtype == "hybrid_ensemble":
        params = artifact.get("evalParams", {})
        c_preds = np.array([evaluate_fen_classical(f, params) for f in fens], dtype=np.float32)
        w = artifact["weights"]
        W1 = np.array(w["W1"], dtype=np.float32)
        b1 = np.array(w["b1"], dtype=np.float32)
        W2 = np.array(w["W2"], dtype=np.float32)
        b2 = np.array(w["b2"], dtype=np.float32)
        W3 = np.array(w["W3"], dtype=np.float32)[:, None]
        b3 = np.array([w["b3"]], dtype=np.float32)
        a1 = np.maximum(0.0, X @ W1 + b1)
        a2 = np.maximum(0.0, a1 @ W2 + b2)
        n_preds = np.tanh(a2 @ W3 + b3)[:, 0] * OUTPUT_CP_SCALE
        cw = float(artifact.get("architecture", {}).get("classicalWeight", 0.7))
        nw = float(artifact.get("architecture", {}).get("neuralWeight", 0.3))
        return (cw * c_preds + nw * n_preds).astype(np.float32)
    raise ValueError(f"Unsupported modelType: {mtype}")


def main():
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    dataset_path = os.path.join(base_dir, "datasets", "positions_dataset.jsonl")
    records = [json.loads(line) for line in open(dataset_path, "r", encoding="utf-8") if line.strip()]

    rng = np.random.default_rng(20261016)
    perm = rng.permutation(len(records))
    n_train = int(0.70 * len(records))
    n_val = int(0.15 * len(records))
    test_records = [records[i] for i in perm[n_train + n_val :]]

    fens = [r["fen"] for r in test_records]
    true_cp = np.array([float(r["targetWhiteCp"]) for r in test_records], dtype=np.float32)
    X_test = np.stack([encode_fen_features(f) for f in fens])

    registry = json.load(open(os.path.join(base_dir, "registry.json"), "r", encoding="utf-8"))
    report_items = []

    for item in registry["models"]:
        art_path = os.path.join(os.path.dirname(base_dir), item["artifactPath"])
        artifact = json.load(open(art_path, "r", encoding="utf-8"))
        t0 = time.perf_counter()
        preds = evaluate_artifact_on_fens(artifact, fens, X_test)
        elapsed_ms = (time.perf_counter() - t0) * 1000.0

        diff = preds - true_cp
        mae = float(np.mean(np.abs(diff)))
        rmse = float(np.sqrt(np.mean(diff * diff)))
        mask = np.abs(true_cp) >= 25.0
        sign_acc = float(np.mean(np.sign(preds[mask]) == np.sign(true_cp[mask])) * 100.0)
        corr = float(np.corrcoef(preds, true_cp)[0, 1])

        report_items.append({
            "id": item["id"],
            "name": item["name"],
            "version": item["version"],
            "modelType": item["modelType"],
            "trained": item["trained"],
            "testCount": len(fens),
            "maeCp": round(mae, 2),
            "rmseCp": round(rmse, 2),
            "signAccuracyPct": round(sign_acc, 2),
            "pearsonR": round(corr, 4),
            "inferenceLatencyUsPerPos": round((elapsed_ms * 1000.0) / len(fens), 2),
        })

    out_report = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "testSetSize": len(fens),
        "models": report_items,
    }
    report_path = os.path.join(base_dir, "exports", "benchmark_report.json")
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(out_report, f, indent=2)

    print("=== Model Benchmark Report ===")
    for m in report_items:
        print(
            f"{m['id']:30s} | Type={m['modelType']:15s} | MAE={m['maeCp']:6.2f}cp | "
            f"SignAcc={m['signAccuracyPct']:5.1f}% | r={m['pearsonR']:.4f} | {m['inferenceLatencyUsPerPos']:6.2f} us/pos"
        )


if __name__ == "__main__":
    main()
