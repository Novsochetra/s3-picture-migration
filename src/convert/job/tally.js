import { readJsonLines } from '../../utils/json-files.js';
import { isFinished } from './progress-store.js';

export const emptyCounts = () => ({
  total: 0,
  totalBytes: 0,
  completed: 0,
  completedBytes: 0,
  failed: 0,
  invalid: 0,
});

export async function tallyJob({ manifestPath, progress, retryFailed }) {
  const counts = emptyCounts();

  for await (const { k: key, s: size } of readJsonLines(manifestPath)) {
    counts.total++;
    counts.totalBytes += size;

    const status = progress.status(key);
    if (isFinished(status, retryFailed)) {
      counts.completed++;
      counts.completedBytes += size;
    }

    if (status === 'failed' || status === 'invalid') {
      counts[status]++;
    }
  }

  return counts;
}
