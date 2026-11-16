import crypto from 'node:crypto';

const etagOf = (body) => `"${crypto.createHash('md5').update(body).digest('hex')}"`;

function s3Error(name, status, message) {
  const error = new Error(message);

  error.name = name;
  error.$metadata = { httpStatusCode: status };

  return error;
}

const preconditionFailed = () =>
  s3Error(
    'PreconditionFailed',
    412,
    'At least one of the pre-conditions you specified did not hold',
  );

const noSuchKey = () => s3Error('NoSuchKey', 404, 'The specified key does not exist.');

async function readBody(body) {
  if (typeof body === 'string' || Buffer.isBuffer(body)) {
    return Buffer.from(body);
  }

  const chunks = [];

  for await (const piece of body) {
    chunks.push(Buffer.from(piece));
  }

  return Buffer.concat(chunks);
}

function folderListing(objects, { prefix = '', delimiter }) {
  const keys = [...objects.keys()].filter((key) => key.startsWith(prefix)).sort();
  const folders = new Set();
  const contents = [];

  for (const key of keys) {
    const rest = key.slice(prefix.length);
    const cut = delimiter ? rest.indexOf(delimiter) : -1;

    if (cut >= 0) {
      folders.add(`${prefix}${rest.slice(0, cut + 1)}`);
    } else {
      const { ETag, ContentLength, LastModified } = objects.get(key);

      contents.push({ Key: key, Size: ContentLength, ETag, LastModified });
    }
  }

  const commonPrefixes = [...folders].map((folder) => ({ Prefix: folder }));

  return { Contents: contents, CommonPrefixes: commonPrefixes, IsTruncated: false };
}

// The same interface as src/s3/bucket.js, over a Map, with S3's conditional-write rules.
// hooks.beforeUpload(key) runs before each upload is stored, to simulate the app writing meanwhile.
export function createMemoryBucket(name = 'test-bucket', hooks = {}) {
  const objects = new Map();

  const store = (key, body, params = {}) => {
    objects.set(key, {
      body,
      ETag: etagOf(body),
      ContentLength: body.length,
      ContentType: params.ContentType,
      CacheControl: params.CacheControl,
      ContentDisposition: params.ContentDisposition,
      Metadata: { ...(params.Metadata ?? {}) },
      LastModified: new Date(),
    });
  };

  const headOf = (key) => {
    const object = objects.get(key);

    if (!object) {
      return null;
    }

    const head = { ...object, Metadata: { ...object.Metadata } };

    delete head.body;

    return head;
  };

  const checkIfMatch = (key, ifMatch) => {
    if (ifMatch && objects.get(key)?.ETag !== ifMatch) {
      throw preconditionFailed();
    }
  };

  const bucket = {
    name,
    objects,
    seed: (key, body, params = { ContentType: 'image/jpeg' }) =>
      store(key, Buffer.from(body), params),
    bodyOf: (key) => objects.get(key)?.body,
    keys: () => [...objects.keys()].sort(),
    head: async (key) => headOf(key),

    async open(key) {
      if (!objects.has(key)) {
        throw noSuchKey();
      }

      const body = objects.get(key).body;

      return { response: headOf(key), read: async () => Buffer.from(body), abort: () => {} };
    },

    upload({ key, body, params = {} }) {
      const done = async () => {
        const buffer = await readBody(body);

        await hooks.beforeUpload?.(key, bucket);
        checkIfMatch(key, params.IfMatch);
        store(key, buffer, params);
      };

      return { done, abort: async () => {} };
    },

    put: async (key, params) => store(key, await readBody(params.Body ?? ''), params),

    async copy({ from, to, CopySourceIfMatch, IfMatch, ...params }) {
      const source = objects.get(from);

      if (!source) {
        throw noSuchKey();
      }

      if (CopySourceIfMatch && source.ETag !== CopySourceIfMatch) {
        throw preconditionFailed();
      }

      checkIfMatch(to, IfMatch);
      objects.set(to, { ...source, ...params, Metadata: { ...source.Metadata } });
    },

    remove: async (key) => objects.delete(key),

    async removeMany(keys) {
      keys.forEach((key) => objects.delete(key));

      return [];
    },

    async *pages(query) {
      yield folderListing(objects, query);
    },

    listOnce: async (query) => folderListing(objects, query),
    checkAccess: async () => {},
    versioning: async () => 'Enabled',
  };

  return bucket;
}
