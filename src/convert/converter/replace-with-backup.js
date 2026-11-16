import { backupKeyFor } from '../naming.js';
import { encodeUpload } from './encode-upload.js';
import { fetchBuffer } from './fetch-buffer.js';
import { addMissingSizes, makeAllSizes } from './sizes.js';

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

async function encodeOverOriginal(context, { key, current, backupKey, createdBackup }) {
  const { buffer } = await fetchBuffer(context, backupKey);

  try {
    const main = await encodeUpload(context, {
      buffer,
      sourceKey: backupKey,
      targetKey: key,
      limit: context.settings.allowLarger ? null : buffer.length,
      params: originalParams(context, current, backupKey),
    });

    return { buffer, main };
  } catch (error) {
    // The original was never touched, so the extra copy goes; after a network error it is
    // kept for the retry.
    if (error.permanent && createdBackup) {
      await context.bucket.remove(backupKey).catch(() => {});
    }

    throw error;
  }
}

async function sizesOfConverted(context, { key, current, backupKey }) {
  const added = await addMissingSizes(context, {
    mainKey: key,
    preferredSource: backupKey,
    fallbackSource: key,
    cacheControl: current.CacheControl,
    reason: 'main image already webp',
  });

  return added ?? { st: 'skipped', reason: 'already webp' };
}

// Every step is safe to repeat, so a crash anywhere resumes on the next run.
export async function replaceWithBackup(context, { key }) {
  const backupKey = backupKeyFor(key, context.settings.backupSuffix);
  const current = await context.bucket.head(key);

  if (!current) {
    return { st: 'skipped', reason: 'source no longer exists' };
  }

  if (current.ContentType === 'image/webp') {
    return sizesOfConverted(context, { key, current, backupKey });
  }

  const createdBackup = await ensureBackup(context, { key, current, backupKey });

  const target = { key, current, backupKey, createdBackup };
  const { buffer, main } = await encodeOverOriginal(context, target);

  const cacheControl = current.CacheControl;
  const vout = await makeAllSizes(context, {
    buffer,
    sourceKey: backupKey,
    mainKey: key,
    cacheControl,
  });
  const sizes = context.settings.sizes ?? [];

  if (main.larger) {
    if (createdBackup) {
      await context.bucket.remove(backupKey);
    }

    return {
      st: 'skipped',
      reason: 'webp would be larger; original kept',
      in: buffer.length,
      sizes,
      vout,
    };
  }

  return { st: 'done', to: key, backup: backupKey, in: buffer.length, out: main.out, sizes, vout };
}
