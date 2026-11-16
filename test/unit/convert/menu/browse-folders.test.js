import { describe, expect, it } from 'vitest';
import { nextStep } from '../../../../src/convert/menu/browse-folders.js';

const here = { prefix: 'raw/2024/', folders: ['raw/2024/jan/', 'raw/2024/feb/'] };

describe('nextStep', () => {
  it('uses the current folder on Enter or .', () => {
    expect(nextStep('', here)).toEqual({ use: 'raw/2024/' });
    expect(nextStep('.', here)).toEqual({ use: 'raw/2024/' });
  });

  it('opens a numbered folder, the parent, or a typed path', () => {
    expect(nextStep('2', here)).toEqual({ open: 'raw/2024/feb/' });
    expect(nextStep('..', here)).toEqual({ open: 'raw/' });
    expect(nextStep('..', { prefix: 'raw/', folders: [] })).toEqual({ open: '' });
    expect(nextStep('/other/path', here)).toEqual({ open: 'other/path/' });
  });

  it('quits on q and ignores anything else', () => {
    expect(nextStep('q', here)).toEqual({ quit: true });
    expect(nextStep('9', here)).toEqual({});
    expect(nextStep('hello', here)).toEqual({});
  });
});
