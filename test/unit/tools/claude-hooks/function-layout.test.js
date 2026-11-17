import { describe, expect, it } from 'vitest';
import { layoutProblems } from '../../../../tools/claude-hooks/layout/function-layout.js';

const KINDS = [
  ['far', 'has nothing to do with the rest of its block'],
  ['after block', 'after a block that closes'],
  ['before return', 'before the final `return`'],
  ['process setup', 'Process-wide setup'],
];

const kindOf = (message) => KINDS.find(([, text]) => message.includes(text))[0];

const problemsOf = (code, file = 'src/convert/commands/ls.js') =>
  layoutProblems(code, file).map(({ line, message }) => `${line}: ${kindOf(message)}`);

describe('declared far from use', () => {
  it('flags a declaration riding in a block that does something else', () => {
    const code = `
export async function lsCommand(context) {
  const { args, connect } = context;
  const target = await pickTarget(context);
  const { bucket } = await connect(target.name);
  const prefix = normalizePrefix(args.prefix);

  console.log(bucket.name);

  console.log(prefix);
}
`;

    expect(problemsOf(code)).toEqual(['6: far']);
  });

  it('accepts the layout of the CLAUDE.md example', () => {
    const code = `
export async function lsCommand(context) {
  const { args, connection, connect } = context;

  const target = await pickTarget(context);
  const { bucket } = await connect(target.name, { connection });

  const prefix = normalizePrefix(args.prefix);
  const totals = { files: 0 };

  console.log(bucket.name, prefix);
  for (const page of bucket.pages({ prefix })) {
    totals.files += page.length;
  }

  return totals;
}
`;

    expect(problemsOf(code)).toEqual([]);
  });

  it('flags a lone declaration with an unrelated block before its first use', () => {
    const code = `
function tally(items) {
  const first = items[0];

  report(items);

  return first;
}
`;

    expect(problemsOf(code)).toEqual(['3: far']);
  });

  it('keeps a handle that is only released at the end, and a line inside a step', () => {
    const code = `
async function run(work) {
  const ticker = setInterval(tick, 1000);

  const started = Date.now();
  const result = await work();
  const ms = Date.now() - started;

  report(result, ms);

  clearInterval(ticker);
}
`;

    expect(problemsOf(code)).toEqual([]);
  });
});

describe('blank lines', () => {
  it('asks for a blank line after a closing brace and before the final return', () => {
    const code = `
function pick(items) {
  if (!items.length) {
    return null;
  }
  const first = items[0];
  return first;
}
`;

    expect(problemsOf(code)).toEqual(['6: after block', '7: before return']);
  });
});

describe('process-wide setup', () => {
  const code = `
export function lsCommand() {
  process.stdout.on('error', handle);
}
`;

  it('belongs in bin/', () => {
    expect(problemsOf(code)).toEqual(['3: process setup']);
    expect(problemsOf(code, 'bin/s3-to-webp.js')).toEqual([]);
  });
});
