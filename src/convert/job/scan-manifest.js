import { extensionOf } from '../../s3/keys.js';
import { formatBytes, formatNumber } from '../../utils/format.js';
import { writeLinesAtomic } from '../../utils/json-files.js';

const countIn = (counts, label) => {
  counts[label] = (counts[label] ?? 0) + 1;
};

const emptyScan = () => ({ count: 0, bytes: 0, seen: 0, byExt: {}, ignored: {} });

function classify(key, { extensions, skipLabel }) {
  const label = skipLabel(key);

  if (label) {
    return { ignore: label };
  }

  const extension = extensionOf(key);

  return extensions.has(extension) ? { extension } : { ignore: extension || '(no ext)' };
}

function manifestLineOf(object, scan, filter) {
  scan.seen++;

  if (object.Key.endsWith('/')) {
    return '';
  }

  const kind = classify(object.Key, filter);
  const size = object.Size ?? 0;

  if (kind.ignore) {
    countIn(scan.ignored, kind.ignore);

    return '';
  }

  scan.count++;
  scan.bytes += size;
  countIn(scan.byExt, kind.extension);

  return `${JSON.stringify({ k: object.Key, s: size })}\n`;
}

function showProgress(scan) {
  if (process.stdout.isTTY) {
    process.stdout.write(
      `\r  scanned ${formatNumber(scan.seen)} objects · ${formatNumber(scan.count)} images · ` +
        `${formatBytes(scan.bytes)}   `,
    );
  }
}

export async function scanToManifest({ bucket, prefix, manifestPath, filter }) {
  const scan = emptyScan();

  await writeLinesAtomic(manifestPath, async (write) => {
    for await (const page of bucket.pages({ prefix })) {
      write((page.Contents ?? []).map((object) => manifestLineOf(object, scan, filter)).join(''));
      showProgress(scan);
    }
  });

  if (process.stdout.isTTY) {
    process.stdout.write('\n');
  }

  return { ...scan, at: new Date().toISOString() };
}
