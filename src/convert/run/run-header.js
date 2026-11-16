import { describeSettings } from '../settings/describe-settings.js';

async function versioningOf(bucket) {
  try {
    return await bucket.versioning();
  } catch {
    return 'unknown (no permission to check)';
  }
}

// Versioning is the real safety net: with it, any overwrite or delete can be undone in S3.
async function logVersioning({ bucket, args, log }) {
  const versioning = await versioningOf(bucket);

  const tip =
    versioning !== 'Enabled' && !args.rollback
      ? ' (tip: with bucket versioning on, every change can also be undone in S3)'
      : '';
  log.info(`Versioning: ${versioning}${tip}`);
}

export async function logRunHeader(session, freshNote) {
  const { log, bucket, prefix, region, jobFiles, settings, extensions } = session;

  log.info(`\n════ run started ${new Date().toISOString()} ════`);
  log.info(`Job:      s3://${bucket.name}/${prefix}   (region ${region})`);
  log.info(`Job dir:  ${jobFiles.dir}`);
  log.info(`Settings: ${describeSettings(settings, extensions)}`);

  if (freshNote) {
    log.info(freshNote);
  }

  await logVersioning(session);
}
