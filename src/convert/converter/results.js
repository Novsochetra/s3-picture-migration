export const SOURCE_GONE = { status: 'skipped', reason: 'source no longer exists' };

export const keptOriginal = (uploaded) => ({
  status: 'skipped',
  reason: 'webp would be larger; original kept',
  bytesIn: uploaded.bytesIn,
  sizes: uploaded.sizes,
  sizeBytes: uploaded.sizeBytes,
});

export const converted = (uploaded, written) => ({
  status: 'done',
  ...written,
  bytesIn: uploaded.bytesIn,
  bytesOut: uploaded.bytesOut,
  sizes: uploaded.sizes,
  sizeBytes: uploaded.sizeBytes,
});
