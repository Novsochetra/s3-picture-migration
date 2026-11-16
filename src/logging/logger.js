import fs from 'node:fs';

const timestamp = () => new Date().toISOString();

export function createLogger(output = console) {
  let fd = null;

  const toFile = (level, message) => {
    if (fd !== null) {
      fs.writeSync(fd, `${timestamp()} ${level.padEnd(5)} ${message}\n`);
    }
  };

  const write = (level, message) => {
    (level === 'INFO' ? output.log : output.error)(message);
    toFile(level, message);
  };

  return {
    attach(file) {
      fd = fs.openSync(file, 'a');
    },

    info: (message) => write('INFO', message),
    warn: (message) => write('WARN', message),
    error: (message) => write('ERROR', message),
    fileOnly: toFile,
  };
}
