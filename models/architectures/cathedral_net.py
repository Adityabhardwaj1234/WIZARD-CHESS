"""
CathedralNet — Genuine Multi-Layer Perceptron (MLP) Chess Position Evaluator
=============================================================================
Architecture:
- Input layer: 780 features (12x64 piece-square planes + side-to-move + 4 castling rights
  + normalized game phase + 6 material/bishop-pair differential features)
- Hidden layer 1: Linear(780 -> 48) + ReLU
- Hidden layer 2: Linear(48 -> 24) + ReLU
- Output layer: Linear(24 -> 1) + tanh, scaled by 1500.0 centipawns
  (Sign convention: positive = White advantage, negative = Black advantage)

Includes:
- Exact forward pass (`forward`, `predict_cp`, `predict_fen_cp`)
- Analytical backpropagation (`backward`) & Adam optimizer (`AdamOptimizer`)
- Serialization to `.npz` checkpoints and compact browser-compatible JSON artifacts
"""

from typing import Dict, Any, Tuple
import json
import numpy as np
from .classical_eval import encode_fen_features

OUTPUT_CP_SCALE = 1500.0


class CathedralNet:
    def __init__(
        self,
        input_dim: int = 780,
        hidden1_dim: int = 48,
        hidden2_dim: int = 24,
        seed: int = 202610,
    ):
        self.input_dim = input_dim
        self.hidden1_dim = hidden1_dim
        self.hidden2_dim = hidden2_dim
        self.seed = seed

        rng = np.random.default_rng(seed)
        # He initialization for ReLU layers, Xavier for tanh output
        self.W1 = rng.normal(0.0, np.sqrt(2.0 / input_dim), size=(input_dim, hidden1_dim)).astype(np.float32)
        self.b1 = np.zeros(hidden1_dim, dtype=np.float32)
        self.W2 = rng.normal(0.0, np.sqrt(2.0 / hidden1_dim), size=(hidden1_dim, hidden2_dim)).astype(np.float32)
        self.b2 = np.zeros(hidden2_dim, dtype=np.float32)
        self.W3 = rng.normal(0.0, np.sqrt(1.0 / hidden2_dim), size=(hidden2_dim, 1)).astype(np.float32)
        self.b3 = np.zeros(1, dtype=np.float32)

    def forward(self, X: np.ndarray) -> Tuple[np.ndarray, Dict[str, np.ndarray]]:
        """
        Forward pass for batch X of shape (N, 780).
        Returns (y_hat in [-1, 1] of shape (N, 1), cache dict for backprop).
        """
        z1 = X @ self.W1 + self.b1
        a1 = np.maximum(0.0, z1)
        z2 = a1 @ self.W2 + self.b2
        a2 = np.maximum(0.0, z2)
        z3 = a2 @ self.W3 + self.b3
        y_hat = np.tanh(z3)
        cache = {"X": X, "z1": z1, "a1": a1, "z2": z2, "a2": a2, "z3": z3, "y_hat": y_hat}
        return y_hat, cache

    def backward(
        self,
        cache: Dict[str, np.ndarray],
        y_true: np.ndarray,
        l2_reg: float = 1e-5,
    ) -> Tuple[float, Dict[str, np.ndarray]]:
        """
        Computes MSE loss in normalized [-1, 1] space and analytical gradients.
        """
        X = cache["X"]
        z1, a1 = cache["z1"], cache["a1"]
        z2, a2 = cache["z2"], cache["a2"]
        y_hat = cache["y_hat"]
        N = float(X.shape[0])

        diff = y_hat - y_true
        mse_loss = float(np.mean(diff * diff))
        reg_loss = 0.5 * l2_reg * float(np.sum(self.W1 ** 2) + np.sum(self.W2 ** 2) + np.sum(self.W3 ** 2))
        total_loss = mse_loss + reg_loss

        # dL/dy_hat = 2 * (y_hat - y_true) / N
        dy = (2.0 / N) * diff
        # dy_hat/dz3 = 1 - tanh^2(z3)
        dz3 = dy * (1.0 - y_hat * y_hat)
        dW3 = (a2.T @ dz3) + l2_reg * self.W3
        db3 = np.sum(dz3, axis=0)

        da2 = dz3 @ self.W3.T
        dz2 = da2 * (z2 > 0.0).astype(np.float32)
        dW2 = (a1.T @ dz2) + l2_reg * self.W2
        db2 = np.sum(dz2, axis=0)

        da1 = dz2 @ self.W2.T
        dz1 = da1 * (z1 > 0.0).astype(np.float32)
        dW1 = (X.T @ dz1) + l2_reg * self.W1
        db1 = np.sum(dz1, axis=0)

        grads = {
            "W1": dW1.astype(np.float32),
            "b1": db1.astype(np.float32),
            "W2": dW2.astype(np.float32),
            "b2": db2.astype(np.float32),
            "W3": dW3.astype(np.float32),
            "b3": db3.astype(np.float32),
        }
        return total_loss, grads

    def predict_cp(self, X: np.ndarray) -> np.ndarray:
        """Predicts evaluation in centipawns (White perspective) for feature matrix X."""
        if X.ndim == 1:
            X = X[None, :]
        y_hat, _ = self.forward(X)
        return (y_hat[:, 0] * OUTPUT_CP_SCALE).astype(np.float32)

    def predict_fen_cp(self, fen: str) -> float:
        """Predicts centipawn evaluation for a single FEN string."""
        x = encode_fen_features(fen)
        return float(self.predict_cp(x)[0])

    def save_checkpoint(self, path: str, metadata: Dict[str, Any] = None) -> None:
        np.savez_compressed(
            path,
            W1=self.W1,
            b1=self.b1,
            W2=self.W2,
            b2=self.b2,
            W3=self.W3,
            b3=self.b3,
            metadata=json.dumps(metadata or {}),
        )

    @classmethod
    def load_checkpoint(cls, path: str) -> Tuple["CathedralNet", Dict[str, Any]]:
        data = np.load(path, allow_pickle=False)
        W1 = data["W1"]
        W2 = data["W2"]
        net = cls(input_dim=W1.shape[0], hidden1_dim=W1.shape[1], hidden2_dim=W2.shape[1])
        net.W1 = W1.astype(np.float32)
        net.b1 = data["b1"].astype(np.float32)
        net.W2 = W2.astype(np.float32)
        net.b2 = data["b2"].astype(np.float32)
        net.W3 = data["W3"].astype(np.float32)
        net.b3 = data["b3"].astype(np.float32)
        meta_str = str(data["metadata"]) if "metadata" in data else "{}"
        return net, json.loads(meta_str)

    def to_browser_artifact(
        self,
        model_id: str,
        name: str,
        version: str,
        created_at: str,
        training_metadata: Dict[str, Any],
        description: str = "",
    ) -> Dict[str, Any]:
        """Exports compact rounded float weights for fast browser inference."""
        return {
            "schemaVersion": 1,
            "id": model_id,
            "name": name,
            "version": version,
            "modelType": "neural_mlp",
            "supportedEngineInterface": "cathedral-eval-v1",
            "createdAt": created_at,
            "trained": True,
            "description": description
            or "Trained 3-layer MLP neural network (780 -> 48 -> 24 -> 1) predicting White centipawn evaluation.",
            "architecture": {
                "type": "CathedralNet-MLP",
                "inputDim": self.input_dim,
                "hidden1Dim": self.hidden1_dim,
                "hidden2Dim": self.hidden2_dim,
                "outputDim": 1,
                "activation": "relu",
                "outputActivation": "tanh",
                "outputScaleCp": OUTPUT_CP_SCALE,
                "signConvention": "positive_for_white_advantage_cp",
                "parameterCount": int(
                    self.W1.size + self.b1.size + self.W2.size + self.b2.size + self.W3.size + self.b3.size
                ),
            },
            "weights": {
                "W1": np.round(self.W1, 5).tolist(),
                "b1": np.round(self.b1, 5).tolist(),
                "W2": np.round(self.W2, 5).tolist(),
                "b2": np.round(self.b2, 5).tolist(),
                "W3": np.round(self.W3[:, 0], 5).tolist(),
                "b3": float(np.round(self.b3[0], 5)),
            },
            "trainingMetadata": training_metadata,
        }


class AdamOptimizer:
    def __init__(self, params: Dict[str, np.ndarray], lr: float = 0.003, beta1: float = 0.9, beta2: float = 0.999, eps: float = 1e-8):
        self.lr = lr
        self.beta1 = beta1
        self.beta2 = beta2
        self.eps = eps
        self.t = 0
        self.m = {k: np.zeros_like(v) for k, v in params.items()}
        self.v = {k: np.zeros_like(v) for k, v in params.items()}

    def step(self, net: CathedralNet, grads: Dict[str, np.ndarray]) -> None:
        self.t += 1
        for k, g in grads.items():
            self.m[k] = self.beta1 * self.m[k] + (1.0 - self.beta1) * g
            self.v[k] = self.beta2 * self.v[k] + (1.0 - self.beta2) * (g * g)
            m_hat = self.m[k] / (1.0 - self.beta1 ** self.t)
            v_hat = self.v[k] / (1.0 - self.beta2 ** self.t)
            param = getattr(net, k)
            param -= self.lr * m_hat / (np.sqrt(v_hat) + self.eps)
