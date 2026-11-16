import { parseArgs } from 'node:util';
import { toFolder } from '../s3/keys.js';

export const EMPTYABLE_FOLDER = 'raw/partner/sochetra-image-migration/profile/';

const OPTIONS = {
  bucket: { type: 'string', default: process.env.BUCKET_NAME },
  path: { type: 'string', default: EMPTYABLE_FOLDER },
  upload: { type: 'string', multiple: true, default: [] },
  'copy-from': { type: 'string', multiple: true, default: [] },
  empty: { type: 'boolean', default: false },
  overwrite: { type: 'boolean', default: false },
  yes: { type: 'boolean', short: 'y', default: false },
  region: { type: 'string' },
  endpoint: { type: 'string' },
  'path-style': { type: 'boolean', default: false },
  help: { type: 'boolean', short: 'h', default: false },
};

export const parseCreateFolderArgs = (argv) => parseArgs({ args: argv, options: OPTIONS }).values;

export function targetFolderOf(args) {
  if (!args.bucket) {
    throw new Error('Missing bucket: pass --bucket <name> or set BUCKET_NAME in .env');
  }

  const folder = toFolder(args.path);

  if (folder === '/') {
    throw new Error('--path cannot be empty');
  }

  return folder;
}
