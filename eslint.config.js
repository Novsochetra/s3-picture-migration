import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import { localRules } from './tools/eslint-rules/index.js';

const sizeAndComplexity = {
  complexity: ['error', 10],
  'max-depth': ['error', 3],
  'max-params': ['error', 4],
  'max-nested-callbacks': ['error', 3],
  'max-lines': ['error', { max: 150, skipBlankLines: true, skipComments: true }],
  'max-lines-per-function': ['error', { max: 40, skipBlankLines: true, skipComments: true }],
  'max-classes-per-file': ['error', 1],
  'max-statements': ['error', 12],
};

const readability = {
  curly: ['error', 'all'],
  eqeqeq: ['error', 'always'],
  'id-length': ['error', { min: 2, properties: 'never', exceptions: ['x', 'y', 'i', 'j', '_'] }],
  'no-nested-ternary': 'error',
  'no-param-reassign': ['error', { props: false }],
  'no-shadow': 'error',
  'no-var': 'error',
  'no-else-return': 'error',
  'object-shorthand': 'error',
  'prefer-const': 'error',
  'prefer-template': 'error',
  'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  'no-unused-expressions': 'error',
  'no-restricted-syntax': [
    'error',
    {
      // A callback whose return value is ignored only runs `a && b()` for its effect.
      selector:
        "CallExpression[callee.property.name=/^(on|once|forEach)$/] > ArrowFunctionExpression > LogicalExpression.body[right.type='CallExpression']",
      message: 'Use an if statement, not `a && doSomething()`, to run code on a condition.',
    },
  ],
  'no-restricted-properties': [
    'error',
    {
      object: 'process',
      property: 'exit',
      message: 'Return an exit code; only bin/ and interactive prompts exit the process.',
    },
  ],
};

const comments = {
  'no-warning-comments': [
    'error',
    { terms: ['todo', 'fixme', 'xxx', 'hack'], location: 'anywhere' },
  ],
  'local/no-jsdoc-blocks': 'error',
  'local/no-banner-comments': 'error',
};

export default [
  // .claude/ holds Claude Code's own worktrees, copies of this repo it lints on its own
  { ignores: ['node_modules/', 'coverage/', 's3-webp-jobs/', '.claude/'] },
  js.configs.recommended,
  prettier,
  {
    plugins: { local: localRules },
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node },
    rules: { ...sizeAndComplexity, ...readability, ...comments },
  },
  {
    files: ['bin/**/*.js', 'src/cli/prompter.js', 'src/convert/run/stop-signals.js'],
    rules: { 'no-restricted-properties': 'off' },
  },
  {
    files: ['test/**/*.js'],
    rules: {
      'max-lines-per-function': 'off',
      'max-statements': 'off',
      'max-lines': ['error', { max: 250, skipBlankLines: true, skipComments: true }],
      'max-nested-callbacks': ['error', 4],
    },
  },
];
