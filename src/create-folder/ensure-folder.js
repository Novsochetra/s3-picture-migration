export async function ensureFolder({ bucket, folder, existing }) {
  if (existing.has(folder)) {
    console.log(`Folder exists: s3://${bucket.name}/${folder}`);

    return;
  }

  await bucket.put(folder, { Body: '', ContentLength: 0 });
  existing.set(folder, 0);
  console.log(`Created folder: s3://${bucket.name}/${folder}`);
}
