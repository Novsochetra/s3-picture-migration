import fs from 'node:fs';

export function printUsage(usageFile) {
  console.log(fs.readFileSync(usageFile, 'utf8'));

  return 0;
}
