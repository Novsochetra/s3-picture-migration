import { extensionOf } from '../../s3/keys.js';
import { runPool } from '../../utils/pool.js';
import { isBackupKey, isVariantKey, mainKeyForBackup } from '../naming.js';

const LOOKUPS_IN_FLIGHT = 16;

async function listObjects(bucket, prefix) {
  const objects = new Map();

  for await (const page of bucket.pages({ prefix })) {
    for (const object of page.Contents ?? []) {
      if (!object.Key.endsWith('/')) {
        objects.set(object.Key, { size: object.Size ?? 0, etag: object.ETag });
      }
    }
  }

  return objects;
}

const leave = (key, why) => ({ leave: { key, why } });

const isConvertedFrom = (current, backupKey) =>
  decodeURIComponent(current.Metadata?.['original-backup'] ?? '') === backupKey;

function backupVerdict({ mainKey, current, backupKey, backup }) {
  if (!current) {
    return leave(mainKey, `no longer exists (deleted after conversion?); backup ${backupKey} kept`);
  }

  if (isConvertedFrom(current, backupKey)) {
    const { size, etag: backupEtag } = backup;

    return { restore: { mainKey, backupKey, mainEtag: current.ETag, backupEtag, size } };
  }

  if (current.ETag === backup.etag) {
    return { unusedBackup: backupKey };
  }

  return leave(
    mainKey,
    `changed after the conversion (new upload?); left as is, backup ${backupKey} kept`,
  );
}

async function classifyBackup(bucket, { backupKey, suffix, objects }) {
  const mainKey = mainKeyForBackup(backupKey, suffix);
  const current = await bucket.head(mainKey);

  return backupVerdict({ mainKey, current, backupKey, backup: objects.get(backupKey) });
}

async function classifyCopy(bucket, { key, objects }) {
  const metadata = (await bucket.head(key))?.Metadata ?? {};

  if (metadata['size-of']) {
    return { copy: key };
  }

  if (!metadata['original-key']) {
    return {};
  }

  const original = decodeURIComponent(metadata['original-key']);

  return objects.has(original)
    ? { copy: key }
    : {
        leave: { key, why: `its original ${original} was deleted (--delete-original); webp kept` },
      };
}

function addToPlan(plan, verdict) {
  const lists = {
    restore: plan.restore,
    unusedBackup: plan.unusedBackups,
    copy: plan.copies,
    leave: plan.leave,
  };

  for (const [kind, entry] of Object.entries(verdict)) {
    lists[kind].push(entry);
  }
}

const isMadeCopy = (key, suffix) =>
  !isBackupKey(key, suffix) && (isVariantKey(key) || extensionOf(key) === 'webp');

// Works from what is in S3, not from local logs, so it also covers crashed or partial runs.
// Only files carrying the marker the converter writes into their metadata are touched.
export async function planRollback({ bucket, prefix, suffix }) {
  const objects = await listObjects(bucket, prefix);
  const plan = { restore: [], unusedBackups: [], copies: [], leave: [] };
  const keys = [...objects.keys()];
  const backups = keys.filter((key) => isBackupKey(key, suffix));
  const copies = keys.filter((key) => isMadeCopy(key, suffix));

  await runPool(backups, LOOKUPS_IN_FLIGHT, async (backupKey) => {
    addToPlan(plan, await classifyBackup(bucket, { backupKey, suffix, objects }));
  });
  await runPool(copies, LOOKUPS_IN_FLIGHT, async (key) => {
    addToPlan(plan, await classifyCopy(bucket, { key, objects }));
  });

  return plan;
}

export const planSize = (plan) =>
  plan.restore.length + plan.unusedBackups.length + plan.copies.length;
