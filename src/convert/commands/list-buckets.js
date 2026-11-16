import { listBuckets } from '../../s3/buckets.js';
import { detectBucketRegion } from '../../s3/region.js';

export async function listBucketsCommand({ connection }) {
  const buckets = await listBuckets(connection);

  if (!buckets.length) {
    console.log('This key can see no buckets.');

    return 0;
  }

  const nameWidth = Math.max(...buckets.map((bucket) => bucket.Name.length));

  for (const bucket of buckets) {
    const region =
      bucket.BucketRegion ??
      (await detectBucketRegion(bucket.Name, connection).catch(() => null)) ??
      '?';
    const created = bucket.CreationDate?.toISOString().slice(0, 10) ?? '?';

    console.log(`${bucket.Name.padEnd(nameWidth)}  ${region.padEnd(15)}  created ${created}`);
  }

  return 0;
}
