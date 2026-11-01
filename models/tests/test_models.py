"""
Automated Test Suite for the Python Model & Neural Network Ecosystem (`models/tests/test_models.py`)
Verifies:
1. 780-dim FEN feature encoding & classical evaluation parity
2. CathedralNet forward pass, analytical backpropagation, and checkpoint round-trip
3. Exported JSON schema compliance across all models in models/registry.json
4. Exact numerical consistency between Python inference and JavaScript browser inference (`src/engine/modelRuntime.js`)
"""

import json
import os
import subprocess
import unittest
import numpy as np

from models.architectures.classical_eval import (
    DEFAULT_EVAL_PARAMS,
    encode_fen_features,
    evaluate_fen_classical,
)
from models.architectures.cathedral_net import CathedralNet, OUTPUT_CP_SCALE


class TestWizardChessModels(unittest.TestCase):
    def setUp(self):
        self.repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
        self.models_dir = os.path.join(self.repo_root, "models")

    def test_01_feature_encoding_dimensions_and_values(self):
        start_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        vec = encode_fen_features(start_fen)
        self.assertEqual(vec.shape, (780,))
        self.assertEqual(vec.dtype, np.float32)
        # 32 pieces on the board
        self.assertEqual(int(np.sum(vec[:768])), 32)
        # White to move (+1.0), all 4 castling rights (1.0), full phase (1.0), zero material diff (0.0)
        self.assertAlmostEqual(float(vec[768]), 1.0)
        self.assertEqual(list(vec[769:773]), [1.0, 1.0, 1.0, 1.0])
        self.assertAlmostEqual(float(vec[773]), 1.0)
        self.assertEqual(list(vec[774:780]), [0.0, 0.0, 0.0, 0.0, 0.0, 0.0])

    def test_02_cathedral_net_forward_backward_and_checkpoint(self):
        net = CathedralNet(input_dim=780, hidden1_dim=48, hidden2_dim=24, seed=42)
        X = np.random.default_rng(42).normal(0, 0.2, size=(16, 780)).astype(np.float32)
        y = np.random.default_rng(43).uniform(-0.8, 0.8, size=(16, 1)).astype(np.float32)

        y_hat, cache = net.forward(X)
        self.assertEqual(y_hat.shape, (16, 1))
        self.assertTrue(np.all(y_hat >= -1.0) and np.all(y_hat <= 1.0))

        loss, grads = net.backward(cache, y)
        self.assertGreater(loss, 0.0)
        self.assertEqual(grads["W1"].shape, (780, 48))
        self.assertEqual(grads["W2"].shape, (48, 24))
        self.assertEqual(grads["W3"].shape, (24, 1))

        ckpt_path = os.path.join(self.models_dir, "checkpoints", "cathedral_net_v1.npz")
        self.assertTrue(os.path.exists(ckpt_path))
        loaded_net, meta = CathedralNet.load_checkpoint(ckpt_path)
        self.assertEqual(loaded_net.hidden1_dim, 48)
        self.assertIn("finalTestMetrics", meta)
        self.assertLess(meta["finalTestMetrics"]["maeCp"], meta["initialTestMetrics"]["maeCp"])

    def test_03_registry_and_exported_artifacts_schema(self):
        reg_path = os.path.join(self.models_dir, "registry.json")
        self.assertTrue(os.path.exists(reg_path))
        reg = json.loads(open(reg_path, "r", encoding="utf-8").read())
        self.assertGreaterEqual(len(reg["models"]), 5)

        for entry in reg["models"]:
            art_path = os.path.join(self.repo_root, entry["artifactPath"])
            self.assertTrue(os.path.exists(art_path), f"Missing {art_path}")
            art = json.loads(open(art_path, "r", encoding="utf-8").read())
            self.assertEqual(art["schemaVersion"], 1)
            self.assertEqual(art["supportedEngineInterface"], "cathedral-eval-v1")
            self.assertIn(art["modelType"], ("classical_24", "neural_mlp", "hybrid_ensemble"))

    def test_04_python_vs_browser_js_inference_parity(self):
        """
        Verifies that Python inference on exported `cathedral_net_v1.json` and `cathedral_classical_v3.json`
        matches the JavaScript browser runtime (`src/engine/modelRuntime.js`) to within <= 1 centipawn
        (rounding tolerance).
        """
        test_fens = [
            "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            "r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 4 6",
            "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
            "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1",
            "4k3/8/4K3/4P3/8/8/8/8 w - - 0 1",
        ]

        nn_art = json.loads(open(os.path.join(self.models_dir, "exports", "cathedral_net_v1.json"), "r", encoding="utf-8").read())
        w = nn_art["weights"]
        W1 = np.array(w["W1"], dtype=np.float32)
        b1 = np.array(w["b1"], dtype=np.float32)
        W2 = np.array(w["W2"], dtype=np.float32)
        b2 = np.array(w["b2"], dtype=np.float32)
        W3 = np.array(w["W3"], dtype=np.float32)[:, None]
        b3 = np.array([w["b3"]], dtype=np.float32)

        py_nn_scores = []
        py_cl_scores = []
        for fen in test_fens:
            x = encode_fen_features(fen)[None, :]
            a1 = np.maximum(0.0, x @ W1 + b1)
            a2 = np.maximum(0.0, a1 @ W2 + b2)
            y = np.tanh(a2 @ W3 + b3)[0, 0] * OUTPUT_CP_SCALE
            py_nn_scores.append(int(round(float(y))))
            py_cl_scores.append(evaluate_fen_classical(fen, DEFAULT_EVAL_PARAMS))

        node_script = f"""
        import {{ ChessGame }} from './src/game/ChessGame.js';
        import {{ BUILTIN_MODELS, evaluateGameWithModel }} from './src/engine/modelRuntime.js';
        const fens = {json.dumps(test_fens)};
        const clModel = BUILTIN_MODELS.find(m => m.id === 'cathedral-classical-v3');
        const nnModel = BUILTIN_MODELS.find(m => m.id === 'cathedral-neural-v1');
        const jsNn = fens.map(f => evaluateGameWithModel(new ChessGame(f), nnModel));
        const jsCl = fens.map(f => evaluateGameWithModel(new ChessGame(f), clModel));
        console.log(JSON.stringify({{ jsNn, jsCl }}));
        """
        proc = subprocess.run(
            ["node", "--input-type=module", "-e", node_script],
            cwd=self.repo_root,
            capture_output=True,
            text=True,
            check=True,
        )
        js_out = json.loads(proc.stdout.strip())

        for i, fen in enumerate(test_fens):
            self.assertAlmostEqual(
                py_nn_scores[i],
                js_out["jsNn"][i],
                delta=1,
                msg=f"Neural inference mismatch on {fen}: py={py_nn_scores[i]} vs js={js_out['jsNn'][i]}",
            )
            self.assertEqual(
                py_cl_scores[i],
                js_out["jsCl"][i],
                msg=f"Classical inference mismatch on {fen}: py={py_cl_scores[i]} vs js={js_out['jsCl'][i]}",
            )


if __name__ == "__main__":
    unittest.main()
