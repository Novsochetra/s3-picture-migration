import fs from 'node:fs';
import { saysYes } from '../../cli/prompter.js';
import { formatBytes, formatNumber } from '../../utils/format.js';
import { ProgressStore } from '../job/progress-store.js';
import { scanToManifest } from '../job/scan-manifest.js';
import { tallyJob } from '../job/tally.js';
import { isBackupKey, isVariantKey } from '../naming.js';
import { startOverNote } from './open-session.js';
import { askInSession, canAsk, closePrompt } from './session-prompt.js';
import { describeJobStatus, describeScan } from './status-line.js';

const RESTART_QUESTION =
  'Run it again from the start? The folder is re-scanned and ' +
  'already-converted images are detected and skipped. [y/N]: ';

export const skipLabelFor = (settings) => (key) => {
  if (settings.backupSuffix && isBackupKey(key, settings.backupSuffix)) {
    return 'backup copies';
  }

  return settings.sizes?.length && isVariantKey(key) ? 'size copies' : null;
};

async function ensureScan({ args, log, jobFiles, bucket, prefix, settings, extensions }) {
  const { job, paths } = jobFiles;

  if (fs.existsSync(paths.manifest) && job.scan && !args.rescan) {
    const { at, count, bytes } = job.scan;

    log.info(
      `Using scan from ${at}: ${formatNumber(count)} images, ${formatBytes(bytes)} ` +
        '(--rescan to refresh)',
    );
  } else {
    log.info(`Scanning s3://${bucket.name}/${prefix} ...`);

    const filter = { extensions, skipLabel: skipLabelFor(settings) };

    job.scan = await scanToManifest({ bucket, prefix, manifestPath: paths.manifest, filter });
    describeScan(job.scan).forEach((line) => log.info(line));
  }

  jobFiles.save();
}

async function acceptsStartOver(session) {
  if (session.args['dry-run'] || !canAsk(session)) {
    return false;
  }

  return saysYes(await askInSession(session, RESTART_QUESTION));
}

// Nothing is left: offer to start over, so the user never has to delete the job folder.
async function offerStartOver(session) {
  const { log, jobFiles, resumeCommand } = session;

  log.info('\nThis job is complete: every image found by the scan has been handled.');

  if (await acceptsStartOver(session)) {
    log.info(`${startOverNote(jobFiles.startOver())}\n`);

    return true;
  }

  log.info(`To run it again from the start:        ${resumeCommand} --fresh`);
  log.info(`To only pick up images added since:    ${resumeCommand} --rescan`);
  closePrompt(session);

  return false;
}

async function loadWork(session) {
  const { log, jobFiles, limits } = session;
  const progress = new ProgressStore(jobFiles.paths.progress);

  await ensureScan(session);
  await progress.load();

  const manifestPath = jobFiles.paths.manifest;
  const counts = await tallyJob({ manifestPath, progress, retryFailed: limits.retryFailed });

  log.info(describeJobStatus(counts, limits.retryFailed));
  jobFiles.saveStatus(counts);

  return { progress, counts };
}

// null when nothing is left and the user does not start the job over. A job started over
// here is already confirmed, so the run does not ask again.
export async function prepareWork(session) {
  let confirmed = false;

  for (;;) {
    const work = await loadWork(session);

    if (work.counts.total > work.counts.completed) {
      return { ...work, confirmed };
    }

    confirmed = await offerStartOver(session);

    if (!confirmed) {
      return null;
    }
  }
}
