const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];
const SHELL_SAFE = /^[\w./:@-]+$/;

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) {
    return '?';
  }

  let value = bytes;
  let unit = 0;

  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit++;
  }

  return unit === 0 ? `${value} B` : `${value.toFixed(value < 10 ? 2 : 1)} ${BYTE_UNITS[unit]}`;
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '?';
  }

  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;

  if (hours) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  }

  if (minutes) {
    return `${minutes}m ${String(rest).padStart(2, '0')}s`;
  }

  return `${rest}s`;
}

export const formatNumber = (value) => Number(value).toLocaleString('en-US');

export const percent = (part, whole) => (whole ? ((part / whole) * 100).toFixed(1) : '100.0');

export const signedPercent = (value) => `${value >= 0 ? '-' : '+'}${Math.abs(value)}%`;

export function formatCounts(counts) {
  return Object.entries(counts)
    .sort(([, left], [, right]) => right - left)
    .slice(0, 8)
    .map(([label, count]) => `${label} ${formatNumber(count)}`)
    .join(' · ');
}

export const shellQuote = (text) =>
  SHELL_SAFE.test(text) ? text : `'${String(text).replace(/'/g, `'\\''`)}'`;

export const formatDateTime = (date) => date?.toISOString().slice(0, 16).replace('T', ' ') ?? '';

export const joinParts = (parts, separator = ' · ') => parts.filter(Boolean).join(separator);
