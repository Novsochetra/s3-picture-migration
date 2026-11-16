import fs from 'node:fs';
import { extensionOf } from '../../s3/keys.js';
import { formatBytes, formatNumber } from '../../utils/format.js';

const addTo = (counts, label) => {
  counts[label] = (counts[label] ?? 0) + 1;
};

function classify(key, { extensions, skipLabel }) {
  const label = skipLabel(key);

  if (label) {
    return { ignore: label };
  }

  const extension = extensionOf(key);

  return extensions.has(extension) ? { extension } : { ignore: extension || '(no ext)' };
}

function scanPage(page, scan, filter) {
  let lines = '';

  for (const object of page.Contents ?? []) {
    scan.seen++;

    const kind = object.Key.endsWith('/') ? null : classify(object.Key, filter);

    if (kind?.ignore) {
      addTo(scan.ignored, kind.ignore);
    } else if (kind) {
      lines += `${JSON.stringify({ k: object.Key, s: object.Size ?? 0 })}\n`;
      scan.count++;
      scan.bytes += object.Size ?? 0;
      addTo(scan.byExt, kind.extension);
    }
  }

  return lines;
}

const showProgress = (scan) =>
  process.stdout.write(
    `\r  scanned ${formatNumber(scan.seen)} objects · ${formatNumber(scan.count)} images · ` +
      `${formatBytes(scan.bytes)}   `,
  );

export async function scanToManifest({ bucket, prefix, manifestPath, filter }) {
  const scan = { count: 0, bytes: 0, seen: 0, byExt: {}, ignored: {} };
  const showsProgress = process.stdout.isTTY;

  const temporary = `${manifestPath}.tmp`;
  const fd = fs.openSync(temporary, 'w');
  try {
    for await (const page of bucket.pages({ prefix })) {
      fs.writeSync(fd, scanPage(page, scan, filter));

      if (showsProgress) {
        showProgress(scan);
      }
    }
  } finally {
    fs.closeSync(fd);
  }

  if (showsProgress) {
    process.stdout.write('\n');
  }

  // Renamed only now, so an interrupted scan never becomes the manifest.
  fs.renameSync(temporary, manifestPath);

  return { ...scan, at: new Date().toISOString() };
}
