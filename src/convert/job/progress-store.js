import fs from 'node:fs';
import { endWithNewline, readJsonLines } from '../../utils/json-files.js';

const FINAL_STATUSES = new Set(['done', 'skipped']);

export const isFinished = (status, retryFailed) =>
  FINAL_STATUSES.has(status) || (status === 'invalid' && !retryFailed);

const valueOrNothing = (value) => value ?? undefined;

function resultFields(key, result) {
  const hasSizes = Boolean(result.sizes?.length);

  return {
    why: result.reason || undefined,
    to: result.to && result.to !== key ? result.to : undefined,
    bak: result.backup || undefined,
    sizes: hasSizes ? result.sizes : undefined,
    vout: hasSizes ? result.sizeBytes : undefined,
  };
}

// The short field names keep a line small: a job can hold millions of them. Earlier runs
// wrote these names, so they never change.
export function progressEntry(key, result, ms) {
  return {
    t: new Date().toISOString(),
    k: key,
    st: result.status,
    ...resultFields(key, result),
    in: valueOrNothing(result.bytesIn),
    out: valueOrNothing(result.bytesOut),
    err: result.error || undefined,
    tries: result.attempts > 1 ? result.attempts : undefined,
    ms,
  };
}

const latestState = (status, error) => (error ? { status, error } : { status });

// Append-only and written synchronously, so a crash loses only the images still in flight.
export class ProgressStore {
  constructor(file) {
    this.file = file;
    this.entries = new Map();
    this.fd = null;
  }

  async load() {
    for await (const entry of readJsonLines(this.file)) {
      if (entry.k) {
        this.entries.set(entry.k, latestState(entry.st, entry.err));
      }
    }
  }

  open() {
    endWithNewline(this.file);
    this.fd = fs.openSync(this.file, 'a');
  }

  close() {
    if (this.fd !== null) {
      fs.closeSync(this.fd);
      this.fd = null;
    }
  }

  record(key, result, ms) {
    fs.writeSync(this.fd, `${JSON.stringify(progressEntry(key, result, ms))}\n`);
    this.entries.set(key, latestState(result.status, result.error));
  }

  status(key) {
    return this.entries.get(key)?.status;
  }

  problems() {
    return [...this.entries]
      .filter(([, entry]) => entry.status === 'failed' || entry.status === 'invalid')
      .map(([key, entry]) => `${entry.status}\t${key}\t${entry.error ?? ''}`);
  }
}
