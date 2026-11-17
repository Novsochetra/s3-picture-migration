import sharp from 'sharp';
import { readJsonLines } from '../../utils/json-files.js';
import { createConverter } from '../converter/create-converter.js';
import { isFinished } from '../job/progress-store.js';
import { recordResult } from './record-result.js';
import { statusLine } from './status-line.js';
import { installStopSignals } from './stop-signals.js';

const STATUS_EVERY_MS = 30_000;

const newRun = ({ progress, counts }) => ({
  progress,
  counts,
  state: {
    stopping: false,
    hardStop: false,
    signalled: false,
    active: new Set(),
    consecutiveFailures: 0,
  },
  stats: {
    ok: 0,
    sized: 0,
    skipped: 0,
    failed: 0,
    invalid: 0,
    bytesIn: 0,
    bytesOut: 0,
    sizeBytes: 0,
    processedBytes: 0,
    started: Date.now(),
  },
});

async function* pendingItems({ jobFiles, limits }, run) {
  for await (const { k: key, s: size } of readJsonLines(jobFiles.paths.manifest)) {
    if (run.state.stopping) {
      return;
    }

    if (!isFinished(run.progress.status(key), limits.retryFailed)) {
      yield { key, size };
    }
  }
}

async function work(session, run, { source, convert }) {
  for await (const item of source) {
    const started = Date.now();
    const result = await convert(item);
    const ms = Date.now() - started;

    // Not recorded, so the image is redone on resume.
    if (result.st === 'aborted' || run.state.hardStop) {
      return;
    }

    recordResult(session, run, { item, result, ms });
  }
}

function converterFor({ bucket, settings, log, limits, connection }, run) {
  const conditionalWrites = !connection.endpoint;

  return createConverter({
    bucket,
    settings,
    log,
    state: run.state,
    retries: limits.retries,
    conditionalWrites,
  });
}

export async function convertAll(session, preparedWork) {
  const { log, limits, jobFiles } = session;

  const run = newRun(preparedWork);
  // Every image is decoded once; sharp's cache would only hold memory.
  sharp.cache(false);
  run.progress.open();

  const signals = installStopSignals(session, run);
  const ticker = setInterval(() => {
    log.info(statusLine(run));
    jobFiles.saveStatus(run.counts);
  }, STATUS_EVERY_MS);

  const workers = { source: pendingItems(session, run), convert: converterFor(session, run) };
  log.info(`\nConverting with concurrency ${limits.concurrency} (Ctrl+C to stop safely)\n`);
  await Promise.all(Array.from({ length: limits.concurrency }, () => work(session, run, workers)));

  clearInterval(ticker);
  if (!run.state.hardStop) {
    signals.remove();
    run.progress.close();
  }

  return run;
}
