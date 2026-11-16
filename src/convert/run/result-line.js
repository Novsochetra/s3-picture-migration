import { fileNameOf } from '../../s3/keys.js';
import { formatBytes, signedPercent } from '../../utils/format.js';

const seconds = (ms) => `${(ms / 1000).toFixed(1)}s`;

function sizesText(result) {
  if (!result.sizes?.length) {
    return '';
  }

  const widths = result.sizes.map((width) => `${width}w`).join(',');

  return ` + sizes ${widths} (${formatBytes(result.vout)})`;
}

function convertedText({ key, result, ms, deleteOriginal }) {
  const saved = result.in ? Math.round((1 - result.out / result.in) * 100) : 0;
  const where = result.backup
    ? `(now webp, backup ${fileNameOf(result.backup)})`
    : `-> ${result.to}`;
  const deleted = deleteOriginal ? ' [original deleted]' : '';
  const reason = result.reason ? ` [${result.reason}]` : '';

  return (
    `ok     ${key} ${where}  ${formatBytes(result.in)} -> ${formatBytes(result.out)} ` +
    `(${signedPercent(saved)})${sizesText(result)} ${seconds(ms)}${deleted}${reason}`
  );
}

function describe(outcome) {
  const { key, result, ms } = outcome;

  if (result.st === 'done' && result.onlySizes) {
    const added = sizesText(result) || ' (nothing new)';

    return ['info', `ok     ${key}${added} [${result.reason}] ${seconds(ms)}`];
  }

  if (result.st === 'done') {
    return ['info', convertedText(outcome)];
  }

  if (result.st === 'skipped') {
    return ['info', `skip   ${key} (${result.reason})${sizesText(result)}`];
  }

  if (result.st === 'invalid') {
    return ['error', `BAD    ${key}: ${result.err}`];
  }

  return ['error', `FAIL   ${key} after ${result.attempts} attempt(s): ${result.err}`];
}

export function resultLine(progressText, outcome) {
  const [level, text] = describe(outcome);

  return [level, `${progressText} ${text}`];
}

export function countResult(stats, result) {
  const isDone = result.st === 'done';

  stats.sizeBytes += result.vout ?? 0;

  if (isDone && result.onlySizes) {
    stats.sized++;
  } else if (isDone) {
    stats.ok++;
    stats.bytesIn += result.in ?? 0;
    stats.bytesOut += result.out ?? 0;
  } else {
    stats[result.st]++;
  }
}
