import { GetBucketLocationCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { createBucket } from './bucket.js';
import { createS3Client, fallbackRegion } from './client.js';
import { isCredentialError } from './errors.js';

// S3 reports its first region as no region at all, and an old EU bucket as "EU".
const FIRST_REGION = 'us-east-1';
const LEGACY_EU_REGION = 'eu-west-1';

async function regionFromLocation(probe, bucketName) {
  try {
    const { LocationConstraint: location } = await probe.send(
      new GetBucketLocationCommand({ Bucket: bucketName }),
    );

    if (!location) {
      return FIRST_REGION;
    }

    return location === 'EU' ? LEGACY_EU_REGION : location;
  } catch (error) {
    if (isCredentialError(error)) {
      throw error;
    }

    return null;
  }
}

async function regionFromHead(probe, bucketName) {
  try {
    const response = await probe.send(new HeadBucketCommand({ Bucket: bucketName }));

    return response.BucketRegion ?? FIRST_REGION;
  } catch (error) {
    if (isCredentialError(error)) {
      throw error;
    }

    return error?.$response?.headers?.['x-amz-bucket-region'] ?? error?.BucketRegion ?? null;
  }
}

// Finding the region here means the user only needs the two keys in .env.
export async function detectBucketRegion(bucketName, connection) {
  if (connection.region) {
    return connection.region;
  }

  // S3-compatible services ignore the region.
  if (connection.endpoint) {
    return fallbackRegion(connection);
  }

  const probe = createS3Client({ region: FIRST_REGION, connection });

  return (await regionFromLocation(probe, bucketName)) ?? (await regionFromHead(probe, bucketName));
}

export async function connectBucket(bucketName, { connection, knownRegion, log }) {
  const region = knownRegion ?? (await detectBucketRegion(bucketName, connection));

  if (region) {
    return { bucket: createBucket(createS3Client({ region, connection }), bucketName), region };
  }

  log.warn(
    `Could not detect the region of "${bucketName}"; letting the SDK follow redirects (slower). ` +
      'Pass --region to skip this.',
  );

  const fallback = fallbackRegion(connection);
  const extra = { followRegionRedirects: true };
  const client = createS3Client({ region: fallback, connection, extra });

  return { bucket: createBucket(client, bucketName), region: fallback };
}
