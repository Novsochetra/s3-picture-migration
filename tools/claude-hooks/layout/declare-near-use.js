import { blockIdsOf } from './blocks.js';

// `const { args, log } = context;` unpacks a function's inputs for the whole body, as in
// CLAUDE.md's lsCommand example, so it may sit in a block of its own.
const unpacksInput = (statement) =>
  statement.declarations.every(
    (declarator) =>
      declarator.id.type === 'ObjectPattern' &&
      ['Identifier', 'MemberExpression'].includes(declarator.init?.type),
  );

const isCheckedDeclaration = (statement) =>
  statement.type === 'VariableDeclaration' && !unpacksInput(statement);

const RELEASES = new Set(['remove', 'close', 'abort', 'off', 'destroy']);

// A handle kept only to undo what its declaration started (a timer, listeners) is used at the
// end by nature, so it stays with the setup that made it.
function onlyReleases(identifier) {
  const { parent } = identifier;
  const clears =
    parent.type === 'CallExpression' &&
    ['clearInterval', 'clearTimeout'].includes(parent.callee.name);
  const releases =
    parent.type === 'MemberExpression' &&
    parent.object === identifier &&
    RELEASES.has(parent.property.name);

  return clears || releases;
}

function isHandle(sourceCode, statement) {
  const later = sourceCode
    .getDeclaredVariables(statement)
    .flatMap((variable) => variable.references)
    .filter((reference) => reference.identifier.range[0] >= statement.range[1]);

  return later.length > 0 && later.every((reference) => onlyReleases(reference.identifier));
}

// For each statement, the indexes of the statements that use what it declares.
function usersOf(sourceCode, statements) {
  const indexOf = (position) =>
    statements.findIndex(
      (statement) => statement.range[0] <= position && position < statement.range[1],
    );

  // Unpacking the inputs relates to everything, so it relates nothing.
  return statements.map((statement, i) => {
    if (!isCheckedDeclaration(statement)) {
      return [];
    }

    const positions = sourceCode
      .getDeclaredVariables(statement)
      .flatMap((variable) => variable.references)
      .map((reference) => reference.identifier.range[0]);

    return [...new Set(positions.map(indexOf))].filter((user) => user !== i);
  });
}

function blockFacts(sourceCode, statements) {
  const blockIds = blockIdsOf(sourceCode, statements);
  const users = usersOf(sourceCode, statements);
  const sameBlock = (i, j) => j >= 0 && blockIds[i] === blockIds[j];
  const related = (i) =>
    users[i].some((j) => sameBlock(i, j)) ||
    users.some((list, j) => j !== i && sameBlock(i, j) && list.includes(i));

  return { blockIds, users, related, sourceCode };
}

// A declaration unrelated to the rest of its block rides along in a step that is not its own:
// in a block whose other lines work together, or two or more blocks before its first use.
function isPassenger({ blockIds, users, related, sourceCode }, statements, i) {
  const firstUse = Math.min(...users[i].filter((j) => j > i));
  const checked = isCheckedDeclaration(statements[i]) && !isHandle(sourceCode, statements[i]);

  if (!checked || related(i) || !Number.isFinite(firstUse)) {
    return false;
  }

  // A line between two related lines of its block is in the middle of that step.
  const relatedMates = statements
    .map((_, j) => j)
    .filter((j) => blockIds[j] === blockIds[i] && related(j));
  const insideStep = relatedMates.some((j) => j < i) && relatedMates.some((j) => j > i);

  return !insideStep && (relatedMates.length > 0 || blockIds[firstUse] - blockIds[i] >= 2);
}

function checkBlock(context, block) {
  const statements = block.body;
  const facts = blockFacts(context.sourceCode, statements);

  statements.forEach((statement, i) => {
    if (isPassenger(facts, statements, i)) {
      const names = context.sourceCode
        .getDeclaredVariables(statement)
        .map((variable) => variable.name);

      context.report({ node: statement, messageId: 'far', data: { names: names.join(', ') } });
    }
  });
}

export const declareNearUse = {
  meta: {
    type: 'suggestion',
    messages: {
      far: '`{{names}}` has nothing to do with the rest of its block: declare it in the block where it is first used.',
    },
    schema: [],
  },
  create: (context) => ({ BlockStatement: (block) => checkBlock(context, block) }),
};
