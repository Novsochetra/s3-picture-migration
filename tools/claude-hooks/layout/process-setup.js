const LISTEN = new Set(['on', 'once', 'addListener', 'prependListener']);
const STREAMS = new Set(['stdout', 'stderr', 'stdin']);

const isProcess = (node) => node?.type === 'Identifier' && node.name === 'process';

function isProcessSetup(callee) {
  if (callee.type !== 'MemberExpression') {
    return false;
  }

  const method = callee.property.name;

  if (isProcess(callee.object)) {
    return LISTEN.has(method) || method === 'exit';
  }

  const isStream =
    callee.object.type === 'MemberExpression' &&
    isProcess(callee.object.object) &&
    STREAMS.has(callee.object.property.name);

  return isStream && LISTEN.has(method);
}

export const processSetup = {
  meta: {
    type: 'problem',
    messages: {
      setup:
        'Process-wide setup (signal or stream handlers, exiting) belongs in the CLI entry file in bin/, not here.',
    },
    schema: [],
  },
  create: (context) => ({
    CallExpression(call) {
      if (isProcessSetup(call.callee)) {
        context.report({ node: call, messageId: 'setup' });
      }
    },
  }),
};
