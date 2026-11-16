import { explainError } from '../../s3/errors.js';
import { jobDirFor } from '../job/job-dir.js';
import { openJob } from '../job/job-files.js';
import { cliSettings } from '../settings/cli-settings.js';
import { resolveSettings, sourceExtensions } from '../settings/resolve-settings.js';
import { resumeCommand } from './resume-command.js';
import { logRunHeader } from './run-header.js';

export const startOverNote = (history) =>
  `Starting this job over${history ? ` (previous progress kept in ${history})` : ''}`;

function openJobFiles({ args, connection, log }, { bucketName, prefix }) {
  const jobsDir = args['jobs-dir'];
  const dir = jobDirFor({ jobsDir, endpoint: connection.endpoint, bucketName, prefix });
  const jobFiles = openJob({ dir, bucketName, prefix, connection });

  log.attach(jobFiles.paths.log);

  return jobFiles;
}

async function connectChecked({ args, connection, log, connect }, target, savedRegion) {
  const knownRegion = args.region ?? target.region ?? savedRegion;
  const connected = await connect(target.bucketName, { connection, knownRegion, log });

  try {
    await connected.bucket.checkAccess();
  } catch (error) {
    throw new Error(`Cannot access bucket "${target.bucketName}": ${explainError(error)}`, {
      cause: error,
    });
  }

  return connected;
}

export async function openSession(context, target) {
  const { args, log } = context;
  const jobFiles = openJobFiles(context, target);
  const { job } = jobFiles;
  const freshNote = args.fresh && jobFiles.wasSaved ? startOverNote(jobFiles.startOver()) : null;
  const resuming = Boolean(job.scan);

  job.settings = resolveSettings({ saved: job.settings, passed: cliSettings(args), resuming, log });

  const { bucket, region } = await connectChecked(context, target, job.region);

  job.region = region;

  const session = {
    ...context,
    prompt: target.prompt ?? null,
    jobFiles,
    bucket,
    region,
    prefix: target.prefix,
    settings: job.settings,
    extensions: sourceExtensions(job.settings),
    resumeCommand: resumeCommand({ ...target, connection: context.connection }),
  };

  await logRunHeader(session, freshNote);

  return session;
}
