export function captureLog() {
  const lines = [];
  const add = (level) => (message) => lines.push(`${level} ${message}`);

  return {
    lines,
    text: () => lines.join('\n'),
    attach: () => {},
    info: add('INFO'),
    warn: add('WARN'),
    error: add('ERROR'),
    fileOnly: (level, message) => lines.push(`FILE ${level} ${message}`),
  };
}
