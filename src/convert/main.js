import { printUsage } from '../cli/usage.js';
import { createLogger } from '../logging/logger.js';
import { connectBucket } from '../s3/region.js';
import { listBucketsCommand } from './commands/list-buckets.js';
import { lsCommand } from './commands/ls.js';
import { chooseTarget } from './menu/choose-target.js';
import { connectionOf, parseConvertArgs, runLimitsOf } from './options.js';
import { rollback } from './rollback/rollback.js';
import { convertJob } from './run/convert-job.js';
import { openSession } from './run/open-session.js';

const USAGE_FILE = new URL('./usage.txt', import.meta.url);

async function runJob(context) {
  const target = await chooseTarget(context);

  if (!target) {
    return 0;
  }

  const session = await openSession(context, target);

  return context.args.rollback ? rollback(session) : convertJob(session);
}

// connect and log are swapped out by the tests.
export async function runConvert(argv, { connect = connectBucket, log = createLogger() } = {}) {
  const args = parseConvertArgs(argv);

  if (args.help) {
    return printUsage(USAGE_FILE);
  }

  const context = { args, connection: connectionOf(args), limits: runLimitsOf(args), log, connect };

  if (args['list-buckets']) {
    return listBucketsCommand(context);
  }

  return args.ls ? lsCommand(context) : runJob(context);
}
