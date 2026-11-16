import { encodeUpload } from './encode-upload.js';
import { makeAllSizes } from './sizes.js';

// All from the one copy of the original in memory.
export async function uploadWebpAndSizes(context, { buffer, sourceKey, mainKey, params }) {
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
