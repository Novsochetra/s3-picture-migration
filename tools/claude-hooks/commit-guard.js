const QUOTED = /"(?:\\.|[^"\\])*"|'[^']*'/g;
const SEGMENT_SEPARATOR = /&&|\|\||[;|\n]/;
const GIT_COMMIT_OR_PUSH = /^\s*git\b.*\b(commit|push)\b/;
const SKIPS_HOOKS = /(^|\s)(--no-verify|-n)(\s|$)/;

// `git commit --no-verify` (or -n) skips the pre-commit `npm run check`. Quoted text, such as a
// commit message, is left out, so a message that mentions -n is not a flag.
export const skipsChecks = (command = '') =>
  command
    .replace(QUOTED, '""')
    .split(SEGMENT_SEPARATOR)
    .some((segment) => GIT_COMMIT_OR_PUSH.test(segment) && SKIPS_HOOKS.test(segment));
