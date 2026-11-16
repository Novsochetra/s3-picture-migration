import {
  formatBytes,
  formatCounts,
  formatDuration,
  formatNumber,
  joinParts,
  percent,
  signedPercent,
} from '../../utils/format.js';

const bytesLeft = (counts) => counts.totalBytes - counts.completedBytes;

function invalidNote(invalid, retryFailed) {
  if (!invalid) {
    return null;
  }

  const action = retryFailed ? '(retrying)' : '(skipped; --retry-failed to retry)';

  return `${formatNumber(invalid)} invalid ${action}`;
}

export function describeJobStatus(counts, retryFailed) {
  const { completed, total, failed } = counts;
  const parts = [
    `${formatNumber(completed)} of ${formatNumber(total)} finished (${percent(completed, total)}%)`,
    `${formatNumber(total - completed)} to go (${formatBytes(bytesLeft(counts))})`,
    failed ? `${formatNumber(failed)} failed earlier (will retry)` : null,
    invalidNote(counts.invalid, retryFailed),
  ];

  return `Status:   ${joinParts(parts)}`;
}

export function describeScan(scan) {
  const extensions = formatCounts(scan.byExt) || 'none';
  const found = `Scan: ${formatNumber(scan.count)} images, ${formatBytes(scan.bytes)} (${extensions})`;
  const ignored = Object.values(scan.ignored).reduce((sum, count) => sum + count, 0);
  const ignoredLine = `        ${formatNumber(ignored)} other files ignored (${formatCounts(scan.ignored)})`;

  return ignored ? [found, ignoredLine] : [found];
}

const runOutcomes = (stats) =>
  `${formatNumber(stats.ok + stats.sized)} ok, ${formatNumber(stats.skipped)} skipped, ` +
  `${formatNumber(stats.failed)} failed, ${formatNumber(stats.invalid)} invalid`;

export function statusLine({ counts, stats }) {
  const { completed, total } = counts;
  const elapsed = (Date.now() - stats.started) / 1000;
  const rate = stats.processedBytes / Math.max(elapsed, 1);
  const parts = [
    `${formatNumber(completed)}/${formatNumber(total)} (${percent(completed, total)}%)`,
    `${formatBytes(counts.completedBytes)} of ${formatBytes(counts.totalBytes)}`,
    `${formatBytes(rate)}/s`,
    `ETA ${rate > 0 ? formatDuration(bytesLeft(counts) / rate) : '?'}`,
    `this run: ${runOutcomes(stats)}`,
    `elapsed ${formatDuration(elapsed)}`,
  ];

  return `── ${joinParts(parts)}`;
}

function savings({ bytesIn, bytesOut }) {
  if (!bytesIn) {
    return null;
  }

  const saved = Math.round((1 - bytesOut / bytesIn) * 100);

  return `${formatBytes(bytesIn)} -> ${formatBytes(bytesOut)} (${signedPercent(saved)})`;
}

export function runSummary(stats) {
  const outcomes = joinParts(
    [
      `${formatNumber(stats.ok)} converted`,
      stats.sized ? `${formatNumber(stats.sized)} got new sizes only` : null,
      `${formatNumber(stats.skipped)} skipped`,
      `${formatNumber(stats.failed)} failed`,
      `${formatNumber(stats.invalid)} invalid`,
    ],
    ', ',
  );
  const sizeCopies = stats.sizeBytes ? `size copies ${formatBytes(stats.sizeBytes)}` : null;

  return `\nRun finished: ${joinParts([outcomes, savings(stats), sizeCopies])}`;
}
