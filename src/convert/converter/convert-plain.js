import { mainKeyFor } from '../naming.js';
import { encodeUpload } from './encode-upload.js';
import { fetchIfExists } from './fetch-buffer.js';
import { addMissingSizes, makeAllSizes } from './sizes.js';

const GONE = { st: 'skipped', reason: 'source no longer exists' };

async function findConverted({ bucket, settings }, { key, mainKey }) {
  if (mainKey !== key) {
    return settings.overwrite ? null : bucket.head(mainKey);
  }

  const current = await bucket.head(key);

  if (!current) {
    return GONE;
  }

  return current.ContentType === 'image/webp' ? current : null;
}

// The last run crashed between the upload and the delete: the delete is finished now.
async function finishDelete(context, { key, mainKey, existing }) {
  const madeFrom = decodeURIComponent(existing.Metadata?.['original-key'] ?? '');

  if (mainKey === key || !context.settings.deleteOriginal || madeFrom !== key) {
    return false;
  }

  await context.bucket.remove(key);

  return true;
}

async function finishConverted(context, target) {
  const { key, mainKey, existing } = target;

  const sameKey = mainKey === key;
  const added = await addMissingSizes(context, {
    mainKey,
    preferredSource: sameKey ? null : key,
    fallbackSource: mainKey,
    cacheControl: existing.CacheControl,
    reason: sameKey ? 'main image already webp' : 'webp already existed',
  });

  if (await finishDelete(context, target)) {
    const reason = 'webp was already uploaded; original deleted';

    return { ...(added ?? {}), st: 'done', onlySizes: true, reason, to: mainKey };
  }

  const reason = sameKey ? 'already webp' : 'webp already exists';

  return added ?? { st: 'skipped', reason, to: mainKey };
}

const copiedParams = (response, key) => ({
  ...(response.CacheControl && { CacheControl: response.CacheControl }),
  ...(response.ContentDisposition && { ContentDisposition: response.ContentDisposition }),
  Metadata: { ...(response.Metadata ?? {}), 'original-key': encodeURIComponent(key) },
});

async function convertFresh(context, { key, mainKey }) {
  const fetched = await fetchIfExists(context, key);

  if (!fetched) {
    return GONE;
  }

  const { buffer, response } = fetched;
  const limit = context.settings.allowLarger ? null : buffer.length;
  const params = copiedParams(response, key);
  const main = await encodeUpload(context, {
    buffer,
    sourceKey: key,
    targetKey: mainKey,
    limit,
    params,
  });

  const cacheControl = response.CacheControl;
  const vout = await makeAllSizes(context, { buffer, sourceKey: key, mainKey, cacheControl });

  const sizes = context.settings.sizes ?? [];
  if (main.larger) {
    return {
      st: 'skipped',
      reason: 'webp would be larger; original kept',
      in: buffer.length,
      sizes,
      vout,
    };
  }

  if (context.settings.deleteOriginal && mainKey !== key) {
    await context.bucket.remove(key);
  }

  return { st: 'done', to: mainKey, in: buffer.length, out: main.out, sizes, vout };
}

export async function convertPlain(context, { key }) {
  const mainKey = mainKeyFor(key, context.settings.keepExt);
  const existing = await findConverted(context, { key, mainKey });

  if (existing === GONE) {
    return GONE;
  }

  return existing
    ? finishConverted(context, { key, mainKey, existing })
    : convertFresh(context, { key, mainKey });
}
