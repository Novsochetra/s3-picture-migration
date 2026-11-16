import { formatBytes } from '../utils/format.js';
import { runPool } from '../utils/pool.js';
import { resolveCopySources } from './copy-sources.js';
import { isAlreadyThere } from './list-sizes.js';

const COPIES_IN_FLIGHT = 4;
const MAX_COPY_BYTES = 5 * 1024 ** 3;

// A server-side copy keeps Content-Type and metadata, and no bytes pass through this machine.
async function copyOne(context, { key, size, rel }) {
  const { bucket, folder, existing, stats } = context;

  const destination = folder + rel;

  if (destination === key) {
    return;
  }

  if (isAlreadyThere(context, destination, size)) {
    stats.skipped++;
    console.log(`skip      ${rel} (already there)`);

    return;
  }

  if (size > MAX_COPY_BYTES) {
    stats.failed++;
    console.error(`FAIL      ${key}: larger than 5 GB, cannot be copied in one request`);

    return;
  }

  try {
    await bucket.copy({ from: key, to: destination });
    existing.set(destination, size);
    stats.copied++;
    stats.bytes += size;
    console.log(`copied    ${key} -> ${destination} (${formatBytes(size)})`);
  } catch (error) {
    stats.failed++;
    console.error(`FAIL      ${key}: ${error.name}: ${error.message}`);
  }
}

export async function copyFromBucket(context) {
  for (const rawSource of context.args['copy-from']) {
    const resolved = await resolveCopySources(context, rawSource);

    if (resolved) {
      const { from, sources } = resolved;
      console.log(
        `\nCopying ${sources.length} file(s) from s3://${context.bucket.name}/${from} ...`,
      );
      await runPool(sources, COPIES_IN_FLIGHT, (source) => copyOne(context, source));
    }
  }
}
