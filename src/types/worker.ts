import type { AnalysisInput, AnalysisResult } from './bridge';

export type WorkerRequest =
  | { type: 'ANALYZE'; payload: AnalysisInput }
  | { type: 'PING' };

export type WorkerResponse =
  | { type: 'RESULT'; payload: AnalysisResult }
  | { type: 'PROGRESS'; percent: number; message: string }
  | { type: 'ERROR'; message: string }
  | { type: 'PONG' };
