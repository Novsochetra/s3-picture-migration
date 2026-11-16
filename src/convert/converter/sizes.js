import { variantKeyFor } from '../naming.js';
import { encodeUpload } from './encode-upload.js';
import { fetchBuffer } from './fetch-buffer.js';

// One width after another, so only one decoded image is in memory at a time.
export async function makeSizes(context, { buffer, sourceKey, mainKey, widths, cacheControl }) {
  let bytes = 0;

  for (const width of widths) {
    const result = await encodeUpload(context, {
      buffer,
      sourceKey,
      targetKey: variantKeyFor(mainKey, width),
      width,
      params: {
        ...(cacheControl && { CacheControl: cacheControl }),
        Metadata: { 'size-of': encodeURIComponent(mainKey), 'size-width': String(width) },
      },
    });

    bytes += result.out;
  }

  return bytes;
}

async function missingSizes({ bucket, settings }, mainKey) {
  const widths = settings.sizes ?? [];
  const found = await Promise.all(
    widths.map((width) => bucket.head(variantKeyFor(mainKey, width))),
  );

  return widths.filter((_, i) => !found[i]);
}

export async function addMissingSizes(context, request) {
  const { mainKey, preferredSource, fallbackSource, cacheControl, reason } = request;

  const widths = await missingSizes(context, mainKey);

  if (!widths.length) {
    return null;
  }

  const hasPreferred = preferredSource && (await context.bucket.head(preferredSource));
  const sourceKey = hasPreferred ? preferredSource : fallbackSource;
  const { buffer } = await fetchBuffer(context, sourceKey);

  const vout = await makeSizes(context, { buffer, sourceKey, mainKey, widths, cacheControl });

  return { st: 'done', onlySizes: true, reason, to: mainKey, sizes: widths, vout };
}

export async function makeAllSizes(context, { buffer, sourceKey, mainKey, cacheControl }) {
  const widths = context.settings.sizes ?? [];

  return widths.length
    ? makeSizes(context, { buffer, sourceKey, mainKey, widths, cacheControl })
    : 0;
}
