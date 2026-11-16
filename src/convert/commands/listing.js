import { formatBytes, formatDateTime, formatNumber } from '../../utils/format.js';

export const emptyTotals = () => ({ files: 0, bytes: 0, folders: 0 });

// The folder's own placeholder object is not a file inside it.
export function listingRows(page, prefix) {
  const folders = (page.CommonPrefixes ?? []).map((folder) => ({
    name: folder.Prefix.slice(prefix.length),
    isFolder: true,
  }));
  const files = (page.Contents ?? [])
    .filter((object) => object.Key !== prefix)
    .map((object) => ({
      name: object.Key.slice(prefix.length),
      size: object.Size ?? 0,
      modified: object.LastModified,
    }));

  return [...folders, ...files];
}

export function formatRow(row) {
  if (row.isFolder) {
    return `  ${''.padEnd(16)}  ${'DIR'.padStart(9)}  ${row.name}`;
  }

  return `  ${formatDateTime(row.modified).padEnd(16)}  ${formatBytes(row.size).padStart(9)}  ${row.name}`;
}

export function addToTotals(totals, rows) {
  for (const row of rows) {
    if (row.isFolder) {
      totals.folders++;
    } else {
      totals.files++;
      totals.bytes += row.size;
    }
  }
}

export const listingHeader = (bucketName, prefix, recursive) =>
  `s3://${bucketName}/${prefix}${recursive ? '   (recursive)' : ''}\n`;

export function listingSummary(totals, recursive) {
  const files = `\n${formatNumber(totals.files)} file(s), ${formatBytes(totals.bytes)}`;

  if (recursive) {
    return files;
  }

  const folders = `${formatNumber(totals.folders)} folder(s)`;

  return `${files} · ${folders} — add --recursive to include everything inside them`;
}
