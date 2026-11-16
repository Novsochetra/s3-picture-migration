import { mainKeyFor } from '../naming.js';
import { converted, encodeImage, keptOriginal, SOURCE_GONE } from './encode-image.js';
import { fetchIfExists } from './fetch-buffer.js';
import { addMissingSizes } from './sizes.js';

async function findConverted({ bucket, settings }, { key, mainKey }) {
  if (mainKey !== key) {
    return settings.overwrite ? null : bucket.head(mainKey);
  }

  const current = await bucket.head(key);

  if (!current) {
    return SOURCE_GONE;
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

    return { ...(added ?? {}), status: 'done', onlySizes: true, reason, to: mainKey };
  }

  const reason = sameKey ? 'already webp' : 'webp already exists';

  return added ?? { status: 'skipped', reason, to: mainKey };
}

const copiedParams = (response, key) => ({
  ...(response.CacheControl && { CacheControl: response.CacheControl }),
  ...(response.ContentDisposition && { ContentDisposition: response.ContentDisposition }),
  Metadata: { ...(response.Metadata ?? {}), 'original-key': encodeURIComponent(key) },
});

async function convertFresh(context, { key, mainKey }) {
  const fetched = await fetchIfExists(context, key);

  if (!fetched) {
    return SOURCE_GONE;
  }

  const params = copiedParams(fetched.response, key);
  const encoded = await encodeImage(context, {
    buffer: fetched.buffer,
    sourceKey: key,
    mainKey,
    params,
  });

  if (encoded.larger) {
    return keptOriginal(encoded);
  }

  if (context.settings.deleteOriginal && mainKey !== key) {
    await context.bucket.remove(key);
  }

  return converted(encoded, { to: mainKey });
}

export async function convertPlain(context, { key }) {
  const mainKey = mainKeyFor(key, context.settings.keepExt);
  const existing = await findConverted(context, { key, mainKey });

  if (existing === SOURCE_GONE) {
    return SOURCE_GONE;
  }

  return existing
    ? finishConverted(context, { key, mainKey, existing })
    : convertFresh(context, { key, mainKey });
}
