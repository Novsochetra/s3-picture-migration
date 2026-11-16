import { printUsage } from '../cli/usage.js';
import { createBucket } from '../s3/bucket.js';
import { createS3Client, fallbackRegion } from '../s3/client.js';
import { copyFromBucket } from './copy-from-bucket.js';
import { emptyFolder } from './empty-folder.js';
import { ensureFolder } from './ensure-folder.js';
import { listSizes } from './list-sizes.js';
import { parseCreateFolderArgs, targetFolderOf } from './options.js';
import { printSummary } from './summary.js';
import { uploadLocal } from './upload-local.js';

const USAGE_FILE = new URL('./usage.txt', import.meta.url);

// Following region redirects lets this work on a bucket in any region with just the two keys.
function connectFolderBucket(args) {
  const connection = {
    region: args.region,
    endpoint: args.endpoint,
    pathStyle: args['path-style'],
  };
  const region = fallbackRegion(connection);
  const extra = { followRegionRedirects: true };

  return createBucket(createS3Client({ region, connection, extra }), args.bucket);
}

const newStats = () => ({ uploaded: 0, copied: 0, skipped: 0, deleted: 0, failed: 0, bytes: 0 });

async function openFolder(args, connect) {
  const folder = targetFolderOf(args);
  const bucket = connect(args);
  // One listing, reused by every step, which keeps it up to date.
  const existing = await listSizes(bucket, folder);

  return { args, bucket, folder, existing, stats: newStats() };
}

// connect is swapped out by the tests.
export async function runCreateFolder(argv, { connect = connectFolderBucket } = {}) {
  const args = parseCreateFolderArgs(argv);

  if (args.help) {
    return printUsage(USAGE_FILE);
  }

  const context = await openFolder(args, connect);

  if (args.empty && !(await emptyFolder(context))) {
    return 0;
  }

  await ensureFolder(context);
  await uploadLocal(context);
  await copyFromBucket(context);
  printSummary(context);

  return context.stats.failed ? 1 : 0;
}
