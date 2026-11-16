import fs from 'node:fs';
import path from 'node:path';
import { formatBytes } from '../utils/format.js';
import { runPool } from '../utils/pool.js';
import { contentTypeOf } from './content-types.js';
import { isAlreadyThere } from './list-sizes.js';
import { localFiles } from './local-files.js';

const UPLOADS_IN_FLIGHT = 4;

async function uploadOne(context, { abs, rel }) {
  const { bucket, folder, existing, stats } = context;
  const key = folder + rel;
  const size = fs.statSync(abs).size;

  if (isAlreadyThere(context, key, size)) {
    stats.skipped++;
    console.log(`skip      ${rel} (already there)`);

    return;
  }

  try {
    const body = fs.createReadStream(abs);

    await bucket.upload({ key, body, params: { ContentType: contentTypeOf(rel) } }).done();
    existing.set(key, size);
    stats.uploaded++;
    stats.bytes += size;
    console.log(`uploaded  ${path.relative(process.cwd(), abs)} -> ${key} (${formatBytes(size)})`);
  } catch (error) {
    stats.failed++;
    console.error(`FAIL      ${abs}: ${error.name}: ${error.message}`);
  }
}

export async function uploadLocal(context) {
  const files = context.args.upload.flatMap(localFiles);

  if (!files.length) {
    return;
  }

  console.log(`\nUploading ${files.length} local file(s)...`);
  await runPool(files, UPLOADS_IN_FLIGHT, (file) => uploadOne(context, file));
}
