import { isNotFound } from '../../s3/errors.js';

// The whole file is read before sharp sees it, so a sharp error is about the file itself,
// never a half-finished download.
export async function fetchBuffer({ bucket, state }, key) {
  const download = await bucket.open(key);
  const handle = { abort: async () => download.abort() };

  state.active.add(handle);

  try {
    const buffer = await download.read();
    const expected = download.response.ContentLength;

    if (expected !== undefined && expected !== null && buffer.length !== expected) {
      throw new Error(`download incomplete (${buffer.length} of ${expected} bytes)`);
    }

    return { buffer, response: download.response };
  } finally {
    state.active.delete(handle);
  }
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
