import { runPool } from '../utils/pool.js';
import { resolveCopySources } from './copy-sources.js';
import { recordFailure, skipIfAlreadyThere, transferFile } from './transfer.js';

const COPIES_IN_FLIGHT = 4;
const MAX_COPY_BYTES = 5 * 1024 ** 3;

// A server-side copy keeps Content-Type and metadata, and no bytes pass through this machine.
async function copyOne(context, { key, size, rel }) {
  const destination = context.folder + rel;
  const send = () => context.bucket.copy({ from: key, to: destination });

  if (destination === key || skipIfAlreadyThere(context, destination, rel, size)) {
    return;
  }

  if (size > MAX_COPY_BYTES) {
    recordFailure(context, `${key}: larger than 5 GB, cannot be copied in one request`);

    return;
  }

  await transferFile(context, { kind: 'copied', from: key, to: destination, size, send });
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
