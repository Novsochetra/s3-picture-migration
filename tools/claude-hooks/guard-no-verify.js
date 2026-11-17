import { readFileSync } from 'node:fs';
import { skipsChecks } from './commit-guard.js';

// Claude Code runs this before each Bash command (.claude/settings.json): a commit that skips
// the pre-commit check would let code that fails `npm run check` in.
const { tool_input: toolInput = {} } = JSON.parse(readFileSync(0, 'utf8'));

if (skipsChecks(toolInput.command)) {
  const hookSpecificOutput = {
    hookEventName: 'PreToolUse',
    permissionDecision: 'deny',
    permissionDecisionReason:
      'Commits must not skip the pre-commit check (--no-verify / -n). Fix what `npm run check` reports, then commit normally.',
  };

  process.stdout.write(JSON.stringify({ hookSpecificOutput }));
}
