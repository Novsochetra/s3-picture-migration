import { describe, expect, it } from 'vitest';
import { envFilesOf, prodNoticeFor } from '../../../src/cli/env-file.js';

describe('envFilesOf', () => {
  it('reads --env-file and --env-file-if-exists, with = or as the next argument', () => {
    const execArgv = ['--env-file=.env', '--env-file-if-exists', 'local/.env.prod', '--inspect'];

    expect(envFilesOf(execArgv)).toEqual(['.env', 'local/.env.prod']);
  });

  it('finds nothing when node was started without an env file', () => {
    expect(envFilesOf([])).toEqual([]);
    expect(envFilesOf(['--env-file'])).toEqual([]);
  });
});

describe('prodNoticeFor', () => {
  it('names the prod env file', () => {
    expect(prodNoticeFor(['--env-file=.env.prod'])).toMatch(/INFO {2}PRODUCTION: .*\.env\.prod/);
    expect(prodNoticeFor(['--env-file', 'config/.env.production'])).toMatch(/PRODUCTION/);
  });

  it('says nothing for other env files', () => {
    expect(prodNoticeFor(['--env-file=.env'])).toBeNull();
    expect(prodNoticeFor(['--env-file=.env.prod.example'])).toBeNull();
    expect(prodNoticeFor([])).toBeNull();
  });
});
