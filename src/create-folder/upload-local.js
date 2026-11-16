import fs from 'node:fs';
import path from 'node:path';
import { runPool } from '../utils/pool.js';
import { contentTypeOf } from './content-types.js';
import { localFiles } from './local-files.js';
import { skipIfAlreadyThere, transferFile } from './transfer.js';

const UPLOADS_IN_FLIGHT = 4;

async function uploadOne(context, { abs, rel }) {
  const key = context.folder + rel;
  const size = fs.statSync(abs).size;
  const params = { ContentType: contentTypeOf(rel) };
  const send = () => context.bucket.upload({ key, body: fs.createReadStream(abs), params }).done();

  if (skipIfAlreadyThere(context, key, rel, size)) {
    return;
  }

  const from = path.relative(process.cwd(), abs);

  await transferFile(context, { counter: 'uploaded', verb: 'uploaded', from, to: key, size, send });
}

export async function uploadLocal(context) {
  const files = context.args.upload.flatMap(localFiles);

  if (!files.length) {
    return;
  }

  console.log(`\nUploading ${files.length} local file(s)...`);
  await runPool(files, UPLOADS_IN_FLIGHT, (file) => uploadOne(context, file));
}
