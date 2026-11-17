import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { readJson } from '../../utils/json-files.js';

export function jobDirFor({ jobsDir, endpoint, bucketName, prefix }) {
  const id = `${endpoint ?? 'aws'}|${bucketName}|${prefix}`;
  const hash = crypto.createHash('sha1').update(id).digest('hex').slice(0, 8);

  const slug = `${bucketName}__${prefix || 'ROOT'}`.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80);

  return path.resolve(jobsDir, `${slug}__${hash}`);
}

export function listJobs({ jobsDir, endpoint }) {
  const root = path.resolve(jobsDir);

  if (!fs.existsSync(root)) {
    return [];
  }

  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.includes('.bak-'))
    .map((entry) => readJson(path.join(root, entry.name, 'job.json')))
    .filter((job) => job && (job.endpoint ?? null) === (endpoint ?? null));
}

export const isUnfinished = (job) =>
  !job.status || job.status.remaining > 0 || job.status.failed > 0;
