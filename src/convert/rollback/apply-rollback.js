import { explainError, isPreconditionFailed } from '../../s3/errors.js';
import { fileNameOf } from '../../s3/keys.js';
import { formatBytes, formatNumber } from '../../utils/format.js';
import { chunk, runPool } from '../../utils/pool.js';

const DELETE_BATCH = 1000;

// IfMatch refuses the copy when the app replaced the image since the plan: a new upload is
// never overwritten.
async function restoreOne({ bucket, settings, connection }, entry) {
  await bucket.copy({
    from: entry.backupKey,
    to: entry.mainKey,
    CopySourceIfMatch: entry.backupEtag,
    ...(!connection.endpoint && { IfMatch: entry.mainEtag }),
    ...(settings.acl && { ACL: settings.acl }),
  });

  const check = await bucket.head(entry.mainKey);

  if (!check || check.ContentLength !== entry.size || check.Metadata?.['original-backup']) {
    throw new Error('restored image could not be verified; backup kept');
  }

  await bucket.remove(entry.backupKey);
}

async function restoreAll(session, entries, tally) {
  await runPool(entries, session.limits.concurrency, async (entry) => {
    try {
      await restoreOne(session, entry);
      tally.restored++;
      session.log.info(
        `restored  ${entry.mainKey}  (from ${fileNameOf(entry.backupKey)}, ${formatBytes(entry.size)})`,
      );
    } catch (error) {
      const why = isPreconditionFailed(error)
        ? 'the app replaced this image meanwhile; left as is'
        : explainError(error);

      tally.failed++;
      session.log.error(`FAIL      ${entry.mainKey}: ${why} (backup kept)`);
    }
  });
}

async function deleteBatch({ bucket, log }, batch, { label, counter }, tally) {
  try {
    const errors = await bucket.removeMany(batch);
    const failedKeys = new Set(errors.map((error) => error.Key));

    errors.forEach((error) => {
      tally.failed++;
      log.error(`FAIL      delete ${error.Key}: ${error.Code} ${error.Message ?? ''}`);
    });
    batch
      .filter((key) => !failedKeys.has(key))
      .forEach((key) => {
        tally[counter]++;
        log.fileOnly('INFO', `deleted ${label} ${key}`);
      });
  } catch (error) {
    tally.failed += batch.length;
    log.error(`FAIL      deleting ${batch.length} ${label}(s): ${explainError(error)}`);
  }
}

async function deleteAll(session, keys, kind, tally) {
  for (const batch of chunk(keys, DELETE_BATCH)) {
    await deleteBatch(session, batch, kind, tally);
  }

  if (keys.length) {
    session.log.info(`deleted   ${formatNumber(tally[kind.counter])} ${kind.label}(s)`);
  }
}

// Restores come first, and a backup is removed only once its image is verified.
export async function applyRollback(session, plan) {
  const tally = { restored: 0, backupsRemoved: 0, copiesDeleted: 0, failed: 0 };
  const unusedBackups = { label: 'unused backup', counter: 'backupsRemoved' };
  const copies = { label: 'copy', counter: 'copiesDeleted' };

  await restoreAll(session, plan.restore, tally);
  await deleteAll(session, plan.unusedBackups, unusedBackups, tally);
  await deleteAll(session, plan.copies, copies, tally);

  return tally;
}
