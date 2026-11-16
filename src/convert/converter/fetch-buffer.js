import { isNotFound } from '../../s3/errors.js';
import { whileActive } from './active-transfers.js';

function checkComplete(buffer, expectedLength) {
  if (expectedLength !== undefined && expectedLength !== null && buffer.length !== expectedLength) {
    throw new Error(`download incomplete (${buffer.length} of ${expectedLength} bytes)`);
  }
}

// The whole file is read before sharp sees it, so a sharp error is about the file itself,
// never a half-finished download.
export async function fetchBuffer({ bucket, state }, key) {
  const download = await bucket.open(key);
  const buffer = await whileActive(
    state,
    async () => download.abort(),
    () => download.read(),
  );

  checkComplete(buffer, download.response.ContentLength);

  return { buffer, response: download.response };
}

export async function fetchIfExists(context, key) {
  try {
    return await fetchBuffer(context, key);
  } catch (error) {
    if (error?.name === 'NoSuchKey' || isNotFound(error)) {
      return null;
    }

    throw error;
  }
}
