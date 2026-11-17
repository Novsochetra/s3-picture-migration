import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { isLaidOut, layoutProblems } from './layout/function-layout.js';

const files = execFileSync('git', ['ls-files', 'src', 'bin'], { encoding: 'utf8' })
  .split('\n')
  .filter(isLaidOut);
const problems = files.flatMap((file) =>
  layoutProblems(readFileSync(file, 'utf8'), file).map(
    ({ line, message }) => `${file}:${line}  ${message}`,
  ),
);

console.log(problems.join('\n') || 'No layout problems.');
process.exitCode = problems.length ? 1 : 0;
