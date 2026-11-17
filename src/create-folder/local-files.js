import fs from 'node:fs';
import path from 'node:path';

function walk(root, dir, files) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(root, fullPath, files);
    } else if (entry.isFile()) {
      files.push({ abs: fullPath, rel: path.relative(root, fullPath).split(path.sep).join('/') });
    }
  }

  return files;
}

export function localFiles(input) {
  const root = path.resolve(input);

  if (!fs.existsSync(root)) {
    throw new Error(`--upload: not found: ${input}`);
  }

  return fs.statSync(root).isFile()
    ? [{ abs: root, rel: path.basename(root) }]
    : walk(root, root, []);
}
