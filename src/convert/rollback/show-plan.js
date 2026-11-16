import { formatNumber } from '../../utils/format.js';

const SHOWN_LEAVES = 10;

function describeRestore(plan, prefix) {
  const count = `  restore from backup:     ${formatNumber(plan.restore.length)} image(s)`;
  const [first] = plan.restore;

  return first
    ? `${count}  (e.g. ${first.mainKey.slice(prefix.length)} <- ${first.backupKey.slice(prefix.length)})`
    : count;
}

function showLeaves(log, leaves, prefix) {
  if (!leaves.length) {
    return;
  }

  log.warn(`  leave alone:             ${formatNumber(leaves.length)}`);
  leaves.slice(0, SHOWN_LEAVES).forEach(({ key, why }) => {
    log.warn(`      ${key.slice(prefix.length)}: ${why}`);
  });

  if (leaves.length > SHOWN_LEAVES) {
    const more = formatNumber(leaves.length - SHOWN_LEAVES);

    log.warn(`      ... and ${more} more (see run.log)`);
  }

  leaves
    .slice(SHOWN_LEAVES)
    .forEach(({ key, why }) => log.fileOnly('WARN', `leave ${key}: ${why}`));
}

export function showPlan({ log, bucket, prefix, settings }, plan) {
  log.info(`\nRollback plan for s3://${bucket.name}/${prefix}:`);
  log.info(describeRestore(plan, prefix));
  log.info(`  remove unused backups:   ${formatNumber(plan.unusedBackups.length)}`);
  log.info(
    `  delete copies we made:   ${formatNumber(plan.copies.length)} (.webp files and size copies)`,
  );
  showLeaves(log, plan.leave, prefix);

  if (settings.keepExt && !settings.backupSuffix) {
    log.warn(
      '  note: this job used --keep-ext (no backups), so images converted in place cannot be restored.',
    );
  }
}
