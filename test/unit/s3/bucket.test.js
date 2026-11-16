import { describe, expect, it } from 'vitest';
import { createBucket } from '../../../src/s3/bucket.js';

function recordingClient(reply = () => ({})) {
  const sent = [];

  return {
    sent,
    send: async (command) => {
      sent.push({ name: command.constructor.name, input: command.input });

      return reply(command);
    },
  };
}

describe('createBucket', () => {
  it('sends every request to its own bucket', async () => {
    const client = recordingClient();

    await createBucket(client, 'photos').remove('raw/cat.jpg');

    expect(client.sent).toEqual([
      { name: 'DeleteObjectCommand', input: { Bucket: 'photos', Key: 'raw/cat.jpg' } },
    ]);
  });

  it('URL-encodes the copy source segment by segment', async () => {
    const client = recordingClient();

    await createBucket(client, 'photos').copy({
      from: 'raw/my cat+1.jpg',
      to: 'raw/backup.jpg',
      CopySourceIfMatch: '"etag"',
    });

    expect(client.sent[0].input).toEqual({
      Bucket: 'photos',
      Key: 'raw/backup.jpg',
      CopySource: 'photos/raw/my%20cat%2B1.jpg',
      CopySourceIfMatch: '"etag"',
    });
  });

  it('reads a missing object as null and rethrows other errors', async () => {
    const missing = Object.assign(new Error('nf'), { name: 'NotFound' });
    const denied = Object.assign(new Error('no'), { name: 'AccessDenied' });
    const bucket = (error) =>
      createBucket(
        recordingClient(() => Promise.reject(error)),
        'photos',
      );

    await expect(bucket(missing).head('raw/a.jpg')).resolves.toBeNull();
    await expect(bucket(denied).head('raw/a.jpg')).rejects.toBe(denied);
  });

  it('returns the keys a batch delete could not remove', async () => {
    const errors = [{ Key: 'raw/a.jpg', Code: 'AccessDenied' }];
    const client = recordingClient(() => ({ Errors: errors }));

    expect(await createBucket(client, 'photos').removeMany(['raw/a.jpg', 'raw/b.jpg'])).toEqual(
      errors,
    );
    expect(client.sent[0].input.Delete).toEqual({
      Objects: [{ Key: 'raw/a.jpg' }, { Key: 'raw/b.jpg' }],
      Quiet: true,
    });
  });

  it('reads versioning that was never turned on as off', async () => {
    await expect(createBucket(recordingClient(), 'photos').versioning()).resolves.toBe('off');
  });
});
