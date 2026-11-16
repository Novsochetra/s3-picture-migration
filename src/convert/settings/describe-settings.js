function describeMode(settings) {
  if (settings.backupSuffix) {
    return (
      `replace in place, original backed up as <name>${settings.backupSuffix}.<ext> ` +
      '(--replace)'
    );
  }

  return settings.keepExt ? 'overwrite in place (--keep-ext)' : 'write .webp next to original';
}

const describeSizes = (sizes) =>
  sizes?.length ? sizes.map((width) => `${width}w`).join(',') : 'none';

export function describeSettings(settings, extensions) {
  const parts = [
    `quality ${settings.quality}`,
    `max-width ${settings.maxWidth ?? 'none'}`,
    `sizes ${describeSizes(settings.sizes)}`,
    describeMode(settings),
    settings.deleteOriginal ? 'DELETE originals' : 'keep originals',
    settings.allowLarger ? 'upload even if larger' : 'skip if larger',
    ...(settings.acl ? [`acl ${settings.acl}`] : []),
    `ext ${[...extensions].join(',')}`,
  ];

  return parts.join(' · ');
}
