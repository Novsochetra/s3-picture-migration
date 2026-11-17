#!/usr/bin/env node
import { runConvert } from '../src/convert/main.js';
import { createLogger } from '../src/logging/logger.js';
import { explainError } from '../src/s3/errors.js';

const argv = process.argv.slice(2);
const log = createLogger();

// Piped into `head`, the pipe closes early: --ls stops quietly. A conversion keeps going, so it
// finishes its uploads and reports its own exit code.
if (argv.includes('--ls')) {
  process.stdout.on('error', (error) => {
    if (error.code === 'EPIPE') {
      process.exit(0);
    }
  });
}

try {
  process.exitCode = await runConvert(argv, { log });
} catch (error) {
  log.error(`Error: ${explainError(error)}`);
  // An open prompt would keep the process alive.
  process.exit(1);
}
