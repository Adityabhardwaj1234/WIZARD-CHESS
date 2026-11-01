/**
 * Dedicated Web Worker for the Cathedral Engine (`src/workers/engine.worker.js`)
 * Supports both fast synchronous searches and cooperative asynchronous Super Thinking
 * searches (`searchAsync`) so `STOP` messages can interrupt long computations between
 * completed depth iterations.
 */

import { CathedralEngine } from '../engine/CathedralEngine.js';

const engine = new CathedralEngine();

self.onmessage = async function (event) {
  const msg = event.data;
  if (!msg || !msg.type) return;

  if (msg.type === 'STOP') {
    engine.requestStop();
    return;
  }

  if (msg.type === 'CLEAR_CACHE') {
    engine.clearCache();
    return;
  }

  if (msg.type === 'SEARCH') {
    const { requestId, fen, options } = msg;
    try {
      const isLongSearch = (options?.nodeLimit || 0) >= 250000 || (options?.maxDepth || 0) >= 8;
      const onProgress = progress => {
        self.postMessage({
          type: 'PROGRESS',
          requestId,
          fen,
          progress
        });
      };

      const result = isLongSearch
        ? await engine.searchAsync(fen, { ...options, onProgress })
        : engine.search(fen, { ...options, onProgress });

      self.postMessage({
        type: 'RESULT',
        requestId,
        fen,
        result
      });
    } catch (err) {
      self.postMessage({
        type: 'ERROR',
        requestId,
        fen,
        error: err && err.message ? err.message : 'Engine search error'
      });
    }
  }
};
