import { S3Client } from '@aws-sdk/client-s3';

export function createS3Client({ region, connection, extra = {} }) {
  return new S3Client({
    region,
    ...(connection.endpoint && { endpoint: connection.endpoint }),
    ...(connection.pathStyle && { forcePathStyle: true }),
    maxAttempts: 5,
    ...extra,
  });
}

export const fallbackRegion = (connection) =>
  connection.region || process.env.AWS_REGION || 'us-east-1';
