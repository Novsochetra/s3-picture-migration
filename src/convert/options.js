import { parseArgs } from 'node:util';
import { parseIntegerOption } from '../cli/integer-option.js';

// Conversion settings have no defaults here, so a flag the user passed can be told apart.
const OPTIONS = {
  bucket: { type: 'string' },
  prefix: { type: 'string' },
  region: { type: 'string' },
  endpoint: { type: 'string' },
  'path-style': { type: 'boolean', default: false },
  'list-buckets': { type: 'boolean', default: false },
  rollback: { type: 'boolean', default: false },
  ls: { type: 'boolean', default: false },
  recursive: { type: 'boolean', default: false },
  quality: { type: 'string' },
  'max-width': { type: 'string' },
  sizes: { type: 'string' },
  ext: { type: 'string' },
  'keep-ext': { type: 'boolean' },
  replace: { type: 'boolean' },
  'backup-suffix': { type: 'string' },
  'delete-original': { type: 'boolean' },
  overwrite: { type: 'boolean' },
  'allow-larger': { type: 'boolean' },
  acl: { type: 'string' },
  concurrency: { type: 'string', default: '4' },
  retries: { type: 'string', default: '3' },
  'max-consecutive-failures': { type: 'string', default: '10' },
  'retry-failed': { type: 'boolean', default: false },
  rescan: { type: 'boolean', default: false },
  fresh: { type: 'boolean', default: false },
  'jobs-dir': { type: 'string', default: './s3-webp-jobs' },
  'dry-run': { type: 'boolean', default: false },
  yes: { type: 'boolean', short: 'y', default: false },
  help: { type: 'boolean', short: 'h', default: false },
};

export const parseConvertArgs = (argv) => parseArgs({ args: argv, options: OPTIONS }).values;

export const connectionOf = (args) => ({
  region: args.region,
  endpoint: args.endpoint,
  pathStyle: args['path-style'],
});

export function runLimitsOf(args) {
  const failures = args['max-consecutive-failures'];

  return {
    concurrency: parseIntegerOption(args.concurrency, { name: 'concurrency', min: 1, max: 64 }),
    retries: parseIntegerOption(args.retries, { name: 'retries', min: 0, max: 20 }),
    maxConsecutiveFailures: parseIntegerOption(failures, {
      name: 'max-consecutive-failures',
      min: 1,
      max: 100000,
    }),
    retryFailed: args['retry-failed'],
  };
}
