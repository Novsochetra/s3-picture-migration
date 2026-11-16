import { pipeline } from 'node:stream';
import sharp from 'sharp';
import { extensionOf } from '../../s3/keys.js';
import { WEBP_MAX_DIMENSION } from '../settings/defaults.js';
import { byteCounter, LargerThanOriginalError } from './byte-counter.js';

const UPLOAD_TUNING = { queueSize: 2, partSize: 8 * 1024 * 1024 };

function webpEncoder(buffer, { sourceKey, width, settings }) {
  const targetWidth = Math.min(
    width ?? settings.maxWidth ?? WEBP_MAX_DIMENSION,
    WEBP_MAX_DIMENSION,
  );

  return (
    sharp(buffer, { animated: extensionOf(sourceKey) === 'gif' })
      // EXIF orientation first, so width and height are as people see the image.
      .rotate()
      // The height is only a ceiling: it follows the aspect ratio.
      .resize({
        width: targetWidth,
        height: WEBP_MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: settings.quality, effort: 4 })
  );
}

function startEncodedUpload({ bucket, settings }, encoder, request) {
  const counter = byteCounter(request.limit ?? null);
  const failure = { origin: null };

  encoder.on('error', (error) => (failure.origin ??= { stage: 'encode', error }));
  counter.on('error', (error) => (failure.origin ??= { stage: 'output', error }));

  const upload = bucket.upload({
    key: request.targetKey,
    body: pipeline(encoder, counter, () => {}),
    params: {
      ContentType: 'image/webp',
      ...(settings.acl && { ACL: settings.acl }),
      ...request.params,
    },
    tuning: UPLOAD_TUNING,
  });

  return { upload, counter, failure };
}

export async function encodeUpload(context, request) {
  const encoder = webpEncoder(request.buffer, { ...request, settings: context.settings });
  const { upload, counter, failure } = startEncodedUpload(context, encoder, request);

  const handle = {
    abort: async () => {
      encoder.destroy();
      await upload.abort().catch(() => {});
    },
  };
  context.state.active.add(handle);

  try {
    await upload.done();
  } catch (error) {
    const cause = failure.origin?.error ?? error;

    if (cause instanceof LargerThanOriginalError) {
      return { larger: true };
    }

    // The source is complete in memory, so a sharp error means the file itself is bad.
    cause.permanent = failure.origin?.stage === 'encode' || cause.permanent;

    throw cause;
  } finally {
    context.state.active.delete(handle);
  }

  return { out: counter.total() };
}
