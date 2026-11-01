"""
Example: End-to-End Custom Model Creation, Training, and Export for Wizard's Chess V3
=====================================================================================
Run locally via:
    python3 models/examples/custom_model_example.py

Produces `models/exports/custom_positional_example.json`, which can be imported
directly in Settings -> Advanced Settings -> Model Studio -> Import Model.
"""

import json
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
from models.architectures.classical_eval import DEFAULT_EVAL_PARAMS, evaluate_fen_classical


def build_custom_positional_model() -> dict:
    custom_params = {
        **DEFAULT_EVAL_PARAMS,
        "bishopPairMg": 42,
        "bishopPairEg": 58,
        "mobilityWeight": 6,
        "rookOpenFile": 30,
        "passedPawnScale": 120,
        "outpostBonus": 24,
    }

    sample_fen = "r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 4 6"
    sample_eval = evaluate_fen_classical(sample_fen, custom_params)

    artifact = {
        "schemaVersion": 1,
        "id": "custom-positional-maestro-v1",
        "name": "Custom Positional Maestro v1",
        "version": "1.0.0",
        "modelType": "classical_24",
        "supportedEngineInterface": "cathedral-eval-v1",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "trained": False,
        "description": "Example custom model emphasizing bishop pair, open files, and knight outposts.",
        "architecture": {"type": "Tapered-24-Param", "parameterCount": 24},
        "evalParams": custom_params,
        "trainingMetadata": {
            "author": "Local Developer Example",
            "sampleItalianEvalCp": sample_eval,
        },
    }
    return artifact


if __name__ == "__main__":
    artifact = build_custom_positional_model()
    out_path = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "../exports/custom_positional_example.json")
    )
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(artifact, f, indent=2)
    print(f"Exported custom model artifact -> {out_path}")
