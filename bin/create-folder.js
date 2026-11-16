#!/usr/bin/env node
import { runCreateFolder } from '../src/create-folder/main.js';
import { explainError } from '../src/s3/errors.js';

try {
  process.exitCode = await runCreateFolder(process.argv.slice(2));
} catch (error) {
  console.error(`Error: ${explainError(error)}`);
  // An open prompt would keep the process alive.
  process.exit(1);
}
