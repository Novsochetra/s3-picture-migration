import fs from 'node:fs';
import path from 'node:path';
import { readJson, writeJsonAtomic } from '../../utils/json-files.js';

export function jobPaths(dir) {
  return {
    job: path.join(dir, 'job.json'),
    manifest: path.join(dir, 'manifest.jsonl'),
    progress: path.join(dir, 'progress.jsonl'),
    failed: path.join(dir, 'failed.txt'),
    log: path.join(dir, 'run.log'),
  };
}

const newJob = ({ bucketName, prefix, connection }) => ({
  version: 1,
  bucket: bucketName,
  prefix,
  endpoint: connection.endpoint ?? null,
  pathStyle: connection.pathStyle,
  region: null,
  settings: {},
  createdAt: new Date().toISOString(),
});

function startOver(dir, paths, job) {
  const history = path.join(dir, 'history', new Date().toISOString().replace(/[:.]/g, '-'));

  for (const file of [paths.manifest, paths.progress, paths.failed]) {
    if (fs.existsSync(file)) {
      fs.mkdirSync(history, { recursive: true });
      fs.renameSync(file, path.join(history, path.basename(file)));
    }
  }

  delete job.scan;
  delete job.status;

  return fs.existsSync(history) ? path.relative(process.cwd(), history) : null;
}

export function statusOf(counts, finished) {
  const now = new Date().toISOString();

  return {
    total: counts.total,
    completed: counts.completed,
    remaining: counts.total - counts.completed,
    failed: counts.failed,
    invalid: counts.invalid,
    totalBytes: counts.totalBytes,
    completedBytes: counts.completedBytes,
    updatedAt: now,
    ...(finished && { lastRunEnded: now }),
  };
}

export function openJob({ dir, bucketName, prefix, connection }) {
  const paths = jobPaths(dir);
  const saved = readJson(paths.job);
  const job = saved ?? newJob({ bucketName, prefix, connection });

  fs.mkdirSync(dir, { recursive: true });

  return {
    dir,
    paths,
    job,
    wasSaved: Boolean(saved),
    save: () => writeJsonAtomic(paths.job, job),
    startOver: () => startOver(dir, paths, job),
    saveStatus(counts, finished = false) {
      job.status = statusOf(counts, finished);
      writeJsonAtomic(paths.job, job);
    },
  };
}
