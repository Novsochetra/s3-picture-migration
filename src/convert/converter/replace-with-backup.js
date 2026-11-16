import { backupKeyFor } from '../naming.js';
import { converted, encodeImage, keptOriginal, SOURCE_GONE } from './encode-image.js';
import { fetchBuffer } from './fetch-buffer.js';
import { addMissingSizes } from './sizes.js';

// A server-side copy of exactly the version that was looked at.
async function ensureBackup({ bucket }, { key, current, backupKey }) {
  const existing = await bucket.head(backupKey);

  if (existing?.ETag === current.ETag) {
    return false;
  }

  await bucket.copy({ from: key, to: backupKey, CopySourceIfMatch: current.ETag });

  const check = await bucket.head(backupKey);

  if (!check || check.ContentLength !== current.ContentLength) {
    throw new Error(`backup ${backupKey} could not be verified; original left untouched`);
  }

  return true;
}

// IfMatch makes S3 refuse the write when the app replaced the file meanwhile; the retry
// then starts over from the new version.
function originalParams({ conditionalWrites }, current, backupKey) {
  return {
    ...(current.CacheControl && { CacheControl: current.CacheControl }),
    ...(current.ContentDisposition && { ContentDisposition: current.ContentDisposition }),
    Metadata: { ...(current.Metadata ?? {}), 'original-backup': encodeURIComponent(backupKey) },
    ...(conditionalWrites && { IfMatch: current.ETag }),
  };
}

// The backup is the only copy of the original once the WebP is written over it, so it is
// dropped only while the original still sits untouched at its key.
async function dropBackupIfOriginalUntouched({ bucket }, { key, current, backupKey }) {
  const now = await bucket.head(key);

  if (now?.ETag === current.ETag) {
    await bucket.remove(backupKey).catch(() => {});
  }
}

async function encodeOverOriginal(context, target) {
  const { key, current, backupKey, createdBackup } = target;
  const { buffer } = await fetchBuffer(context, backupKey);
  const params = originalParams(context, current, backupKey);

  try {
    return await encodeImage(context, { buffer, sourceKey: backupKey, mainKey: key, params });
  } catch (error) {
    // After a network error the backup is kept for the retry.
    if (error.permanent && createdBackup) {
      await dropBackupIfOriginalUntouched(context, target);
    }

    throw error;
  }
}

async function addSizesToConverted(context, { key, current, backupKey }) {
  const added = await addMissingSizes(context, {
    mainKey: key,
    preferredSource: backupKey,
    fallbackSource: key,
    cacheControl: current.CacheControl,
    reason: 'main image already webp',
  });

  return added ?? { status: 'skipped', reason: 'already webp' };
}

// Every step is safe to repeat, so a crash anywhere resumes on the next run.
export async function replaceWithBackup(context, { key }) {
  const backupKey = backupKeyFor(key, context.settings.backupSuffix);
  const current = await context.bucket.head(key);

  if (!current) {
    return SOURCE_GONE;
  }

  if (current.ContentType === 'image/webp') {
    return addSizesToConverted(context, { key, current, backupKey });
  }

  const createdBackup = await ensureBackup(context, { key, current, backupKey });
  const encoded = await encodeOverOriginal(context, { key, current, backupKey, createdBackup });

  if (encoded.larger && createdBackup) {
    await context.bucket.remove(backupKey);
  }

  return encoded.larger
    ? keptOriginal(encoded)
    : converted(encoded, { to: key, backup: backupKey });
}
