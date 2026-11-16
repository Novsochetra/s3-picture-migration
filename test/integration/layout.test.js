import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '../..');
const IMPORT = /^import\s[^'"]*['"]([^'"]+)['"]/gm;

// Which top-level folders of src/ each one may import, besides itself (see CLAUDE.md).
const ALLOWED = {
  utils: [],
  logging: [],
  cli: ['utils'],
  s3: ['utils'],
  convert: ['utils', 'logging', 'cli', 's3'],
  'create-folder': ['utils', 'cli', 's3'],
};

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return sourceFiles(fullPath);
    }

    return entry.name.endsWith('.js') ? [fullPath] : [];
  });
}

const srcFolderOf = (file) => path.relative(path.join(ROOT, 'src'), file).split(path.sep)[0];

function localImports(file) {
  const text = fs.readFileSync(file, 'utf8');

  return [...text.matchAll(IMPORT)]
    .map((match) => match[1])
    .filter((specifier) => specifier.startsWith('.'))
    .map((specifier) => path.resolve(path.dirname(file), specifier));
}

describe('the layout of src/', () => {
  const files = sourceFiles(path.join(ROOT, 'src'));

  it('has only the folders CLAUDE.md names', () => {
    const folders = new Set(files.map(srcFolderOf));

    expect([...folders].sort()).toEqual(Object.keys(ALLOWED).sort());
  });

  it.each(files.map((file) => [path.relative(ROOT, file), file]))(
    '%s imports only what its folder may use',
    (_name, file) => {
      const own = srcFolderOf(file);
      const allowed = new Set([own, ...ALLOWED[own]]);
      const outside = localImports(file).filter((target) => !allowed.has(srcFolderOf(target)));

      expect(outside.map((target) => path.relative(ROOT, target))).toEqual([]);
    },
  );
});

describe('bin/', () => {
  it('only starts a tool: each entry imports its main.js and nothing of the other tool', () => {
    const entries = sourceFiles(path.join(ROOT, 'bin'));

    for (const entry of entries) {
      const tools = localImports(entry)
        .map((target) => path.relative(path.join(ROOT, 'src'), target))
        .filter((target) => target.endsWith('main.js'));

      expect(tools).toHaveLength(1);
    }
  });
});
