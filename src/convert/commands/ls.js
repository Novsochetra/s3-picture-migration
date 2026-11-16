import { createPrompter } from '../../cli/prompter.js';
import { listBuckets } from '../../s3/buckets.js';
import { normalizePrefix } from '../../s3/keys.js';
import { formatBytes, formatDateTime, formatNumber } from '../../utils/format.js';
import { pickBucket } from '../menu/pick-bucket.js';

async function pickTarget({ args, connection }) {
  if (args.bucket) {
    return { name: args.bucket, region: null };
  }

  const prompt = createPrompter();
  const picked = await pickBucket(prompt, await listBuckets(connection));

  prompt.close();

  return picked;
}

function printPage(page, prefix, totals) {
  for (const folder of page.CommonPrefixes ?? []) {
    totals.folders++;
    console.log(`  ${''.padEnd(16)}  ${'DIR'.padStart(9)}  ${folder.Prefix.slice(prefix.length)}`);
  }

  // The folder placeholder itself is not a file in it.
  for (const object of (page.Contents ?? []).filter((entry) => entry.Key !== prefix)) {
    const date = formatDateTime(object.LastModified).padEnd(16);
    const size = formatBytes(object.Size ?? 0).padStart(9);

    totals.files++;
    totals.bytes += object.Size ?? 0;
    console.log(`  ${date}  ${size}  ${object.Key.slice(prefix.length)}`);
  }
}

export async function lsCommand(context) {
  const { args, connection, log, connect } = context;

  const target = await pickTarget(context);
  const knownRegion = args.region ?? target.region;
  const { bucket } = await connect(target.name, { connection, knownRegion, log });

  // Piped into `head`, the pipe closes early: stop quietly.
  process.stdout.on('error', (error) => error.code === 'EPIPE' && process.exit(0));

  const prefix = normalizePrefix(args.prefix);
  const delimiter = args.recursive ? null : '/';
  const totals = { files: 0, bytes: 0, folders: 0 };

  console.log(`s3://${bucket.name}/${prefix}${args.recursive ? '   (recursive)' : ''}\n`);
  for await (const page of bucket.pages({ prefix, delimiter })) {
    printPage(page, prefix, totals);
  }

  const folderNote = args.recursive
    ? ''
    : ` · ${formatNumber(totals.folders)} folder(s) — add --recursive to include everything inside them`;

  console.log(`\n${formatNumber(totals.files)} file(s), ${formatBytes(totals.bytes)}${folderNote}`);

  return 0;
}
