import { DEFAULT_SETTINGS } from './defaults.js';

function warnChangedSettings({ saved, passed, log }) {
  for (const [name, value] of Object.entries(passed)) {
    const before = JSON.stringify(saved[name]);
    const after = JSON.stringify(value);

    if (name in saved && before !== after) {
      log.warn(
        `Setting "${name}" changed from ${before} to ${after} — ` +
          'images converted earlier keep the old setting.',
      );
    }
  }
}

export function resolveSettings({ saved, passed, resuming, log }) {
  if (resuming) {
    warnChangedSettings({ saved, passed, log });
  }

  const settings = { ...DEFAULT_SETTINGS, ...saved, ...passed };

  if (settings.backupSuffix && settings.deleteOriginal) {
    throw new Error(
      '--replace and --delete-original cannot be combined (the backup IS the original).',
    );
  }

  return settings;
}

export const sourceExtensions = (settings) =>
  new Set(
    settings.ext
      .split(',')
      .map((extension) => extension.trim().toLowerCase().replace(/^\./, ''))
      .filter(Boolean),
  );
