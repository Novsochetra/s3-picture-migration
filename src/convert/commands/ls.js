import { createPrompter } from '../../cli/prompter.js';
import { listBuckets } from '../../s3/buckets.js';
import { normalizePrefix } from '../../s3/keys.js';
import { pickBucket } from '../menu/pick-bucket.js';
import {
  addToTotals,
  emptyTotals,
  formatRow,
  listingHeader,
  listingRows,
  listingSummary,
} from './listing.js';

async function pickTarget({ args, connection }) {
  if (args.bucket) {
    return { name: args.bucket, region: null };
  }

  const prompt = createPrompter();
  const picked = await pickBucket(prompt, await listBuckets(connection));

  prompt.close();

  return picked;
}

async function openBucket(context) {
  const { args, connection, log, connect } = context;
  const target = await pickTarget(context);
  const knownRegion = args.region ?? target.region;
  const { bucket } = await connect(target.name, { connection, knownRegion, log });

  return bucket;
}

// The listing is data, piped or read, so it goes to stdout rather than through the logger.
export async function lsCommand(context) {
  const bucket = await openBucket(context);
  const prefix = normalizePrefix(context.args.prefix);
  const recursive = context.args.recursive;
  const totals = emptyTotals();

  console.log(listingHeader(bucket.name, prefix, recursive));

  for await (const page of bucket.pages({ prefix, delimiter: recursive ? undefined : '/' })) {
    const rows = listingRows(page, prefix);

    rows.forEach((row) => console.log(formatRow(row)));
    addToTotals(totals, rows);
  }

  console.log(listingSummary(totals, recursive));

  return 0;
}
