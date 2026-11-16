import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  endWithNewline,
  readJson,
  readJsonLines,
  writeJsonAtomic,
} from '../../../src/utils/json-files.js';

let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'json-files-'));
});

const collect = async (iterable) => {
  const items = [];

  for await (const item of iterable) {
    items.push(item);
  }

  return items;
};

describe('readJson and writeJsonAtomic', () => {
  it('round-trips a value and leaves no temporary file', () => {
    const file = path.join(dir, 'job.json');

    writeJsonAtomic(file, { quality: 80 });

    expect(readJson(file)).toEqual({ quality: 80 });
    expect(fs.readdirSync(dir)).toEqual(['job.json']);
  });

  it('reads a missing or broken file as null', () => {
    fs.writeFileSync(path.join(dir, 'broken.json'), '{');

    expect(readJson(path.join(dir, 'missing.json'))).toBeNull();
    expect(readJson(path.join(dir, 'broken.json'))).toBeNull();
  });
});

describe('readJsonLines', () => {
  it('skips blank lines and a truncated last line', async () => {
    const file = path.join(dir, 'progress.jsonl');

    fs.writeFileSync(file, '{"k":"a"}\n\n{"k":"b"}\n{"k":"c');

    expect(await collect(readJsonLines(file))).toEqual([{ k: 'a' }, { k: 'b' }]);
  });

  it('yields nothing for a missing file', async () => {
    expect(await collect(readJsonLines(path.join(dir, 'none.jsonl')))).toEqual([]);
  });
});

describe('endWithNewline', () => {
  it('adds a newline only when the file does not end with one', () => {
    const file = path.join(dir, 'log.jsonl');

    fs.writeFileSync(file, '{"k":"a"}');
    endWithNewline(file);
    endWithNewline(file);

    expect(fs.readFileSync(file, 'utf8')).toBe('{"k":"a"}\n');
  });
});
