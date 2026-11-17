import { describe, expect, it } from 'vitest';
import { skipsChecks } from '../../../../tools/claude-hooks/commit-guard.js';

const skipFlag = ['--no', 'verify'].join('-');

describe('skipsChecks', () => {
  it('catches a commit or push that skips the hooks', () => {
    expect(skipsChecks(`git commit ${skipFlag} -m "wip"`)).toBe(true);
    expect(skipsChecks('git add -A && git commit -n -m "wip"')).toBe(true);
    expect(skipsChecks(`git push ${skipFlag} origin main`)).toBe(true);
  });

  it('lets normal commits and other commands through', () => {
    expect(skipsChecks('git commit -m "wip"')).toBe(false);
    expect(skipsChecks('git commit -m "explain why -n is banned"')).toBe(false);
    expect(skipsChecks(`git commit -m 'no ${skipFlag} here'`)).toBe(false);
    expect(skipsChecks('sed -n 1,5p file.js && git commit -m "x"')).toBe(false);
    expect(skipsChecks(undefined)).toBe(false);
  });
});
