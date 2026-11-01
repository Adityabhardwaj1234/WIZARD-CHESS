/**
 * Bounded Transposition Table for Cathedral Engine
 * Stores Zobrist position keys, search depth, normalized mate scores,
 * bound types (EXACT, LOWER_BOUND, UPPER_BOUND), best move, and generation.
 *
 * Memory Footprint per Slot:
 * - keys:      BigUint64Array (8 bytes)
 * - scores:    Int32Array     (4 bytes)
 * - bestMoves: Uint32Array    (4 bytes)
 * - depths:    Int16Array     (2 bytes)
 * - bounds:    Uint8Array     (1 byte)
 * - ages:      Uint8Array     (1 byte)
 * Total = 20 bytes per slot.
 */

export const TT_EXACT = 0;
export const TT_LOWER = 1;
export const TT_UPPER = 2;

export const MATE_SCORE = 29000;
export const MATE_THRESHOLD = 28000;

export const BYTES_PER_NODE = 20;
export const MAX_NODE_RAM_MB = 500;
export const MAX_NODE_RAM_BYTES = MAX_NODE_RAM_MB * 1024 * 1024; // 524,288,000 bytes
export const MAX_NODES_UNDER_500MB = Math.floor(MAX_NODE_RAM_BYTES / BYTES_PER_NODE); // 26,214,400 nodes

export function estimateNodeRamBytes(nodeCount) {
  return Math.max(0, Math.floor(Number(nodeCount) || 0)) * BYTES_PER_NODE;
}

export function estimateNodeRamMb(nodeCount) {
  return Number((estimateNodeRamBytes(nodeCount) / (1024 * 1024)).toFixed(2));
}

export function clampNodeBudgetToRamCap(requestedNodes, maxRamMb = MAX_NODE_RAM_MB) {
  const effectiveCapMb = Math.max(1, Math.min(MAX_NODE_RAM_MB, Number(maxRamMb) || MAX_NODE_RAM_MB));
  const maxAllowedNodes = Math.floor((effectiveCapMb * 1024 * 1024) / BYTES_PER_NODE);
  const raw = Math.floor(Number(requestedNodes) || 100000);
  return Math.max(20, Math.min(maxAllowedNodes, raw));
}

/**
 * Calculates the maximum safe node budget and recommended node budget for a device
 * while strictly guaranteeing node RAM consumption never crosses 500 MB.
 */
export function calculateDeviceNodeBudgetProfile(overrides = {}) {
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  const perf = typeof performance !== 'undefined' ? performance : {};

  const detectedDeviceMemoryGb =
    overrides.deviceMemoryGb ??
    (typeof nav.deviceMemory === 'number' && nav.deviceMemory > 0 ? nav.deviceMemory : null);
  const cores =
    overrides.hardwareConcurrency ??
    (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency > 0 ? nav.hardwareConcurrency : 4);
  const ua = overrides.userAgent ?? (typeof nav.userAgent === 'string' ? nav.userAgent : '');
  const isMobileOrTablet = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);

  const heapLimitBytes =
    overrides.jsHeapSizeLimit ??
    (perf && perf.memory && typeof perf.memory.jsHeapSizeLimit === 'number'
      ? perf.memory.jsHeapSizeLimit
      : null);

  const effectiveRamGb = detectedDeviceMemoryGb ?? (isMobileOrTablet ? 4 : 8);

  // Determine safe node RAM ceiling in MB (strictly <= 500 MB)
  let deviceSafeRamMb;
  if (effectiveRamGb <= 2) {
    deviceSafeRamMb = 128;
  } else if (effectiveRamGb <= 4) {
    deviceSafeRamMb = 256;
  } else if (effectiveRamGb <= 6) {
    deviceSafeRamMb = 384;
  } else {
    deviceSafeRamMb = 500;
  }

  if (heapLimitBytes && heapLimitBytes > 0) {
    const heapQuarterMb = Math.floor(heapLimitBytes / (1024 * 1024) * 0.25);
    deviceSafeRamMb = Math.max(64, Math.min(deviceSafeRamMb, heapQuarterMb));
  }

  deviceSafeRamMb = Math.min(MAX_NODE_RAM_MB, deviceSafeRamMb);

  const maxNodesForDevice = Math.floor((deviceSafeRamMb * 1024 * 1024) / BYTES_PER_NODE);
  const coreScale = Math.max(0.5, Math.min(1.0, cores / 8));
  const recommendedNodes = Math.max(
    50000,
    Math.min(maxNodesForDevice, Math.round((maxNodesForDevice * 0.45 * coreScale) / 10000) * 10000)
  );

  const deviceTier =
    effectiveRamGb <= 2
      ? 'Compact Mobile (≤2 GB RAM)'
      : effectiveRamGb <= 4
      ? 'Standard Mobile / Tablet (4 GB RAM)'
      : 'High-Memory Desktop / Workstation (8+ GB RAM)';

  return {
    deviceTier,
    effectiveRamGb,
    detectedDeviceMemoryGb,
    cores,
    isMobileOrTablet,
    deviceSafeRamMb,
    hardCeilingRamMb: MAX_NODE_RAM_MB,
    bytesPerNode: BYTES_PER_NODE,
    maxNodesForDevice,
    hardCeilingNodes: MAX_NODES_UNDER_500MB,
    recommendedNodes,
    recommendedRamMb: estimateNodeRamMb(recommendedNodes),
    maxDeviceRamMb: estimateNodeRamMb(maxNodesForDevice)
  };
}

export function scoreToTT(score, ply) {
  if (score > MATE_THRESHOLD) return score + ply;
  if (score < -MATE_THRESHOLD) return score - ply;
  return score;
}

export function scoreFromTT(score, ply) {
  if (score > MATE_THRESHOLD) return score - ply;
  if (score < -MATE_THRESHOLD) return score + ply;
  return score;
}

export function encodeMoveKey(m) {
  if (!m) return 0;
  const promoCode = m.promotion
    ? m.promotion === 'q'
      ? 1
      : m.promotion === 'r'
      ? 2
      : m.promotion === 'b'
      ? 3
      : 4
    : 0;
  return (m.from & 0x7f) | ((m.to & 0x7f) << 7) | (promoCode << 14);
}

export class TranspositionTable {
  constructor(sizePowerOfTwo = 1 << 17) {
    this.size = sizePowerOfTwo;
    this.mask = BigInt(sizePowerOfTwo - 1);
    this.keys = new BigUint64Array(sizePowerOfTwo);
    this.depths = new Int16Array(sizePowerOfTwo);
    this.scores = new Int32Array(sizePowerOfTwo);
    this.bounds = new Uint8Array(sizePowerOfTwo);
    this.bestMoves = new Uint32Array(sizePowerOfTwo);
    this.ages = new Uint8Array(sizePowerOfTwo);
    this.generation = 1;
    this.byteLength =
      this.keys.byteLength +
      this.depths.byteLength +
      this.scores.byteLength +
      this.bounds.byteLength +
      this.bestMoves.byteLength +
      this.ages.byteLength;
  }

  newSearch() {
    this.generation = (this.generation + 1) & 0xff;
  }

  clear() {
    this.keys.fill(0n);
    this.depths.fill(-1);
    this.scores.fill(0);
    this.bounds.fill(0);
    this.bestMoves.fill(0);
    this.ages.fill(0);
  }

  probe(hash) {
    const idx = Number(hash & this.mask);
    if (this.depths[idx] !== -1 && this.keys[idx] === hash) {
      return {
        depth: this.depths[idx],
        score: this.scores[idx],
        bound: this.bounds[idx],
        bestMoveKey: this.bestMoves[idx]
      };
    }
    return null;
  }

  store(hash, depth, score, bound, bestMove, ply) {
    const idx = Number(hash & this.mask);
    const existingDepth = this.depths[idx];
    const existingAge = this.ages[idx];

    if (
      existingDepth === -1 ||
      existingAge !== this.generation ||
      this.keys[idx] !== hash ||
      depth >= existingDepth ||
      bound === TT_EXACT
    ) {
      this.keys[idx] = hash;
      this.depths[idx] = depth;
      this.scores[idx] = scoreToTT(score, ply);
      this.bounds[idx] = bound;
      if (bestMove) {
        this.bestMoves[idx] = encodeMoveKey(bestMove);
      } else if (this.keys[idx] !== hash) {
        this.bestMoves[idx] = 0;
      }
      this.ages[idx] = this.generation;
    }
  }
}
