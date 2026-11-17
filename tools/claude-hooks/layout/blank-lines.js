import { hasBlankLineBetween } from './blocks.js';

const ENDS_WITH_BRACE = new Set([
  'IfStatement',
  'ForStatement',
  'ForOfStatement',
  'ForInStatement',
  'WhileStatement',
  'TryStatement',
  'SwitchStatement',
  'BlockStatement',
]);

function checkBlock(context, block) {
  const statements = block.body;

  statements.forEach((statement, i) => {
    const next = statements[i + 1];
    const touchesNext = next && !hasBlankLineBetween(context.sourceCode, statement, next);

    if (touchesNext && ENDS_WITH_BRACE.has(statement.type)) {
      context.report({ node: next, messageId: 'afterBlock' });
    } else if (touchesNext && next.type === 'ReturnStatement' && i + 1 === statements.length - 1) {
      context.report({ node: next, messageId: 'beforeReturn' });
    }
  });
}

export const blankLines = {
  meta: {
    type: 'layout',
    messages: {
      afterBlock: 'Put a blank line after a block that closes with `}` when more code follows.',
      beforeReturn: 'Put a blank line before the final `return`.',
    },
    schema: [],
  },
  create: (context) => ({ BlockStatement: (block) => checkBlock(context, block) }),
};
