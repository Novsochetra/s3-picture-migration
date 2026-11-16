import { formatBytes } from '../utils/format.js';

export function printSummary({ bucket, folder, existing, stats }) {
  const files = [...existing.keys()].filter((key) => key !== folder);
  const total = files.reduce((sum, key) => sum + existing.get(key), 0);

  console.log(
    `\nDone. ${stats.uploaded} uploaded, ${stats.copied} copied, ${stats.skipped} skipped, ` +
      `${stats.deleted} deleted, ${stats.failed} failed`,
  );
  console.log(
    `s3://${bucket.name}/${folder} now holds ${files.length} file(s), ${formatBytes(total)}`,
  );

  if (!files.length) {
    return;
  }

  // The converter remembers what it did for this folder: after emptying, its job starts over;
  // after adding files, it re-lists the folder.
  const flag = stats.deleted ? '--fresh' : '--rescan';

  console.log(
    `\nConvert them to WebP:\n  npm run convert -- --bucket ${bucket.name} --prefix "${folder}" ${flag}`,
  );
}
