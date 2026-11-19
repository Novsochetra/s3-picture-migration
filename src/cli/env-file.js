import path from 'node:path';

const ENV_FILE_FLAGS = ['--env-file', '--env-file-if-exists'];
const PROD_FILE = /^\.env\.prod(uction)?$/;

export function envFilesOf(execArgv) {
  return execArgv.flatMap((arg, i) => {
    const [flag, inlineValue] = arg.split(/=(.*)/s);

    if (!ENV_FILE_FLAGS.includes(flag)) {
      return [];
    }

    const value = inlineValue ?? execArgv[i + 1];

    return value ? [value] : [];
  });
}

export function prodNoticeFor(execArgv) {
  const prodFile = envFilesOf(execArgv).find((file) => PROD_FILE.test(path.basename(file)));

  return prodFile ? `INFO  PRODUCTION: keys from ${prodFile}, every change goes to prod.\n` : null;
}
