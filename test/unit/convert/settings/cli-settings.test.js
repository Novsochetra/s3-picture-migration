import { describe, expect, it } from 'vitest';
import { parseConvertArgs } from '../../../../src/convert/options.js';
import { cliSettings, parseSizes } from '../../../../src/convert/settings/cli-settings.js';

const settingsOf = (...argv) => cliSettings(parseConvertArgs(argv));

describe('cliSettings', () => {
  it('holds only the settings the user passed', () => {
    expect(settingsOf()).toEqual({});
    expect(settingsOf('--quality', '70', '--overwrite')).toEqual({ quality: 70, overwrite: true });
  });

  it('turns --replace into keep-ext with the default backup suffix', () => {
    expect(settingsOf('--replace')).toEqual({ keepExt: true, backupSuffix: '-original' });
    expect(settingsOf('--replace', '--backup-suffix', '.bak')).toEqual({
      keepExt: true,
      backupSuffix: '.bak',
    });
  });

  it('refuses a backup suffix without --replace, or with unsafe characters', () => {
    expect(() => settingsOf('--backup-suffix=-old')).toThrow(/only works together/);
    expect(() => settingsOf('--replace', '--backup-suffix', 'a/b')).toThrow(/may only contain/);
  });

  it('keeps --ext and --acl as written', () => {
    expect(settingsOf('--ext', 'png', '--acl', 'public-read')).toEqual({
      ext: 'png',
      acl: 'public-read',
    });
  });
});

describe('parseSizes', () => {
  it('sorts, removes duplicates and accepts a trailing w', () => {
    expect(parseSizes('1080, 320w,640,320')).toEqual([320, 640, 1080]);
  });

  it('switches sizes off with none, off or 0', () => {
    expect(parseSizes('none')).toBeNull();
    expect(parseSizes('0')).toBeNull();
  });

  it('refuses widths the WebP format cannot hold', () => {
    expect(() => parseSizes('320,20000')).toThrow(/between 1 and 16383/);
    expect(() => parseSizes(',')).toThrow();
  });
});
