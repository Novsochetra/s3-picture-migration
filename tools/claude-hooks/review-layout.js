import { readFileSync } from 'node:fs';
import path from 'node:path';
import { isLaidOut, layoutProblems } from './layout/function-layout.js';

// Claude Code runs this after each edit (.claude/settings.json) and shows Claude what it prints,
// so the layout rules in CLAUDE.md are checked at the moment the code is written.
const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

function reviewRequest(file, problems) {
  const listed = problems.map(({ line, message }) => `  ${file}:${line}  ${message}`);

  return [
    `${file} breaks CLAUDE.md's "Function layout":`,
    ...listed,
    'Fix each one now by reordering and grouping lines; change nothing else.',
  ].join('\n');
}

function review({ tool_input: toolInput = {} }) {
  const file = path.relative(root, path.resolve(root, toolInput.file_path ?? ''));

  if (!isLaidOut(file)) {
    return null;
  }

  const problems = layoutProblems(readFileSync(path.join(root, file), 'utf8'), file);

  return problems.length ? reviewRequest(file, problems) : null;
}

const request = review(JSON.parse(readFileSync(0, 'utf8')));

if (request) {
  const hookSpecificOutput = { hookEventName: 'PostToolUse', additionalContext: request };

  process.stdout.write(JSON.stringify({ hookSpecificOutput }));
}
