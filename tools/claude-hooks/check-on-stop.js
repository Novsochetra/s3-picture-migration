import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Claude Code runs this when Claude is about to finish (.claude/settings.json). While files are
// changed, it runs `npm run check` and sends Claude back to fix what fails before finishing.
const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const OUTPUT_LINES = 40;

const { stop_hook_active: alreadyBlocked } = JSON.parse(readFileSync(0, 'utf8'));
const changes = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });

// A second stop in a row is let through, so a check that cannot pass never traps Claude.
if (!alreadyBlocked && changes.trim()) {
  const check = spawnSync('npm', ['run', 'check'], { cwd: root, encoding: 'utf8' });

  if (check.status !== 0) {
    const output = `${check.stdout}${check.stderr}`.trim().split('\n').slice(-OUTPUT_LINES);
    const reason = [
      '`npm run check` fails on the changed files. Fix it before finishing:',
      ...output,
    ];

    process.stdout.write(JSON.stringify({ decision: 'block', reason: reason.join('\n') }));
  }
}
