import { ListBucketsCommand } from '@aws-sdk/client-s3';
import { createS3Client, fallbackRegion } from './client.js';
import { isAccessDenied } from './errors.js';

export async function listBuckets(connection) {
  const client = createS3Client({ region: fallbackRegion(connection), connection });

  try {
    const response = await client.send(new ListBucketsCommand({}));

    return response.Buckets ?? [];
  } catch (error) {
    if (isAccessDenied(error)) {
      throw new Error(
        'Your key is not allowed to list buckets (s3:ListAllMyBuckets). ' +
          'Pass the bucket name directly with --bucket <name>.',
        { cause: error },
      );
    }

    throw error;
  }
}
