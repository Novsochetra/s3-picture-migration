import { createPrompter } from '../../cli/prompter.js';
import { listBuckets } from '../../s3/buckets.js';
import { normalizePrefix } from '../../s3/keys.js';
import { isUnfinished, listJobs } from '../job/job-dir.js';
import { browseFolders } from './browse-folders.js';
import { pickBucket } from './pick-bucket.js';
import { pickUnfinishedJob } from './pick-job.js';

async function chooseInMenu({ args, connection, log, connect }, prompt) {
  const jobs = listJobs({ jobsDir: args['jobs-dir'], endpoint: connection.endpoint });
  const job = await pickUnfinishedJob(prompt, jobs.filter(isUnfinished));

  if (job) {
    return { bucketName: job.bucket, prefix: job.prefix, region: job.region };
  }

  const picked = await pickBucket(prompt, await listBuckets(connection));
  const knownRegion = args.region ?? picked.region;
  const { bucket, region } = await connect(picked.name, { connection, knownRegion, log });
  const prefix = await browseFolders(bucket, prompt);

  return prefix === null ? null : { bucketName: picked.name, prefix, region };
}

export async function chooseTarget(context) {
  const { args } = context;

  if (args.bucket) {
    return { bucketName: args.bucket, prefix: normalizePrefix(args.prefix), region: null };
  }

  const prompt = createPrompter();
  const target = await chooseInMenu(context, prompt);

  if (!target) {
    prompt.close();

    return null;
  }

  return { ...target, prompt };
}
