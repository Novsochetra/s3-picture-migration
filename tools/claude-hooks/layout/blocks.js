// A block is a run of statements with no blank line between them (CLAUDE.md, "Function layout").
export function hasBlankLineBetween(sourceCode, previous, next) {
  const firstLine = previous.loc.end.line + 1;
  const lastLine = next.loc.start.line - 1;

  for (let line = firstLine; line <= lastLine; line++) {
    if (sourceCode.lines[line - 1].trim() === '') {
      return true;
    }
  }

  return false;
}

export function blockIdsOf(sourceCode, statements) {
  let blockId = 0;

  return statements.map((statement, i) => {
    if (i > 0 && hasBlankLineBetween(sourceCode, statements[i - 1], statement)) {
      blockId++;
    }

    return blockId;
  });
}
