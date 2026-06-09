// Web Worker — runs all structural analysis off the main thread
import type { WorkerRequest, WorkerResponse } from '../types/worker';
import { runAnalysis } from '../lib/grillageEngine';

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;

  if (req.type === 'PING') {
    const res: WorkerResponse = { type: 'PONG' };
    self.postMessage(res);
    return;
  }

  if (req.type === 'ANALYZE') {
    try {
      const post = (res: WorkerResponse) => self.postMessage(res);

      post({ type: 'PROGRESS', percent: 10, message: '分配係数計算中...' });
      const result = runAnalysis(req.payload);
      post({ type: 'PROGRESS', percent: 100, message: '完了' });
      post({ type: 'RESULT', payload: result });
    } catch (err) {
      const res: WorkerResponse = {
        type: 'ERROR',
        message: err instanceof Error ? err.message : String(err),
      };
      self.postMessage(res);
    }
  }
};
