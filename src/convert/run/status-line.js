import {
  formatBytes,
  formatCounts,
  formatDuration,
  formatNumber,
  percent,
  signedPercent,
} from '../../utils/format.js';

const left = (counts) => counts.total - counts.completed;

function invalidNote(invalid, retryFailed) {
  if (!invalid) {
    return '';
  }

  const action = retryFailed ? ' (retrying)' : ' (skipped; --retry-failed to retry)';

  return ` · ${formatNumber(invalid)} invalid${action}`;
}

export function describeJobStatus(counts, retryFailed) {
  const failed = counts.failed
    ? ` · ${formatNumber(counts.failed)} failed earlier (will retry)`
    : '';
  const bytesLeft = formatBytes(counts.totalBytes - counts.completedBytes);

  return (
    `Status:   ${formatNumber(counts.completed)} of ${formatNumber(counts.total)} finished ` +
    `(${percent(counts.completed, counts.total)}%) · ${formatNumber(left(counts))} to go ` +
    `(${bytesLeft})${failed}${invalidNote(counts.invalid, retryFailed)}`
  );
}

export function describeScan(scan) {
  const found =
    `Scan: ${formatNumber(scan.count)} images, ${formatBytes(scan.bytes)} ` +
    `(${formatCounts(scan.byExt) || 'none'})`;
  const ignored = Object.values(scan.ignored).reduce((sum, count) => sum + count, 0);

  return ignored
    ? [
        found,
        `        ${formatNumber(ignored)} other files ignored (${formatCounts(scan.ignored)})`,
      ]
    : [found];
}

export function statusLine({ counts, stats }) {
  const elapsed = (Date.now() - stats.started) / 1000;
  const rate = stats.processedBytes / Math.max(elapsed, 1);
  const eta = rate > 0 ? formatDuration((counts.totalBytes - counts.completedBytes) / rate) : '?';

  return (
    `── ${formatNumber(counts.completed)}/${formatNumber(counts.total)} ` +
    `(${percent(counts.completed, counts.total)}%) · ` +
    `${formatBytes(counts.completedBytes)} of ${formatBytes(counts.totalBytes)} · ` +
    `${formatBytes(rate)}/s · ETA ${eta} · this run: ${formatNumber(stats.ok + stats.sized)} ok, ` +
    `${formatNumber(stats.skipped)} skipped, ${formatNumber(stats.failed)} failed, ` +
    `${formatNumber(stats.invalid)} invalid · elapsed ${formatDuration(elapsed)}`
  );
}

export function runSummary(stats) {
  const savedPercent = stats.bytesIn ? Math.round((1 - stats.bytesOut / stats.bytesIn) * 100) : 0;
  const bytes = stats.bytesIn
    ? ` · ${formatBytes(stats.bytesIn)} -> ${formatBytes(stats.bytesOut)} (${signedPercent(savedPercent)})`
    : '';

  const sized = stats.sized ? `, ${formatNumber(stats.sized)} got new sizes only` : '';
  const sizeCopies = stats.sizeBytes ? ` · size copies ${formatBytes(stats.sizeBytes)}` : '';

  return (
    `\nRun finished: ${formatNumber(stats.ok)} converted${sized}, ` +
    `${formatNumber(stats.skipped)} skipped, ${formatNumber(stats.failed)} failed, ` +
    `${formatNumber(stats.invalid)} invalid${bytes}${sizeCopies}`
  );
}
