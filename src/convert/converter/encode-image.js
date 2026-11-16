import { encodeUpload } from './encode-upload.js';
import { makeAllSizes } from './sizes.js';

export const SOURCE_GONE = { status: 'skipped', reason: 'source no longer exists' };

// The main WebP and every size, all from the one copy of the original in memory.
export async function encodeImage(context, { buffer, sourceKey, mainKey, params }) {
  const limit = context.settings.allowLarger ? null : buffer.length;
  const cacheControl = params.CacheControl;
  const main = await encodeUpload(context, {
    buffer,
    sourceKey,
    targetKey: mainKey,
    limit,
    params,
  });
  const sizeBytes = await makeAllSizes(context, { buffer, sourceKey, mainKey, cacheControl });

  return {
    larger: Boolean(main.larger),
    bytesIn: buffer.length,
    bytesOut: main.bytesOut,
    sizes: context.settings.sizes ?? [],
    sizeBytes,
  };
}

export const keptOriginal = (encoded) => ({
  status: 'skipped',
  reason: 'webp would be larger; original kept',
  bytesIn: encoded.bytesIn,
  sizes: encoded.sizes,
  sizeBytes: encoded.sizeBytes,
});

export const converted = (encoded, written) => ({
  status: 'done',
  ...written,
  bytesIn: encoded.bytesIn,
  bytesOut: encoded.bytesOut,
  sizes: encoded.sizes,
  sizeBytes: encoded.sizeBytes,
});
