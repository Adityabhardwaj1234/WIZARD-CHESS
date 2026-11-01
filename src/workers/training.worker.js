/**
 * Dedicated Headless Self-Play Web Worker (`src/workers/training.worker.js`)
 * Supports cooperative cancellation (`STOP_TRAINING`) and per-game / sub-batch execution
 * with zero DOM overhead.
 */

import { simulateSingleHeadlessGame, runTacticalRegressionSuite } from '../learning/learningEngine.js';

let stopRequested = false;

self.onmessage = async function (event) {
  const msg = event.data;
  if (!msg || !msg.type) return;

  if (msg.type === 'STOP_TRAINING') {
    stopRequested = true;
    return;
  }

  if (msg.type === 'RUN_GAME') {
    stopRequested = false;
    const { workerId, taskId, config } = msg;
    try {
      // Yield once before running so any queued STOP_TRAINING message is processed
      await new Promise(resolve => setTimeout(resolve, 0));
      if (stopRequested) {
        self.postMessage({
          type: 'GAME_CANCELLED',
          workerId,
          taskId
        });
        return;
      }
      const gameResult = simulateSingleHeadlessGame(config);
      self.postMessage({
        type: 'GAME_COMPLETE',
        workerId,
        taskId,
        gameResult
      });
    } catch (err) {
      self.postMessage({
        type: 'GAME_ERROR',
        workerId,
        taskId,
        error: err && err.message ? err.message : 'Simulation error'
      });
    }
  } else if (msg.type === 'RUN_REGRESSION') {
    const { requestId, candidateParams, modelArtifact } = msg;
    const regressionResult = runTacticalRegressionSuite(candidateParams, modelArtifact);
    self.postMessage({
      type: 'REGRESSION_COMPLETE',
      requestId,
      regressionResult
    });
  }
};
