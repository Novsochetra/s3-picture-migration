import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../../../src/convert/settings/defaults.js';
import { describeSettings } from '../../../../src/convert/settings/describe-settings.js';

describe('describeSettings', () => {
  it('describes the default run', () => {
    expect(describeSettings(DEFAULT_SETTINGS, new Set(['jpg', 'png']))).toBe(
      'quality 80 · max-width none · sizes none · write .webp next to original · ' +
        'keep originals · skip if larger · ext jpg,png',
    );
  });

  it('describes --replace with sizes and an ACL', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      keepExt: true,
      backupSuffix: '-original',
      sizes: [320, 640],
      acl: 'public-read',
    };

    expect(describeSettings(settings, new Set(['jpg']))).toBe(
      'quality 80 · max-width none · sizes 320w,640w · ' +
        'replace in place, original backed up as <name>-original.<ext> (--replace) · ' +
        'keep originals · skip if larger · acl public-read · ext jpg',
    );
  });
});
