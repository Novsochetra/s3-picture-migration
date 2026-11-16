import { pipeline } from 'node:stream';
import sharp from 'sharp';
import { extensionOf } from '../../s3/keys.js';
import { WEBP_MAX_DIMENSION } from '../settings/defaults.js';
import { whileActive } from './active-transfers.js';
import { byteCounter, LargerThanOriginalError } from './byte-counter.js';

const UPLOAD_TUNING = { queueSize: 2, partSize: 8 * 1024 * 1024 };

function webpEncoder(buffer, { sourceKey, width, settings }) {
  const targetWidth = Math.min(
    width ?? settings.maxWidth ?? WEBP_MAX_DIMENSION,
    WEBP_MAX_DIMENSION,
  );
  const resize = {
    width: targetWidth,
    // Only a ceiling: the height follows the aspect ratio.
    height: WEBP_MAX_DIMENSION,
    fit: 'inside',
    withoutEnlargement: true,
  };

  return (
    sharp(buffer, { animated: extensionOf(sourceKey) === 'gif' })
      // EXIF orientation first, so width and height are as people see the image.
      .rotate()
      .resize(resize)
      .webp({ quality: settings.quality, effort: 4 })
  );
}

// Remembers which stream failed first: the upload only reports that its body broke.
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

async function finishUpload({ upload, counter, failure }) {
  try {
    await upload.done();

    return { bytesOut: counter.total() };
  } catch (error) {
    const cause = failure.origin?.error ?? error;

    if (cause instanceof LargerThanOriginalError) {
      return { larger: true };
    }

    // The source is complete in memory, so a sharp error means the file itself is bad.
    if (failure.origin?.stage === 'encode') {
      cause.permanent = true;
    }

    throw cause;
  }
}

export function encodeUpload(context, request) {
  const encoder = webpEncoder(request.buffer, { ...request, settings: context.settings });
  const transfer = startEncodedUpload(context, encoder, request);
  const abort = async () => {
    encoder.destroy();
    await transfer.upload.abort().catch(() => {});
  };

  return whileActive(context.state, abort, () => finishUpload(transfer));
}
