import readline from 'node:readline';

export function createPrompter() {
  const interactive = Boolean(process.stdin.isTTY);
  const lines = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: interactive,
  });

  lines.on('SIGINT', () => {
    console.log();
    process.exit(130);
  });

  const answers = lines[Symbol.asyncIterator]();

  return {
    async ask(question) {
      lines.setPrompt(question);
      lines.prompt();

      const { value, done } = await answers.next();

      if (done) {
        throw new Error('No input (stdin closed).');
      }

      // Piped answers are not echoed by the terminal, so the transcript would lose them.
      if (!interactive) {
        process.stdout.write(`${value}\n`);
      }

      return value.trim();
    },

    close: () => lines.close(),
  };
}

export const saysYes = (answer) => /^y(es)?$/i.test(answer);
