#!/usr/bin/env node
import { runConvert } from '../src/convert/main.js';
import { createLogger } from '../src/logging/logger.js';
import { explainError } from '../src/s3/errors.js';

const log = createLogger();

// Piped into `head`, the pipe closes before the output ends: stop quietly.
process.stdout.on('error', (error) => {
  if (error.code !== 'EPIPE') {
    throw error;
  }

  process.exit(0);
});

try {
  process.exitCode = await runConvert(process.argv.slice(2), { log });
} catch (error) {
  log.error(`Error: ${explainError(error)}`);
  // An open prompt would keep the process alive.
  process.exit(1);
}
