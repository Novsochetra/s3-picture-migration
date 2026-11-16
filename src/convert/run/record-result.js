import { percent } from '../../utils/format.js';
import { countResult, resultLine } from './result-line.js';

const PROBLEM_STATUSES = new Set(['failed', 'invalid']);

function updateCounts({ counts, stats }, { previous, result, size }) {
  if (PROBLEM_STATUSES.has(previous)) {
    counts[previous]--;
  }

  if (PROBLEM_STATUSES.has(result.st)) {
    counts[result.st]++;
  }

  if (result.st !== 'failed') {
    counts.completed++;
    counts.completedBytes += size;
    stats.processedBytes += size;
  }
}

// Many failures in a row mean the network or the key is broken, not the images.
function trackFailures({ log, limits, resumeCommand }, { state }, result) {
  if (result.st !== 'failed') {
    state.consecutiveFailures = 0;

    return;
  }

  state.consecutiveFailures++;

  if (state.consecutiveFailures >= limits.maxConsecutiveFailures && !state.stopping) {
    state.stopping = true;
    log.error(
      `\n${state.consecutiveFailures} failures in a row — stopping this run. ` +
        `Check the network / key permissions, then resume with:\n  ${resumeCommand}`,
    );
  }
}

export function recordResult(session, run, { item, result, ms }) {
  const previous = run.progress.status(item.key);
  run.progress.record(item.key, result, ms);
  updateCounts(run, { previous, result, size: item.size });
  countResult(run.stats, result);

  const progressText = `[${percent(run.counts.completed, run.counts.total).padStart(5)}%]`;
  const outcome = { key: item.key, result, ms, deleteOriginal: session.settings.deleteOriginal };
  const [level, text] = resultLine(progressText, outcome);
  session.log[level](text);

  trackFailures(session, run, result);
}
