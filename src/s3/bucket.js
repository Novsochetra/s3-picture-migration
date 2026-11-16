import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetBucketVersioningCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  paginateListObjectsV2,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { isNotFound } from './errors.js';

// CopySource must be URL-encoded segment by segment, keeping the slashes.
const copySource = (bucketName, key) =>
  `${bucketName}/${key.split('/').map(encodeURIComponent).join('/')}`;

async function headObject(send, key) {
  try {
    return await send(HeadObjectCommand, { Key: key });
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }

    throw error;
  }
}

async function openObject(send, key) {
  const response = await send(GetObjectCommand, { Key: key });

  return {
    response,
    read: async () => Buffer.from(await response.Body.transformToByteArray()),
    abort: () => response.Body.destroy(),
  };
}

function startUpload(client, bucketName, { key, body, params = {}, tuning = {} }) {
  const upload = new Upload({
    client,
    ...tuning,
    params: { Bucket: bucketName, Key: key, Body: body, ...params },
  });

  return { done: () => upload.done(), abort: () => upload.abort() };
}

async function removeObjects(send, keys) {
  const response = await send(DeleteObjectsCommand, {
    Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
  });

  return response.Errors ?? [];
}

function listPages(client, bucketName, { prefix, delimiter }) {
  const query = { Bucket: bucketName, Prefix: prefix, ...(delimiter && { Delimiter: delimiter }) };

  return paginateListObjectsV2({ client, pageSize: 1000 }, query);
}

async function readVersioning(send) {
  const response = await send(GetBucketVersioningCommand, {});

  return response.Status ?? 'off';
}

export function createBucket(client, name) {
  const send = (Command, input) => client.send(new Command({ Bucket: name, ...input }));

  return {
    name,
    head: (key) => headObject(send, key),
    open: (key) => openObject(send, key),
    upload: (request) => startUpload(client, name, request),
    put: (key, params) => send(PutObjectCommand, { Key: key, ...params }),
    copy: ({ from, to, ...params }) =>
      send(CopyObjectCommand, { Key: to, CopySource: copySource(name, from), ...params }),
    remove: (key) => send(DeleteObjectCommand, { Key: key }),
    removeMany: (keys) => removeObjects(send, keys),
    pages: (query) => listPages(client, name, query),
    listOnce: ({ prefix, delimiter }) =>
      send(ListObjectsV2Command, { Prefix: prefix, Delimiter: delimiter }),
    checkAccess: () => send(HeadBucketCommand, {}),
    versioning: () => readVersioning(send),
  };
}
