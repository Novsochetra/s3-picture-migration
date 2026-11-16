export async function listSizes(bucket, prefix) {
  const sizes = new Map();

  for await (const page of bucket.pages({ prefix })) {
    for (const object of page.Contents ?? []) {
      sizes.set(object.Key, object.Size ?? 0);
    }
  }

  return sizes;
}

export const isAlreadyThere = ({ args, existing }, key, size) =>
  !args.overwrite && existing.get(key) === size;
