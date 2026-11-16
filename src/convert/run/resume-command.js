import path from 'node:path';
import { shellQuote } from '../../utils/format.js';

const DEFAULT_SCRIPT = 'bin/s3-to-webp.js';

export function resumeCommand({ bucketName, prefix, connection }) {
  const envFiles = process.execArgv.filter((flag) => flag.startsWith('--env-file'));
  const script = path.relative(process.cwd(), process.argv[1] ?? '') || DEFAULT_SCRIPT;
  const parts = [
    'node',
    ...envFiles,
    script,
    `--bucket ${shellQuote(bucketName)}`,
    ...(prefix ? [`--prefix ${shellQuote(prefix)}`] : []),
    ...(connection.endpoint ? [`--endpoint ${shellQuote(connection.endpoint)}`] : []),
    ...(connection.pathStyle ? ['--path-style'] : []),
  ];

  return parts.join(' ');
}
