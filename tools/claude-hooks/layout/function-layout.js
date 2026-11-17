import { Linter } from 'eslint';
import { blankLines } from './blank-lines.js';
import { declareNearUse } from './declare-near-use.js';
import { processSetup } from './process-setup.js';

// Interactive prompts exit when the user quits (Ctrl+C in the prompter, q in the folder menu),
// and a run's own Ctrl+C handler needs the run's state to let the images in flight finish.
const PROCESS_SETUP_ALLOWED = [
  'src/cli/prompter.js',
  'src/convert/menu/browse-folders.js',
  'src/convert/run/stop-signals.js',
];

export const isLaidOut = (file) => /^(src|bin)\/.*\.js$/.test(file);

const layoutPlugin = {
  rules: {
    'declare-near-use': declareNearUse,
    'blank-lines': blankLines,
    'process-setup': processSetup,
  },
};

function rulesFor(file) {
  const setupAllowed = file.startsWith('bin/') || PROCESS_SETUP_ALLOWED.includes(file);

  return {
    'layout/declare-near-use': 'error',
    'layout/blank-lines': 'error',
    ...(setupAllowed ? {} : { 'layout/process-setup': 'error' }),
  };
}

// file is relative to the repo root; returns [{ line, message }].
export function layoutProblems(code, file) {
  const config = {
    files: ['**/*.js'],
    plugins: { layout: layoutPlugin },
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    rules: rulesFor(file),
  };
  const messages = new Linter().verify(code, [config], { filename: file });

  const unique = new Map(
    messages.map(({ line, message }) => [`${line} ${message}`, { line, message }]),
  );

  return [...unique.values()];
}
