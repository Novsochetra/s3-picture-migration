import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../../../src/convert/settings/defaults.js';
import {
  resolveSettings,
  sourceExtensions,
} from '../../../../src/convert/settings/resolve-settings.js';
import { captureLog } from '../../../support/capture-log.js';

describe('resolveSettings', () => {
  it('lays the passed flags over the saved settings over the defaults', () => {
    const log = captureLog();
    const settings = resolveSettings({
      saved: { quality: 60, sizes: [320] },
      passed: { quality: 90 },
      resuming: false,
      log,
    });

    expect(settings).toEqual({ ...DEFAULT_SETTINGS, quality: 90, sizes: [320] });
    expect(log.lines).toEqual([]);
  });

  it('warns when a resumed job changes a saved setting', () => {
    const log = captureLog();

    resolveSettings({ saved: { quality: 60 }, passed: { quality: 90 }, resuming: true, log });

    expect(log.text()).toMatch(/Setting "quality" changed from 60 to 90/);
  });

  it('refuses --replace together with --delete-original', () => {
    const passed = { backupSuffix: '-original', deleteOriginal: true };

    expect(() =>
      resolveSettings({ saved: {}, passed, resuming: false, log: captureLog() }),
    ).toThrow(/cannot be combined/);
  });
});

describe('sourceExtensions', () => {
  it('reads a loose list of extensions', () => {
    expect([...sourceExtensions({ ext: ' JPG, .png,,tif ' })]).toEqual(['jpg', 'png', 'tif']);
  });
});
