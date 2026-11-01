"""
Feature encoding and classical 24-parameter evaluation model in Python.
Maintains 100% numerical parity with src/engine/evaluation.js.
"""

from typing import Dict, Any, Tuple, List
import numpy as np

DEFAULT_EVAL_PARAMS: Dict[str, int] = {
    "pawnMg": 100,
    "knightMg": 320,
    "bishopMg": 335,
    "rookMg": 500,
    "queenMg": 920,
    "pawnEg": 115,
    "knightEg": 310,
    "bishopEg": 340,
    "rookEg": 530,
    "queenEg": 940,
    "pstScaleMg": 100,
    "pstScaleEg": 100,
    "bishopPairMg": 34,
    "bishopPairEg": 46,
    "mobilityWeight": 4,
    "kingShieldBonus": 13,
    "kingZoneAttack": 11,
    "isolatedPawnPen": 14,
    "doubledPawnPen": 14,
    "passedPawnScale": 105,
    "rookOpenFile": 24,
    "rookSeventh": 24,
    "outpostBonus": 18,
    "tempoBonus": 12,
}

PIECE_ORDER = ["P", "N", "B", "R", "Q", "K", "p", "n", "b", "r", "q", "k"]
PIECE_TO_PLANE = {ch: i for i, ch in enumerate(PIECE_ORDER)}

PAWN_PST_MG = np.array([
     0,   0,   0,   0,   0,   0,   0,   0,
    50,  50,  50,  50,  50,  50,  50,  50,
    12,  12,  22,  32,  32,  22,  12,  12,
     6,   6,  12,  27,  27,  12,   6,   6,
     0,   0,   4,  24,  24,   4,   0,   0,
     5,  -4,  -8,   2,   2,  -8,  -4,   5,
     5,  10,  10, -22, -22,  10,  10,   5,
     0,   0,   0,   0,   0,   0,   0,   0
], dtype=np.float32)

PAWN_PST_EG = np.array([
     0,   0,   0,   0,   0,   0,   0,   0,
    85,  85,  85,  85,  85,  85,  85,  85,
    52,  52,  52,  52,  52,  52,  52,  52,
    30,  30,  30,  30,  30,  30,  30,  30,
    15,  15,  15,  15,  15,  15,  15,  15,
     6,   6,   6,   6,   6,   6,   6,   6,
     0,   0,   0,   0,   0,   0,   0,   0,
     0,   0,   0,   0,   0,   0,   0,   0
], dtype=np.float32)

KNIGHT_PST = np.array([
   -50, -40, -30, -30, -30, -30, -40, -50,
   -40, -20,   0,   4,   4,   0, -20, -40,
   -30,   4,  12,  16,  16,  12,   4, -30,
   -30,   6,  16,  22,  22,  16,   6, -30,
   -30,   4,  16,  22,  22,  16,   4, -30,
   -30,   6,  12,  16,  16,  12,   6, -30,
   -40, -20,   0,   4,   4,   0, -20, -40,
   -50, -35, -30, -30, -30, -30, -35, -50
], dtype=np.float32)

BISHOP_PST = np.array([
   -20, -10, -10, -10, -10, -10, -10, -20,
   -10,   2,   0,   0,   0,   0,   2, -10,
   -10,   4,   8,  12,  12,   8,   4, -10,
   -10,   6,   8,  14,  14,   8,   6, -10,
   -10,   4,  12,  14,  14,  12,   4, -10,
   -10,  10,  10,  12,  12,  10,  10, -10,
   -10,   8,   0,   2,   2,   0,   8, -10,
   -20, -10, -12, -10, -10, -12, -10, -20
], dtype=np.float32)

ROOK_PST = np.array([
     0,   2,   4,   6,   6,   4,   2,   0,
    12,  16,  16,  16,  16,  16,  16,  12,
    -4,   0,   0,   2,   2,   0,   0,  -4,
    -4,   0,   0,   2,   2,   0,   0,  -4,
    -4,   0,   0,   2,   2,   0,   0,  -4,
    -4,   0,   0,   2,   2,   0,   0,  -4,
    -4,   0,   0,   2,   2,   0,   0,  -4,
     0,   0,   4,   8,   8,   4,   0,   0
], dtype=np.float32)

QUEEN_PST = np.array([
   -20, -10, -10,  -5,  -5, -10, -10, -20,
   -10,   0,   2,   0,   0,   0,   0, -10,
   -10,   2,   6,   6,   6,   6,   2, -10,
    -5,   0,   6,   8,   8,   6,   0,  -5,
     0,   0,   6,   8,   8,   6,   0,  -5,
   -10,   4,   6,   6,   6,   6,   2, -10,
   -10,   0,   4,   0,   0,   0,   0, -10,
   -20, -10, -10,  -5,  -5, -10, -10, -20
], dtype=np.float32)

KING_PST_MG = np.array([
   -30, -40, -40, -50, -50, -40, -40, -30,
   -30, -40, -40, -50, -50, -40, -40, -30,
   -30, -40, -40, -50, -50, -40, -40, -30,
   -30, -40, -40, -50, -50, -40, -40, -30,
   -20, -30, -30, -40, -40, -30, -30, -20,
   -10, -20, -20, -20, -20, -20, -20, -10,
    20,  22,   0,   0,   0,   0,  22,  20,
    22,  34,  14,   0,   0,  12,  34,  22
], dtype=np.float32)

KING_PST_EG = np.array([
   -50, -35, -25, -20, -20, -25, -35, -50,
   -30, -15,  -5,   0,   0,  -5, -15, -30,
   -25,  -5,  18,  24,  24,  18,  -5, -25,
   -20,   0,  24,  32,  32,  24,   0, -20,
   -20,   0,  24,  32,  32,  24,   0, -20,
   -25,  -5,  18,  24,  24,  18,  -5, -25,
   -30, -15,  -5,   0,   0,  -5, -15, -30,
   -50, -35, -25, -20, -20, -25, -35, -50
], dtype=np.float32)

PASSED_PAWN_BONUS_MG = [0, 65, 42, 26, 14, 6, 0, 0]
PASSED_PAWN_BONUS_EG = [0, 115, 78, 48, 26, 12, 0, 0]


def encode_fen_features(fen: str) -> np.ndarray:
    """
    Encodes a chess FEN into a fixed 780-dimensional float32 feature vector:
    - [0..767]   : 12 piece planes x 64 squares (P,N,B,R,Q,K,p,n,b,r,q,k)
    - [768]      : Side to move (+1.0 for White, -1.0 for Black)
    - [769..772] : Castling rights (WK, WQ, BK, BQ in {0.0, 1.0})
    - [773]      : Normalized game phase (0.0 endgame .. 1.0 opening)
    - [774..779] : Normalized piece count differentials ((W - B) / max_count for P, N, B, R, Q, bishop_pair_diff)
    """
    vec = np.zeros(780, dtype=np.float32)
    parts = fen.strip().split()
    board_part = parts[0]
    turn_part = parts[1] if len(parts) > 1 else "w"
    castle_part = parts[2] if len(parts) > 2 else "-"

    counts = {ch: 0 for ch in PIECE_ORDER}
    phase = 0.0
    phase_weights = {"n": 1, "b": 1, "r": 2, "q": 4}

    rows = board_part.split("/")
    for r, row_str in enumerate(rows[:8]):
        f = 0
        for ch in row_str:
            if "1" <= ch <= "8":
                f += int(ch)
            elif ch in PIECE_TO_PLANE and f < 8:
                sq64 = (r << 3) | f
                plane = PIECE_TO_PLANE[ch]
                vec[plane * 64 + sq64] = 1.0
                counts[ch] += 1
                phase += phase_weights.get(ch.lower(), 0)
                f += 1

    vec[768] = 1.0 if turn_part == "w" else -1.0
    vec[769] = 1.0 if "K" in castle_part else 0.0
    vec[770] = 1.0 if "Q" in castle_part else 0.0
    vec[771] = 1.0 if "k" in castle_part else 0.0
    vec[772] = 1.0 if "q" in castle_part else 0.0
    vec[773] = min(24.0, phase) / 24.0
    vec[774] = (counts["P"] - counts["p"]) / 8.0
    vec[775] = (counts["N"] - counts["n"]) / 2.0
    vec[776] = (counts["B"] - counts["b"]) / 2.0
    vec[777] = (counts["R"] - counts["r"]) / 2.0
    vec[778] = (counts["Q"] - counts["q"]) / 1.0
    w_bp = 1.0 if counts["B"] >= 2 else 0.0
    b_bp = 1.0 if counts["b"] >= 2 else 0.0
    vec[779] = w_bp - b_bp
    return vec


def evaluate_fen_classical(fen: str, params: Dict[str, int] = None) -> int:
    """
    Evaluates a FEN in centipawns from White's perspective using the 24-parameter vector.
    """
    P = {**DEFAULT_EVAL_PARAMS, **(params or {})}
    parts = fen.strip().split()
    board_part = parts[0]
    stm = parts[1] if len(parts) > 1 else "w"

    mg_white, mg_black, eg_white, eg_black = 0, 0, 0, 0
    phase = 0
    w_bishops, b_bishops = 0, 0
    w_pawns_file = [0] * 8
    b_pawns_file = [0] * 8
    w_pawn_max_r = [-1] * 8
    b_pawn_min_r = [8] * 8
    w_pawns: List[Tuple[int, int]] = []
    b_pawns: List[Tuple[int, int]] = []
    rooks: List[Tuple[int, int, str]] = []
    wk_sq = (-1, -1)
    bk_sq = (-1, -1)

    grid = [[None for _ in range(8)] for _ in range(8)]
    for r, row_str in enumerate(board_part.split("/")[:8]):
        f = 0
        for ch in row_str:
            if "1" <= ch <= "8":
                f += int(ch)
            else:
                color = "w" if ch.isupper() else "b"
                ptype = ch.lower()
                grid[r][f] = (ptype, color)
                if ptype == "k":
                    if color == "w":
                        wk_sq = (r, f)
                    else:
                        bk_sq = (r, f)
                f += 1

    pst_mg_scale = P["pstScaleMg"] / 100.0
    pst_eg_scale = P["pstScaleEg"] / 100.0
    mob_w = P["mobilityWeight"]
    outpost_b = P["outpostBonus"]
    king_zone_w = P["kingZoneAttack"]

    knight_deltas = [(-2, -1), (-2, 1), (-1, -2), (-1, 2), (1, -2), (1, 2), (2, -1), (2, 1)]

    for r in range(8):
        for f in range(8):
            cell = grid[r][f]
            if not cell:
                continue
            ptype, color = cell
            is_white = color == "w"
            sq64 = (r << 3) | f
            idx = sq64 if is_white else ((7 - r) << 3) | f

            mat_mg, mat_eg, pst_mg, pst_eg = 0, 0, 0, 0
            if ptype == "p":
                mat_mg, mat_eg = P["pawnMg"], P["pawnEg"]
                pst_mg, pst_eg = int(PAWN_PST_MG[idx]), int(PAWN_PST_EG[idx])
                if is_white:
                    w_pawns_file[f] += 1
                    if r > w_pawn_max_r[f]:
                        w_pawn_max_r[f] = r
                    w_pawns.append((r, f))
                else:
                    b_pawns_file[f] += 1
                    if r < b_pawn_min_r[f]:
                        b_pawn_min_r[f] = r
                    b_pawns.append((r, f))
            elif ptype == "n":
                phase += 1
                mat_mg, mat_eg = P["knightMg"], P["knightEg"]
                pst_mg = int(KNIGHT_PST[idx])
                pst_eg = pst_mg
                mob = 0
                for dr, df in knight_deltas:
                    nr, nf = r + dr, f + df
                    if 0 <= nr < 8 and 0 <= nf < 8:
                        tp = grid[nr][nf]
                        if not tp or tp[1] != color:
                            mob += 1
                m_bonus = (mob - 4) * mob_w
                if is_white:
                    mg_white += m_bonus
                    eg_white += m_bonus
                    if 2 <= r <= 4 and 1 <= f <= 6:
                        p_l = grid[r + 1][f - 1]
                        p_r = grid[r + 1][f + 1]
                        if (p_l and p_l == ("p", "w")) or (p_r and p_r == ("p", "w")):
                            mg_white += outpost_b
                else:
                    mg_black += m_bonus
                    eg_black += m_bonus
                    if 3 <= r <= 5 and 1 <= f <= 6:
                        p_l = grid[r - 1][f - 1]
                        p_r = grid[r - 1][f + 1]
                        if (p_l and p_l == ("p", "b")) or (p_r and p_r == ("p", "b")):
                            mg_black += outpost_b
            elif ptype == "b":
                phase += 1
                mat_mg, mat_eg = P["bishopMg"], P["bishopEg"]
                pst_mg = int(BISHOP_PST[idx])
                pst_eg = pst_mg
                if is_white:
                    w_bishops += 1
                else:
                    b_bishops += 1
            elif ptype == "r":
                phase += 2
                mat_mg, mat_eg = P["rookMg"], P["rookEg"]
                pst_mg = int(ROOK_PST[idx])
                pst_eg = pst_mg
                rooks.append((r, f, color))
            elif ptype == "q":
                phase += 4
                mat_mg, mat_eg = P["queenMg"], P["queenEg"]
                pst_mg = int(QUEEN_PST[idx])
                pst_eg = pst_mg
                ek = bk_sq if is_white else wk_sq
                if ek[0] != -1:
                    dist = abs(r - ek[0]) + abs(f - ek[1])
                    trop = max(0, 8 - dist) * (king_zone_w >> 1)
                    if is_white:
                        mg_white += trop
                    else:
                        mg_black += trop
            elif ptype == "k":
                pst_mg = int(KING_PST_MG[idx])
                pst_eg = int(KING_PST_EG[idx])

            if pst_mg_scale != 1.0:
                pst_mg = int(pst_mg * pst_mg_scale)
            if pst_eg_scale != 1.0:
                pst_eg = int(pst_eg * pst_eg_scale)

            if is_white:
                mg_white += mat_mg + pst_mg
                eg_white += mat_eg + pst_eg
            else:
                mg_black += mat_mg + pst_mg
                eg_black += mat_eg + pst_eg

            if r in (3, 4) and f in (3, 4):
                if is_white:
                    mg_white += 8
                else:
                    mg_black += 8

    if w_bishops >= 2:
        mg_white += P["bishopPairMg"]
        eg_white += P["bishopPairEg"]
    if b_bishops >= 2:
        mg_black += P["bishopPairMg"]
        eg_black += P["bishopPairEg"]

    dbl_pen = P["doubledPawnPen"]
    iso_pen = P["isolatedPawnPen"]
    for f in range(8):
        wc = w_pawns_file[f]
        if wc > 1:
            pen = (wc - 1) * dbl_pen
            mg_white -= pen
            eg_white -= pen
        if wc > 0:
            has_n = (f > 0 and w_pawns_file[f - 1] > 0) or (f < 7 and w_pawns_file[f + 1] > 0)
            if not has_n:
                mg_white -= iso_pen
                eg_white -= iso_pen + 2
        bc = b_pawns_file[f]
        if bc > 1:
            pen = (bc - 1) * dbl_pen
            mg_black -= pen
            eg_black -= pen
        if bc > 0:
            has_n = (f > 0 and b_pawns_file[f - 1] > 0) or (f < 7 and b_pawns_file[f + 1] > 0)
            if not has_n:
                mg_black -= iso_pen
                eg_black -= iso_pen + 2

    passed_scale = P["passedPawnScale"] / 100.0
    for r, f in w_pawns:
        min_b0 = b_pawn_min_r[f - 1] if f > 0 else 8
        min_b1 = b_pawn_min_r[f]
        min_b2 = b_pawn_min_r[f + 1] if f < 7 else 8
        if min_b0 >= r and min_b1 >= r and min_b2 >= r:
            mg_white += int(PASSED_PAWN_BONUS_MG[r] * passed_scale)
            eg_white += int(PASSED_PAWN_BONUS_EG[r] * passed_scale)

    for r, f in b_pawns:
        max_w0 = w_pawn_max_r[f - 1] if f > 0 else -1
        max_w1 = w_pawn_max_r[f]
        max_w2 = w_pawn_max_r[f + 1] if f < 7 else -1
        if max_w0 <= r and max_w1 <= r and max_w2 <= r:
            inv_r = 7 - r
            mg_black += int(PASSED_PAWN_BONUS_MG[inv_r] * passed_scale)
            eg_black += int(PASSED_PAWN_BONUS_EG[inv_r] * passed_scale)

    open_b = P["rookOpenFile"]
    sev_b = P["rookSeventh"]
    for r, f, col in rooks:
        if col == "w":
            if w_pawns_file[f] == 0:
                bonus = open_b if b_pawns_file[f] == 0 else (open_b >> 1)
                mg_white += bonus
                eg_white += bonus
            if r == 1:
                mg_white += sev_b
                eg_white += sev_b + 8
        else:
            if b_pawns_file[f] == 0:
                bonus = open_b if w_pawns_file[f] == 0 else (open_b >> 1)
                mg_black += bonus
                eg_black += bonus
            if r == 6:
                mg_black += sev_b
                eg_black += sev_b + 8

    shield_b = P["kingShieldBonus"]
    if wk_sq[0] != -1 and bk_sq[0] != -1:
        wkr, wkf = wk_sq
        bkr, bkf = bk_sq
        if wkr >= 6:
            shield = 0
            for df in range(max(0, wkf - 1), min(7, wkf + 1) + 1):
                if grid[wkr - 1][df] == ("p", "w"):
                    shield += shield_b
                if w_pawns_file[df] == 0:
                    shield -= shield_b
            mg_white += shield
        if bkr <= 1:
            shield = 0
            for df in range(max(0, bkf - 1), min(7, bkf + 1) + 1):
                if grid[bkr + 1][df] == ("p", "b"):
                    shield += shield_b
                if b_pawns_file[df] == 0:
                    shield -= shield_b
            mg_black += shield

        mat_diff = mg_white - mg_black
        king_dist = abs(wkr - bkr) + abs(wkf - bkf)
        if mat_diff >= 300:
            b_center_dist = max(abs(bkr - 3.5), abs(bkf - 3.5))
            eg_white += int(b_center_dist * 16 + (14 - king_dist) * 7)
        elif mat_diff <= -300:
            w_center_dist = max(abs(wkr - 3.5), abs(wkf - 3.5))
            eg_black += int(w_center_dist * 16 + (14 - king_dist) * 7)

    clamped_phase = min(24, phase)
    mg_diff = mg_white - mg_black
    eg_diff = eg_white - eg_black
    total_white_cp = int((mg_diff * clamped_phase + eg_diff * (24 - clamped_phase)) / 24)
    tempo = P["tempoBonus"]
    total_white_cp += tempo if stm == "w" else -tempo
    return total_white_cp
