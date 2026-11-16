#!/usr/bin/env node
/**
 * s3-to-webp.mjs — convert every image under an S3 folder to WebP, resumably.
 *
 * Each image is downloaded into memory once, encoded with sharp and streamed back
 * to S3 (no temp files), at the same path:
 *   raw/2024/cat.jpg -> raw/2024/cat.webp                 (default)
 *   raw/2024/cat.jpg -> raw/2024/cat.jpg  (WebP inside)   (--keep-ext)
 *   raw/2024/cat.jpg -> raw/2024/cat.jpg  (WebP inside)   (--replace)
 *                     + raw/2024/cat-original.jpg (backup of the original, made first)
 *
 * SIZES  (--sizes 320,640,1080)
 *   Also writes one resized WebP per width, same aspect ratio, never enlarged.
 *   Name = the main output with -<width>w before the extension:
 *     --replace / --keep-ext:  cat.jpg  -> cat-320w.jpg, cat-640w.jpg, cat-1080w.jpg
 *     default:                 cat.webp -> cat-320w.webp, ...
 *   Every size is always written (an image narrower than a size keeps its own
 *   width), so the app can request any size without a 404.
 *   Adding sizes to a finished job: --fresh --sizes ...  (only missing sizes are made,
 *   from the original/backup, the main image is left alone).
 *
 * QUICK START
 *   Put your keys in .env:   AWS_ACCESS_KEY_ID=...   AWS_SECRET_ACCESS_KEY=...
 *
 *   node --env-file=.env s3-to-webp.mjs                       # menu: pick bucket + folder
 *   node --env-file=.env s3-to-webp.mjs --list-buckets
 *   node --env-file=.env s3-to-webp.mjs --bucket my-bucket --prefix raw/2024/
 *
 * RESUMING
 *   Each bucket + folder is a "job" kept in ./s3-webp-jobs/<job>/:
 *     job.json        settings, region, totals, last known status
 *     manifest.jsonl  every image found by the scan (key + size)
 *     progress.jsonl  one line per finished image (done / skipped / failed / invalid)
 *     run.log         timestamped log of every run
 *     failed.txt      images still failing after the last run
 *   Run the same command again (or pick the job from the menu) to continue.
 *   Finished images are never touched again; failed ones are retried.
 *   Ctrl+C once = finish in-flight images and stop cleanly. Twice = abort now.
 *
 * ROLLBACK  (--rollback)
 *   Puts the folder back the way it was before this script ran:
 *     --replace : every image is restored from its -original backup (byte-for-byte),
 *                 then the backup is removed
 *     default   : the .webp files made next to the originals are deleted
 *     sizes     : all -<width>w copies are deleted
 *   Only files this script made are touched (it checks the marker it writes into
 *   each file's S3 metadata). An image the app replaced after the conversion is
 *   never overwritten: it is left as is and its backup kept.
 *   Not reversible without S3 versioning: --keep-ext (no backup), --delete-original.
 *   Shows the plan and asks first; --dry-run shows the plan only.
 *
 * RUNNING A FINISHED JOB AGAIN
 *   --fresh    start over: re-scan the folder and go through every image again.
 *              Images that are already converted are detected in S3 and skipped.
 *              The job's settings are kept; old progress moves to <job>/history/.
 *   --rescan   only pick up images added since the last scan.
 *   In a terminal, a finished job also offers to start over for you.
 *
 * OPTIONS
 *   --bucket <name>          Bucket to work on (omit for the interactive menu)
 *   --prefix <folder/>       Folder inside the bucket (default: whole bucket)
 *   --list-buckets           Show the buckets your key can see, then exit
 *   --rollback               Undo this script's changes in --prefix (see ROLLBACK)
 *   --ls                     List objects in --bucket under --prefix, then exit
 *                            (no --bucket = pick one from the menu)
 *   --recursive              With --ls: list everything under the prefix, not just one level
 *   --region <region>        Force a region (normally auto-detected per bucket)
 *   --endpoint <url>         S3-compatible endpoint (DigitalOcean Spaces, R2, MinIO...)
 *   --path-style             Path-style URLs (MinIO and some others need this)
 *
 *   Conversion settings (saved with the job, reused when resuming):
 *   --quality <1-100>        WebP quality (default 80)
 *   --max-width <px>         Shrink wider images to this width (never enlarges)
 *   --sizes <w,w,...>        Also write resized copies at these widths (see SIZES);
 *                            --sizes none removes the setting from a job
 *   --ext <list>             Source extensions (default jpg,jpeg,png,gif,tif,tiff)
 *   --keep-ext               Overwrite the original key in place (Content-Type image/webp)
 *   --replace                Like --keep-ext, but first back up the original as
 *                            <name>-original.<ext>. App URLs stay the same. Backups are
 *                            never converted, and a later --rescan skips them.
 *   --backup-suffix <s>      With --replace: backup name suffix (default -original)
 *   --delete-original        Delete the source after its .webp is uploaded
 *   --overwrite              Re-convert even when the .webp already exists
 *   --allow-larger           Upload even when the WebP is bigger than the original
 *   --acl <acl>              ACL for uploads, e.g. public-read
 *
 *   Run behaviour:
 *   --concurrency <n>        Images in flight at once (default 4). Each one holds its
 *                            source file + decoded pixels in RAM, so lower this for
 *                            very large originals.
 *   --retries <n>            Retries per image for network/S3 errors (default 3)
 *   --max-consecutive-failures <n>  Stop the run after n failures in a row (default 10)
 *   --retry-failed           Also retry images marked invalid (corrupt/unsupported)
 *   --rescan                 Re-list the folder (pick up files added since the scan)
 *   --fresh                  Start the job over (settings kept, old progress -> history/)
 *   --jobs-dir <dir>         Where job folders live (default ./s3-webp-jobs)
 *   --dry-run                Scan and show what would be done, change nothing
 *   -y, --yes                Don't ask for confirmation
 */

import { parseArgs } from 'node:util';
import { pipeline, Transform } from 'node:stream';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import {
  S3Client,
  ListBucketsCommand,
  GetBucketLocationCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetBucketVersioningCommand,
  paginateListObjectsV2,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import sharp from 'sharp';

const WEBP_MAX_DIMENSION = 16383; // hard limit of the WebP format, per side
const STATUS_EVERY_MS = 30_000;

const DEFAULT_SETTINGS = {
  quality: 80,
  maxWidth: null,
  sizes: null, // e.g. [320, 640, 1080]
  ext: 'jpg,jpeg,png,gif,tif,tiff',
  keepExt: false,
  backupSuffix: null, // set by --replace
  deleteOriginal: false,
  overwrite: false,
  allowLarger: false,
  acl: null,
};

// ───────────────────────── CLI ─────────────────────────

const { values: args } = parseArgs({
  options: {
    bucket: { type: 'string' },
    prefix: { type: 'string' },
    region: { type: 'string' },
    endpoint: { type: 'string' },
    'path-style': { type: 'boolean', default: false },
    'list-buckets': { type: 'boolean', default: false },
    rollback: { type: 'boolean', default: false },
    ls: { type: 'boolean', default: false },
    recursive: { type: 'boolean', default: false },
    // conversion settings: no defaults here, so we can tell what was passed explicitly
    quality: { type: 'string' },
    'max-width': { type: 'string' },
    sizes: { type: 'string' },
    ext: { type: 'string' },
    'keep-ext': { type: 'boolean' },
    replace: { type: 'boolean' },
    'backup-suffix': { type: 'string' },
    'delete-original': { type: 'boolean' },
    overwrite: { type: 'boolean' },
    'allow-larger': { type: 'boolean' },
    acl: { type: 'string' },
    // run behaviour
    concurrency: { type: 'string', default: '4' },
    retries: { type: 'string', default: '3' },
    'max-consecutive-failures': { type: 'string', default: '10' },
    'retry-failed': { type: 'boolean', default: false },
    rescan: { type: 'boolean', default: false },
    fresh: { type: 'boolean', default: false },
    'jobs-dir': { type: 'string', default: './s3-webp-jobs' },
    'dry-run': { type: 'boolean', default: false },
    yes: { type: 'boolean', short: 'y', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

const CONCURRENCY = toInt(args.concurrency, 1, 64, 'concurrency');
const RETRIES = toInt(args.retries, 0, 20, 'retries');
const MAX_CONSECUTIVE_FAILURES = toInt(args['max-consecutive-failures'], 1, 100000, 'max-consecutive-failures');
const RETRY_FAILED = args['retry-failed'];

function cliSettings() {
  const s = {};
  if (args.quality !== undefined) s.quality = toInt(args.quality, 1, 100, 'quality');
  if (args['max-width'] !== undefined) s.maxWidth = toInt(args['max-width'], 1, WEBP_MAX_DIMENSION, 'max-width');
  if (args.sizes !== undefined) {
    if (/^(none|off|0)$/i.test(args.sizes.trim())) {
      s.sizes = null;
    } else {
      const list = args.sizes.split(',').map((v) => v.trim().replace(/w$/i, '')).filter(Boolean).map(Number);
      if (!list.length || list.some((n) => !Number.isInteger(n) || n < 1 || n > WEBP_MAX_DIMENSION)) {
        console.error(`--sizes must be widths between 1 and ${WEBP_MAX_DIMENSION}, e.g. --sizes 320,640,1080`);
        process.exit(1);
      }
      s.sizes = [...new Set(list)].sort((a, b) => a - b);
    }
  }
  if (args.ext !== undefined) s.ext = args.ext;
  if (args['keep-ext']) s.keepExt = true;
  if (args['backup-suffix'] !== undefined && !args.replace) {
    console.error('--backup-suffix only works together with --replace');
    process.exit(1);
  }
  if (args.replace) {
    s.keepExt = true;
    s.backupSuffix = args['backup-suffix'] ?? '-original';
    if (!/^[\w.-]+$/.test(s.backupSuffix)) {
      console.error('--backup-suffix may only contain letters, numbers, "-", "_" and "."');
      process.exit(1);
    }
  }
  if (args['delete-original']) s.deleteOriginal = true;
  if (args.overwrite) s.overwrite = true;
  if (args['allow-larger']) s.allowLarger = true;
  if (args.acl !== undefined) s.acl = args.acl;
  return s;
}

// ───────────────────────── small utils ─────────────────────────

function toInt(value, min, max, name) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    console.error(`--${name} must be a whole number between ${min} and ${max}`);
    process.exit(1);
  }
  return n;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (n) => Number(n).toLocaleString('en-US');
const pct = (a, b) => (b ? ((a / b) * 100).toFixed(1) : '100.0');
const shq = (s) => (/^[\w./:@-]+$/.test(s) ? s : `'${String(s).replace(/'/g, `'\\''`)}'`);

function fmtBytes(n) {
  if (n == null || Number.isNaN(n)) return '?';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return i === 0 ? `${v} B` : `${v.toFixed(v < 10 ? 2 : 1)} ${units[i]}`;
}

function fmtDuration(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '?';
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

function extOf(key) {
  const base = key.slice(key.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

function normalizePrefix(p) {
  if (!p) return '';
  p = p.replace(/^\/+/, '');
  return p && !p.endsWith('/') ? `${p}/` : p; // treat it as a folder
}

/** insertBeforeExt('raw/a/wallpaper.png', '-original') -> 'raw/a/wallpaper-original.png' */
function insertBeforeExt(key, text) {
  const slash = key.lastIndexOf('/');
  const dot = key.lastIndexOf('.');
  return dot > slash + 1 ? `${key.slice(0, dot)}${text}${key.slice(dot)}` : `${key}${text}`;
}

/** raw/a/wallpaper.png -> raw/a/wallpaper.webp */
function swapExt(key, ext) {
  const slash = key.lastIndexOf('/');
  const dot = key.lastIndexOf('.');
  return `${dot > slash + 1 ? key.slice(0, dot) : key}.${ext}`;
}

const backupKeyFor = (key, suffix) => insertBeforeExt(key, suffix);
const variantKeyFor = (mainKey, width) => insertBeforeExt(mainKey, `-${width}w`);

function stemOf(key) {
  const base = key.slice(key.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}
const isBackupKey = (key, suffix) => stemOf(key).endsWith(suffix);

/** raw/a/wallpaper-original.png -> raw/a/wallpaper.png */
function mainKeyForBackup(backupKey, suffix) {
  const slash = backupKey.lastIndexOf('/');
  const base = backupKey.slice(slash + 1);
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  return `${backupKey.slice(0, slash + 1)}${stem.slice(0, -suffix.length)}${dot > 0 ? base.slice(dot) : ''}`;
}

/** Run fn over items with at most `limit` in flight. */
async function runPool(items, limit, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]);
  }));
}
const isVariantKey = (key) => /-\d+w$/.test(stemOf(key));

/** CopySource must be URL-encoded per path segment. */
const copySource = (bucket, key) => `${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function writeJson(file, data) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file); // atomic: job.json is never half-written
}

/** Read a JSON-lines file, ignoring a truncated last line left by a crash. */
async function* readJsonl(file) {
  if (!fs.existsSync(file)) return;
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try { yield JSON.parse(line); } catch { /* partial line */ }
  }
}

function explainError(err) {
  const name = err?.name ?? '';
  const msg = err?.message ?? String(err);
  if (name === 'CredentialsProviderError' || /could not load credentials/i.test(msg)) {
    return 'No AWS credentials found. Put AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in a .env file ' +
      'and run: node --env-file=.env s3-to-webp.mjs';
  }
  if (name === 'InvalidAccessKeyId') return 'AWS rejected the access key ID (AWS_ACCESS_KEY_ID).';
  if (name === 'SignatureDoesNotMatch') return 'AWS rejected the secret key (AWS_SECRET_ACCESS_KEY).';
  if (name === 'AccessControlListNotSupported') return 'This bucket has ACLs disabled; run without --acl.';
  if (name === 'AccessDenied' || err?.$metadata?.httpStatusCode === 403) return `Access denied: ${msg}`;
  return msg;
}

const isCredentialError = (err) =>
  ['CredentialsProviderError', 'InvalidAccessKeyId', 'SignatureDoesNotMatch'].includes(err?.name);

// ───────────────────────── logging ─────────────────────────

/** Console + timestamped run.log (once a job folder exists). */
const log = {
  fd: null,
  attach(file) { this.fd = fs.openSync(file, 'a'); },
  write(level, msg) {
    (level === 'INFO' ? console.log : console.error)(msg);
    if (this.fd !== null) fs.writeSync(this.fd, `${new Date().toISOString()} ${level.padEnd(5)} ${msg}\n`);
  },
  info(msg) { this.write('INFO', msg); },
  warn(msg) { this.write('WARN', msg); },
  error(msg) { this.write('ERROR', msg); },
};

/**
 * progress.jsonl: append-only, one line per finished image, written synchronously
 * so a crash loses at most the images that were still in flight.
 */
class ProgressStore {
  constructor(file) {
    this.file = file;
    this.map = new Map(); // key -> { st, err? }  (latest entry wins)
    this.fd = null;
  }

  async load() {
    for await (const e of readJsonl(this.file)) {
      if (e.k) this.map.set(e.k, e.err ? { st: e.st, err: e.err } : { st: e.st });
    }
  }

  open() {
    // If a crash left a partial last line, start on a fresh line.
    if (fs.existsSync(this.file)) {
      const { size } = fs.statSync(this.file);
      if (size > 0) {
        const fd = fs.openSync(this.file, 'r');
        const b = Buffer.alloc(1);
        fs.readSync(fd, b, 0, 1, size - 1);
        fs.closeSync(fd);
        if (b[0] !== 0x0a) fs.appendFileSync(this.file, '\n');
      }
    }
    this.fd = fs.openSync(this.file, 'a');
  }

  record(key, r, ms) {
    const entry = {
      t: new Date().toISOString(),
      k: key,
      st: r.st,
      ...(r.reason && { why: r.reason }),
      ...(r.to && r.to !== key && { to: r.to }),
      ...(r.backup && { bak: r.backup }),
      ...(r.sizes?.length && { sizes: r.sizes, vout: r.vout }),
      ...(r.in != null && { in: r.in }),
      ...(r.out != null && { out: r.out }),
      ...(r.err && { err: r.err }),
      ...(r.attempts > 1 && { tries: r.attempts }),
      ms,
    };
    fs.writeSync(this.fd, `${JSON.stringify(entry)}\n`);
    this.map.set(key, r.err ? { st: r.st, err: r.err } : { st: r.st });
  }

  status(key) { return this.map.get(key)?.st; }
}

// done / skipped are final. invalid (corrupt/unsupported) is final unless --retry-failed.
const isFinished = (st) => st === 'done' || st === 'skipped' || (st === 'invalid' && !RETRY_FAILED);

// ───────────────────────── S3 helpers ─────────────────────────

function makeClient(region, extra = {}) {
  return new S3Client({
    region,
    ...(args.endpoint && { endpoint: args.endpoint }),
    ...(args['path-style'] && { forcePathStyle: true }),
    maxAttempts: 5,
    ...extra,
  });
}

const fallbackRegion = () => args.region || process.env.AWS_REGION || 'us-east-1';

/** Works out which region a bucket lives in, so the user only needs the two keys. */
async function detectBucketRegion(bucket) {
  if (args.region) return args.region;
  if (args.endpoint) return fallbackRegion(); // S3-compatible services don't care

  const probe = makeClient('us-east-1');
  try {
    const r = await probe.send(new GetBucketLocationCommand({ Bucket: bucket }));
    const loc = r.LocationConstraint;
    return !loc ? 'us-east-1' : loc === 'EU' ? 'eu-west-1' : loc;
  } catch (err) {
    if (isCredentialError(err)) throw err;
  }
  try {
    const r = await probe.send(new HeadBucketCommand({ Bucket: bucket }));
    return r.BucketRegion ?? 'us-east-1';
  } catch (err) {
    if (isCredentialError(err)) throw err;
    const fromHeader = err?.$response?.headers?.['x-amz-bucket-region'] ?? err?.BucketRegion;
    if (fromHeader) return fromHeader;
  }
  return null;
}

async function bucketClient(bucket, knownRegion) {
  const region = knownRegion ?? (await detectBucketRegion(bucket));
  if (region) return { client: makeClient(region), region };
  log.warn(`Could not detect the region of "${bucket}"; letting the SDK follow redirects (slower). ` +
    'Pass --region to skip this.');
  return { client: makeClient(fallbackRegion(), { followRegionRedirects: true }), region: fallbackRegion() };
}

async function fetchBuckets() {
  const client = makeClient(fallbackRegion());
  try {
    const r = await client.send(new ListBucketsCommand({}));
    return r.Buckets ?? [];
  } catch (err) {
    if (err?.name === 'AccessDenied' || err?.$metadata?.httpStatusCode === 403) {
      throw new Error('Your key is not allowed to list buckets (s3:ListAllMyBuckets). ' +
        'Pass the bucket name directly with --bucket <name>.');
    }
    throw err;
  }
}

// ───────────────────────── interactive menu ─────────────────────────

function createPrompter() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: Boolean(process.stdin.isTTY),
  });
  rl.on('SIGINT', () => { console.log(); process.exit(130); });
  const lines = rl[Symbol.asyncIterator]();
  return {
    async ask(question) {
      rl.setPrompt(question);
      rl.prompt();
      const { value, done } = await lines.next();
      if (done) throw new Error('No input (stdin closed).');
      if (!process.stdin.isTTY) process.stdout.write(`${value}\n`);
      return value.trim();
    },
    close() { rl.close(); },
  };
}

function listJobs() {
  const root = path.resolve(args['jobs-dir']);
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.includes('.bak-'))
    .map((d) => readJson(path.join(root, d.name, 'job.json')))
    .filter((j) => j && (j.endpoint ?? null) === (args.endpoint ?? null));
}

async function pickUnfinishedJob(prompt) {
  const jobs = listJobs().filter((j) => !j.status || j.status.remaining > 0 || j.status.failed > 0);
  if (!jobs.length) return null;
  console.log('\nUnfinished jobs on this machine:');
  jobs.forEach((j, i) => {
    const st = j.status;
    const info = st
      ? `${pct(st.completed, st.total)}% (${num(st.completed)}/${num(st.total)})` +
        `${st.failed ? ` · ${num(st.failed)} failed` : ''} · last run ${st.updatedAt?.slice(0, 16).replace('T', ' ')}`
      : 'not started';
    console.log(`  ${String(i + 1).padStart(3)})  s3://${j.bucket}/${j.prefix}   ${info}`);
  });
  for (;;) {
    const a = await prompt.ask('\nResume a job [number], or press Enter for a new one: ');
    if (a === '') return null;
    const j = jobs[Number(a) - 1];
    if (j) return j;
    console.log('  Not a valid choice.');
  }
}

async function pickBucket(prompt) {
  const buckets = await fetchBuckets();
  if (!buckets.length) throw new Error('This key can see no buckets.');
  const w = Math.max(...buckets.map((b) => b.Name.length));
  console.log('\nBuckets:');
  buckets.forEach((b, i) =>
    console.log(`  ${String(i + 1).padStart(3)})  ${b.Name.padEnd(w)}  ${b.BucketRegion ?? ''}`));
  for (;;) {
    const a = await prompt.ask(`\nPick a bucket [1-${buckets.length}] or type its name: `);
    const b = buckets[Number(a) - 1] ?? buckets.find((x) => x.Name === a);
    if (b) return { name: b.Name, region: b.BucketRegion ?? null };
    console.log('  Not a valid choice.');
  }
}

async function browseFolders(client, bucket, prompt) {
  let prefix = '';
  for (;;) {
    const r = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, Delimiter: '/' }));
    const folders = (r.CommonPrefixes ?? []).map((p) => p.Prefix);
    const files = (r.Contents ?? []).filter((o) => o.Key !== prefix);
    console.log(`\ns3://${bucket}/${prefix}`);
    folders.forEach((f, i) => console.log(`  ${String(i + 1).padStart(4)})  ${f.slice(prefix.length)}`));
    if (!folders.length) console.log('        (no sub-folders)');
    if (r.IsTruncated) console.log('        (list cut at 1000 — type a path like raw/2024/ to jump)');
    console.log(`        ${files.length}${r.IsTruncated ? '+' : ''} file(s) directly in this folder`);
    const a = await prompt.ask('\nFolder number to open · Enter = use this folder (incl. sub-folders) · .. = up · q = quit: ');
    if (a === '' || a === '.') return prefix;
    if (a === 'q') process.exit(0);
    if (a === '..') {
      const up = prefix.split('/').slice(0, -2).join('/');
      prefix = up ? `${up}/` : '';
      continue;
    }
    const n = Number(a);
    if (Number.isInteger(n) && folders[n - 1]) { prefix = folders[n - 1]; continue; }
    if (a.includes('/')) { prefix = normalizePrefix(a); continue; }
    console.log('  Not a valid choice.');
  }
}

// ───────────────────────── job folder ─────────────────────────

function jobDirFor(bucket, prefix) {
  const id = `${args.endpoint ?? 'aws'}|${bucket}|${prefix}`;
  const hash = crypto.createHash('sha1').update(id).digest('hex').slice(0, 8);
  const slug = `${bucket}__${prefix || 'ROOT'}`.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80);
  return path.resolve(args['jobs-dir'], `${slug}__${hash}`);
}

/** skipLabel(key) returns a label for keys that must never be treated as source images. */
async function scanToManifest(s3, bucket, prefix, exts, manifestPath, skipLabel) {
  const tmp = `${manifestPath}.tmp`;
  const fd = fs.openSync(tmp, 'w');
  const byExt = {};
  const ignored = {};
  let seen = 0;
  let count = 0;
  let total = 0;
  const tty = process.stdout.isTTY;
  try {
    const pages = paginateListObjectsV2({ client: s3, pageSize: 1000 }, { Bucket: bucket, Prefix: prefix });
    for await (const page of pages) {
      let chunk = '';
      for (const o of page.Contents ?? []) {
        seen++;
        if (o.Key.endsWith('/')) continue;
        const label = skipLabel(o.Key);
        if (label) {
          ignored[label] = (ignored[label] ?? 0) + 1;
          continue;
        }
        const e = extOf(o.Key);
        if (!exts.has(e)) {
          const label = e || '(no ext)';
          ignored[label] = (ignored[label] ?? 0) + 1;
          continue;
        }
        chunk += `${JSON.stringify({ k: o.Key, s: o.Size ?? 0 })}\n`;
        count++;
        total += o.Size ?? 0;
        byExt[e] = (byExt[e] ?? 0) + 1;
      }
      if (chunk) fs.writeSync(fd, chunk);
      if (tty) process.stdout.write(`\r  scanned ${num(seen)} objects · ${num(count)} images · ${fmtBytes(total)}   `);
    }
  } finally {
    fs.closeSync(fd);
  }
  if (tty) process.stdout.write('\n');
  fs.renameSync(tmp, manifestPath); // only a complete scan becomes the manifest
  return { count, bytes: total, seen, byExt, ignored, at: new Date().toISOString() };
}

const fmtCounts = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 8)
  .map(([k, v]) => `${k} ${num(v)}`).join(' · ');

// ───────────────────────── conversion ─────────────────────────

class LargerThanOriginalError extends Error {}

/** Pass-through byte counter; errors if output grows past `limit`. */
function byteCounter(limit = null) {
  let n = 0;
  const t = new Transform({
    transform(chunk, _enc, cb) {
      n += chunk.length;
      if (limit && n > limit) return cb(new LargerThanOriginalError('webp larger than original'));
      cb(null, chunk);
    },
  });
  t.total = () => n;
  return t;
}

function createConverter({ s3, bucket, S, state }) {
  const sizes = S.sizes ?? [];
  const mainKeyFor = (key) => (S.keepExt ? key : swapExt(key, 'webp'));

  async function head(key) {
    try {
      return await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    } catch (err) {
      if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound') return null;
      throw err;
    }
  }

  /**
   * Download an object fully into memory (sharp would buffer it anyway).
   * Having the whole file first means any later sharp error is about the file
   * itself, never a half-finished download.
   */
  async function fetchBuffer(key) {
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const handle = { abort: async () => { res.Body.destroy(); } };
    state.active.add(handle);
    try {
      const buf = Buffer.from(await res.Body.transformToByteArray());
      if (res.ContentLength != null && buf.length !== res.ContentLength) {
        throw new Error(`download incomplete (${buf.length} of ${res.ContentLength} bytes)`);
      }
      return { buf, res };
    } finally {
      state.active.delete(handle);
    }
  }

  /**
   * Encode `buf` to WebP (optionally at `width`, aspect ratio kept, never enlarged)
   * and stream it to `targetKey`. Returns { out } or { larger: true } when the
   * output would exceed `limit` (the upload is cancelled before it completes).
   */
  async function encodeUpload({ buf, srcKey, targetKey, width = null, limit = null, params = {} }) {
    const encoder = sharp(buf, { animated: extOf(srcKey) === 'gif' })
      .rotate() // apply EXIF orientation first, so width/height are as people see them
      .resize({
        width: Math.min(width ?? S.maxWidth ?? WEBP_MAX_DIMENSION, WEBP_MAX_DIMENSION),
        height: WEBP_MAX_DIMENSION, // only a ceiling: height follows the aspect ratio
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: S.quality, effort: 4 });
    const output = byteCounter(limit);

    let origin = null;
    encoder.on('error', (err) => { origin ??= { stage: 'encode', err }; });
    output.on('error', (err) => { origin ??= { stage: 'output', err }; });

    const body = pipeline(encoder, output, () => {});
    const upload = new Upload({
      client: s3,
      queueSize: 2,
      partSize: 8 * 1024 * 1024,
      params: {
        Bucket: bucket,
        Key: targetKey,
        Body: body,
        ContentType: 'image/webp',
        ...(S.acl && { ACL: S.acl }),
        ...params,
      },
    });

    const handle = { abort: async () => { encoder.destroy(); await upload.abort().catch(() => {}); } };
    state.active.add(handle);
    try {
      await upload.done();
    } catch (err) {
      const cause = origin?.err ?? err;
      if (cause instanceof LargerThanOriginalError) return { larger: true };
      // The input is complete in memory, so a sharp error means the file itself is bad.
      if (origin?.stage === 'encode') cause.permanent = true;
      throw cause;
    } finally {
      state.active.delete(handle);
    }
    return { out: output.total() };
  }

  /** Write the given widths for `mainKey`, one after another (one decode in memory at a time). */
  async function makeSizes({ buf, srcKey, mainKey, widths, cacheControl }) {
    let bytes = 0;
    for (const w of widths) {
      const r = await encodeUpload({
        buf,
        srcKey,
        targetKey: variantKeyFor(mainKey, w),
        width: w,
        params: {
          ...(cacheControl && { CacheControl: cacheControl }),
          Metadata: { 'size-of': encodeURIComponent(mainKey), 'size-width': String(w) },
        },
      });
      bytes += r.out;
    }
    return bytes;
  }

  async function missingSizes(mainKey) {
    const found = await Promise.all(sizes.map((w) => head(variantKeyFor(mainKey, w))));
    return sizes.filter((_, i) => !found[i]);
  }

  /** Main image already converted: only add whichever sizes are missing. */
  async function addMissingSizes({ key, mainKey, preferSrc, fallbackSrc, cacheControl, alreadyReason }) {
    const need = await missingSizes(mainKey);
    if (!need.length) return null;
    const srcKey = preferSrc && (await head(preferSrc)) ? preferSrc : fallbackSrc;
    const { buf } = await fetchBuffer(srcKey);
    const vout = await makeSizes({ buf, srcKey, mainKey, widths: need, cacheControl });
    return { st: 'done', onlySizes: true, reason: alreadyReason, to: mainKey, sizes: need, vout };
  }

  /**
   * --replace: back up key -> name-original.ext, then write the WebP at the original key
   * (+ sizes). Every step is safe to repeat, so a crash anywhere resumes on the next run.
   */
  async function replaceWithBackup({ key }) {
    const backupKey = backupKeyFor(key, S.backupSuffix);
    const current = await head(key);
    if (!current) return { st: 'skipped', reason: 'source no longer exists' };

    if (current.ContentType === 'image/webp') {
      // Sizes come from the backup (the real original) when it exists.
      const added = await addMissingSizes({
        key, mainKey: key, preferSrc: backupKey, fallbackSrc: key,
        cacheControl: current.CacheControl, alreadyReason: 'main image already webp',
      });
      return added ?? { st: 'skipped', reason: 'already webp' };
    }

    // 1. Backup: server-side copy of exactly the version we just looked at.
    let createdBackup = false;
    const existingBackup = await head(backupKey);
    if (existingBackup?.ETag !== current.ETag) {
      await s3.send(new CopyObjectCommand({
        Bucket: bucket,
        Key: backupKey,
        CopySource: copySource(bucket, key),
        CopySourceIfMatch: current.ETag,
      }));
      const check = await head(backupKey);
      if (!check || check.ContentLength !== current.ContentLength) {
        throw new Error(`backup ${backupKey} could not be verified; original left untouched`);
      }
      createdBackup = true;
    }

    // 2. Convert from the backup into the original key. IfMatch makes S3 refuse the
    //    write if the app replaced the file in the meantime (then we retry with the new one).
    const { buf } = await fetchBuffer(backupKey);
    let main;
    try {
      main = await encodeUpload({
        buf,
        srcKey: backupKey,
        targetKey: key,
        limit: S.allowLarger ? null : buf.length,
        params: {
          ...(current.CacheControl && { CacheControl: current.CacheControl }),
          ...(current.ContentDisposition && { ContentDisposition: current.ContentDisposition }),
          Metadata: { ...(current.Metadata ?? {}), 'original-backup': encodeURIComponent(backupKey) },
          ...(!args.endpoint && { IfMatch: current.ETag }),
        },
      });
    } catch (err) {
      // Corrupt/unsupported file: the original was never touched, so drop our extra copy.
      // (On network errors the backup is kept and reused by the retry.)
      if (err.permanent && createdBackup) {
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: backupKey })).catch(() => {});
      }
      throw err;
    }

    // 3. Sizes, from the same in-memory original.
    const vout = sizes.length
      ? await makeSizes({ buf, srcKey: backupKey, mainKey: key, widths: sizes, cacheControl: current.CacheControl })
      : 0;

    if (main.larger) {
      // Original was never touched, so the backup we just made isn't needed.
      if (createdBackup) await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: backupKey }));
      return { st: 'skipped', reason: 'webp would be larger; original kept', in: buf.length, sizes, vout };
    }
    return { st: 'done', to: key, backup: backupKey, in: buf.length, out: main.out, sizes, vout };
  }

  /** Default mode (.webp next to the original) and --keep-ext. */
  async function convertPlain({ key }) {
    const mainKey = mainKeyFor(key);
    const sameKey = mainKey === key;

    // Already converted?
    let existing = null;
    if (sameKey) {
      const cur = await head(key);
      if (!cur) return { st: 'skipped', reason: 'source no longer exists' };
      if (cur.ContentType === 'image/webp') existing = cur;
    } else if (!S.overwrite) {
      existing = await head(mainKey);
    }

    if (existing) {
      const added = await addMissingSizes({
        key, mainKey,
        preferSrc: sameKey ? null : key, // the original, if it is still there
        fallbackSrc: mainKey,
        cacheControl: existing.CacheControl,
        alreadyReason: sameKey ? 'main image already webp' : 'webp already existed',
      });
      // Crashed between upload and delete last time? Finish the delete now.
      const madeFrom = decodeURIComponent(existing.Metadata?.['original-key'] ?? '');
      if (!sameKey && S.deleteOriginal && madeFrom === key) {
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
        return { ...(added ?? {}), st: 'done', onlySizes: true, reason: 'webp was already uploaded; original deleted', to: mainKey };
      }
      return added ?? { st: 'skipped', reason: sameKey ? 'already webp' : 'webp already exists', to: mainKey };
    }

    let fetched;
    try {
      fetched = await fetchBuffer(key);
    } catch (err) {
      if (err?.name === 'NoSuchKey') return { st: 'skipped', reason: 'source no longer exists' };
      throw err;
    }
    const { buf, res } = fetched;

    const main = await encodeUpload({
      buf,
      srcKey: key,
      targetKey: mainKey,
      limit: S.allowLarger ? null : buf.length,
      params: {
        ...(res.CacheControl && { CacheControl: res.CacheControl }),
        ...(res.ContentDisposition && { ContentDisposition: res.ContentDisposition }),
        Metadata: { ...(res.Metadata ?? {}), 'original-key': encodeURIComponent(key) },
      },
    });
    const vout = sizes.length
      ? await makeSizes({ buf, srcKey: key, mainKey, widths: sizes, cacheControl: res.CacheControl })
      : 0;

    if (main.larger) return { st: 'skipped', reason: 'webp would be larger; original kept', in: buf.length, sizes, vout };
    if (S.deleteOriginal && !sameKey) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    }
    return { st: 'done', to: mainKey, in: buf.length, out: main.out, sizes, vout };
  }

  const convertOnce = (item) => (S.backupSuffix ? replaceWithBackup(item) : convertPlain(item));

  /** convertOnce + retries with backoff for network/S3 errors. Never throws. */
  return async function convert(item) {
    for (let attempt = 1; ; attempt++) {
      try {
        return { ...(await convertOnce(item)), attempts: attempt };
      } catch (err) {
        if (state.hardStop) return { st: 'aborted' };
        const message = err?.name === 'PreconditionFailed'
          ? 'file changed during conversion (the app replaced it); retrying with the new version'
          : explainError(err);
        if (err.permanent) return { st: 'invalid', err: message, attempts: attempt };
        if (attempt > RETRIES || state.stopping) return { st: 'failed', err: message, attempts: attempt };
        const delay = Math.min(30_000, 1000 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 500);
        log.warn(`retry  ${item.key} in ${(delay / 1000).toFixed(1)}s (attempt ${attempt + 1}/${RETRIES + 1}): ${message}`);
        await sleep(delay);
      }
    }
  };
}

// ───────────────────────── main ─────────────────────────

async function listBucketsCommand() {
  const buckets = await fetchBuckets();
  if (!buckets.length) { console.log('This key can see no buckets.'); return; }
  const w = Math.max(...buckets.map((b) => b.Name.length));
  for (const b of buckets) {
    const region = b.BucketRegion ?? (await detectBucketRegion(b.Name).catch(() => null)) ?? '?';
    console.log(`${b.Name.padEnd(w)}  ${region.padEnd(15)}  created ${b.CreationDate?.toISOString().slice(0, 10) ?? '?'}`);
  }
}

async function lsCommand() {
  let bucket = args.bucket;
  let region = null;
  if (!bucket) {
    const prompt = createPrompter();
    const picked = await pickBucket(prompt);
    prompt.close();
    bucket = picked.name;
    region = picked.region;
  }
  const { client } = await bucketClient(bucket, args.region ?? region);
  const prefix = normalizePrefix(args.prefix);
  const recursive = args.recursive;

  // Quietly stop when piped into `head` etc.
  process.stdout.on('error', (err) => { if (err.code === 'EPIPE') process.exit(0); });

  console.log(`s3://${bucket}/${prefix}${recursive ? '   (recursive)' : ''}\n`);
  let files = 0;
  let size = 0;
  let dirs = 0;
  const pages = paginateListObjectsV2(
    { client, pageSize: 1000 },
    { Bucket: bucket, Prefix: prefix, ...(!recursive && { Delimiter: '/' }) },
  );
  for await (const page of pages) {
    for (const p of page.CommonPrefixes ?? []) {
      dirs++;
      console.log(`  ${''.padEnd(16)}  ${'DIR'.padStart(9)}  ${p.Prefix.slice(prefix.length)}`);
    }
    for (const o of page.Contents ?? []) {
      if (o.Key === prefix) continue; // the folder placeholder itself
      files++;
      size += o.Size ?? 0;
      const date = o.LastModified?.toISOString().slice(0, 16).replace('T', ' ') ?? '';
      console.log(`  ${date.padEnd(16)}  ${fmtBytes(o.Size ?? 0).padStart(9)}  ${o.Key.slice(prefix.length)}`);
    }
  }
  console.log(`\n${num(files)} file(s), ${fmtBytes(size)}` +
    `${recursive ? '' : ` · ${num(dirs)} folder(s) — add --recursive to include everything inside them`}`);
}

/**
 * --rollback: undo what this script did in the folder. Works from what is in S3
 * (not from local logs), so it also covers crashed or partial runs.
 */
async function rollbackCommand({ s3, bucket, prefix, S, prompt, resetJob }) {
  const suffix = S.backupSuffix ?? args['backup-suffix'] ?? '-original';
  const where = `s3://${bucket}/${prefix}`;
  log.info(`\nRollback of ${where}: looking for files this script created ...`);

  const head = async (key) => {
    try {
      return await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    } catch (err) {
      if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound') return null;
      throw err;
    }
  };

  // 1. Everything in the folder (key -> size/etag).
  const objects = new Map();
  for await (const page of paginateListObjectsV2({ client: s3, pageSize: 1000 }, { Bucket: bucket, Prefix: prefix })) {
    for (const o of page.Contents ?? []) {
      if (!o.Key.endsWith('/')) objects.set(o.Key, { size: o.Size ?? 0, etag: o.ETag });
    }
  }

  // 2. Plan, using the markers the converter writes into each file's metadata.
  const plan = { restore: [], unusedBackups: [], copies: [], leave: [] };
  const backups = [...objects.keys()].filter((k) => isBackupKey(k, suffix));
  await runPool(backups, 16, async (bak) => {
    const main = mainKeyForBackup(bak, suffix);
    const cur = await head(main);
    if (!cur) {
      plan.leave.push({ key: main, why: `no longer exists (deleted after conversion?); backup ${bak} kept` });
    } else if (decodeURIComponent(cur.Metadata?.['original-backup'] ?? '') === bak) {
      plan.restore.push({ main, bak, mainEtag: cur.ETag, bakEtag: objects.get(bak).etag, size: objects.get(bak).size });
    } else if (cur.ETag === objects.get(bak).etag) {
      plan.unusedBackups.push(bak); // the image was never overwritten
    } else {
      plan.leave.push({ key: main, why: `changed after the conversion (new upload?); left as is, backup ${bak} kept` });
    }
  });
  const candidates = [...objects.keys()].filter((k) => !isBackupKey(k, suffix) && (isVariantKey(k) || extOf(k) === 'webp'));
  await runPool(candidates, 16, async (key) => {
    const h = await head(key);
    if (!h) return;
    if (h.Metadata?.['size-of']) {
      plan.copies.push(key);
    } else if (h.Metadata?.['original-key']) {
      const orig = decodeURIComponent(h.Metadata['original-key']);
      if (objects.has(orig)) plan.copies.push(key);
      else plan.leave.push({ key, why: `its original ${orig} was deleted (--delete-original); webp kept` });
    }
  });

  // 3. Show the plan.
  log.info(`\nRollback plan for ${where}:`);
  log.info(`  restore from backup:     ${num(plan.restore.length)} image(s)` +
    (plan.restore.length ? `  (e.g. ${plan.restore[0].main.slice(prefix.length)} <- ${plan.restore[0].bak.slice(prefix.length)})` : ''));
  log.info(`  remove unused backups:   ${num(plan.unusedBackups.length)}`);
  log.info(`  delete copies we made:   ${num(plan.copies.length)} (.webp files and size copies)`);
  if (plan.leave.length) {
    log.warn(`  leave alone:             ${num(plan.leave.length)}`);
    for (const l of plan.leave.slice(0, 10)) log.warn(`      ${l.key.slice(prefix.length)}: ${l.why}`);
    if (plan.leave.length > 10) log.warn(`      ... and ${num(plan.leave.length - 10)} more (see run.log)`);
    for (const l of plan.leave.slice(10)) fs.writeSync(log.fd, `${new Date().toISOString()} WARN  leave ${l.key}: ${l.why}\n`);
  }
  if (S.keepExt && !S.backupSuffix) {
    log.warn('  note: this job used --keep-ext (no backups), so images converted in place cannot be restored.');
  }

  const total = plan.restore.length + plan.unusedBackups.length + plan.copies.length;
  if (!total) { log.info('\nNothing to roll back.'); prompt?.close(); return; }
  if (args['dry-run']) { log.info('\nDry run: nothing was changed.'); prompt?.close(); return; }

  if (!args.yes) {
    if (!prompt && !process.stdin.isTTY) throw new Error('Not running in a terminal: add --yes to confirm the rollback.');
    prompt ??= createPrompter();
    const a = await prompt.ask(`\nType "yes" to roll back ${where}: `);
    if (a.toLowerCase() !== 'yes') { log.info('Cancelled: nothing was changed.'); prompt.close(); return; }
  }
  prompt?.close();

  // 4. Do it. Restores first; a backup is only removed after its image is verified.
  const r = { restored: 0, backupsRemoved: 0, copiesDeleted: 0, failed: 0 };
  await runPool(plan.restore, CONCURRENCY, async (x) => {
    try {
      await s3.send(new CopyObjectCommand({
        Bucket: bucket,
        Key: x.main,
        CopySource: copySource(bucket, x.bak),
        CopySourceIfMatch: x.bakEtag,
        // Refuse if the app replaced the image since we looked (never overwrite a new upload).
        ...(!args.endpoint && { IfMatch: x.mainEtag }),
        ...(S.acl && { ACL: S.acl }),
      }));
      const check = await head(x.main);
      if (!check || check.ContentLength !== x.size || check.Metadata?.['original-backup']) {
        throw new Error('restored image could not be verified; backup kept');
      }
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: x.bak }));
      r.restored++;
      log.info(`restored  ${x.main}  (from ${x.bak.slice(x.bak.lastIndexOf('/') + 1)}, ${fmtBytes(x.size)})`);
    } catch (err) {
      r.failed++;
      const why = err?.name === 'PreconditionFailed' ? 'the app replaced this image meanwhile; left as is' : explainError(err);
      log.error(`FAIL      ${x.main}: ${why} (backup kept)`);
    }
  });

  const deleteMany = async (keys, label, counter) => {
    for (let i = 0; i < keys.length; i += 1000) {
      const batch = keys.slice(i, i + 1000);
      try {
        const res = await s3.send(new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
        }));
        const bad = new Set((res.Errors ?? []).map((e) => e.Key));
        for (const e of res.Errors ?? []) { r.failed++; log.error(`FAIL      delete ${e.Key}: ${e.Code} ${e.Message ?? ''}`); }
        for (const k of batch) if (!bad.has(k)) { r[counter]++; fs.writeSync(log.fd, `${new Date().toISOString()} INFO  deleted ${label} ${k}\n`); }
      } catch (err) {
        r.failed += batch.length;
        log.error(`FAIL      deleting ${batch.length} ${label}(s): ${explainError(err)}`);
      }
    }
    if (keys.length) log.info(`deleted   ${num(r[counter])} ${label}(s)`);
  };
  await deleteMany(plan.unusedBackups, 'unused backup', 'backupsRemoved');
  await deleteMany(plan.copies, 'copy', 'copiesDeleted');

  // 5. Forget the job's progress so the next run starts clean.
  const hist = resetJob();
  log.info(`\nRollback finished: ${num(r.restored)} restored, ${num(r.backupsRemoved)} unused backups removed, ` +
    `${num(r.copiesDeleted)} copies deleted, ${num(r.failed)} failed`);
  if (hist) log.info(`The job's progress was reset (kept in ${hist}); the next run starts from scratch.`);
  if (r.failed) {
    log.info('Run --rollback again to retry the failed ones.');
    process.exitCode = 1;
  }
}

async function main() {
  if (args.help) {
    const src = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
    console.log(src.slice(src.indexOf('/**') + 3, src.indexOf('*/')).replace(/^ \* ?/gm, ''));
    return;
  }
  if (args['list-buckets']) { await listBucketsCommand(); return; }
  if (args.ls) { await lsCommand(); return; }

  // 1. Which bucket + folder?
  let bucket = args.bucket;
  let prefix = normalizePrefix(args.prefix);
  let region = null;
  let prompt = null;

  if (!bucket) {
    prompt = createPrompter();
    const job = await pickUnfinishedJob(prompt);
    if (job) {
      ({ bucket, prefix, region } = job);
    } else {
      const picked = await pickBucket(prompt);
      bucket = picked.name;
      const { client, region: r } = await bucketClient(bucket, args.region ?? picked.region);
      region = r;
      prefix = await browseFolders(client, bucket, prompt);
    }
  }

  // 2. Job folder
  const dir = jobDirFor(bucket, prefix);
  fs.mkdirSync(dir, { recursive: true });
  log.attach(path.join(dir, 'run.log'));

  const jobFile = path.join(dir, 'job.json');
  const manifestPath = path.join(dir, 'manifest.jsonl');
  const progressPath = path.join(dir, 'progress.jsonl');
  const failedPath = path.join(dir, 'failed.txt');
  const saved = readJson(jobFile);
  const job = saved ?? {
    version: 1,
    bucket,
    prefix,
    endpoint: args.endpoint ?? null,
    pathStyle: args['path-style'],
    region: null,
    settings: {},
    createdAt: new Date().toISOString(),
  };

  /** Start the job over: keep settings + run.log, move old progress into history/. */
  const startOver = () => {
    const hist = path.join(dir, 'history', new Date().toISOString().replace(/[:.]/g, '-'));
    for (const f of [manifestPath, progressPath, failedPath]) {
      if (!fs.existsSync(f)) continue;
      fs.mkdirSync(hist, { recursive: true });
      fs.renameSync(f, path.join(hist, path.basename(f)));
    }
    delete job.scan;
    delete job.status;
    return fs.existsSync(hist) ? path.relative(process.cwd(), hist) : null;
  };
  let freshNote = null;
  if (args.fresh && saved) {
    const hist = startOver();
    freshNote = `Starting this job over${hist ? ` (previous progress kept in ${hist})` : ''}`;
  }
  const resuming = Boolean(job.scan);

  // 3. Settings: defaults < saved with the job < flags passed now
  const cli = cliSettings();
  for (const [k, v] of Object.entries(cli)) {
    if (resuming && k in job.settings && JSON.stringify(job.settings[k]) !== JSON.stringify(v)) {
      log.warn(`Setting "${k}" changed from ${JSON.stringify(job.settings[k])} to ${JSON.stringify(v)} — ` +
        'images converted earlier keep the old setting.');
    }
  }
  const S = { ...DEFAULT_SETTINGS, ...job.settings, ...cli };
  if (S.backupSuffix && S.deleteOriginal) {
    throw new Error('--replace and --delete-original cannot be combined (the backup IS the original).');
  }
  job.settings = S;
  const exts = new Set(S.ext.split(',').map((e) => e.trim().toLowerCase().replace(/^\./, '')).filter(Boolean));

  // 4. S3 client for the bucket (region auto-detected once, then remembered)
  const { client: s3, region: bucketRegion } = await bucketClient(bucket, args.region ?? region ?? job.region);
  job.region = bucketRegion;
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch (err) {
    throw new Error(`Cannot access bucket "${bucket}": ${explainError(err)}`);
  }

  const runStarted = new Date();
  log.info(`\n════ run started ${runStarted.toISOString()} ════`);
  log.info(`Job:      s3://${bucket}/${prefix}   (region ${bucketRegion})`);
  log.info(`Job dir:  ${dir}`);
  log.info(`Settings: quality ${S.quality} · max-width ${S.maxWidth ?? 'none'} · ` +
    `sizes ${S.sizes?.length ? S.sizes.map((w) => `${w}w`).join(',') : 'none'} · ` +
    `${S.backupSuffix ? `replace in place, original backed up as <name>${S.backupSuffix}.<ext> (--replace)`
      : S.keepExt ? 'overwrite in place (--keep-ext)' : 'write .webp next to original'} · ` +
    `${S.deleteOriginal ? 'DELETE originals' : 'keep originals'} · ` +
    `${S.allowLarger ? 'upload even if larger' : 'skip if larger'}${S.acl ? ` · acl ${S.acl}` : ''} · ` +
    `ext ${[...exts].join(',')}`);
  if (freshNote) log.info(freshNote);

  // Versioning is the real safety net: with it, any overwrite or delete can be undone in S3.
  let versioning = 'unknown (no permission to check)';
  try {
    const v = await s3.send(new GetBucketVersioningCommand({ Bucket: bucket }));
    versioning = v.Status ?? 'off';
  } catch { /* keep unknown */ }
  log.info(`Versioning: ${versioning}` +
    (versioning !== 'Enabled' && !args.rollback ? ' (tip: with bucket versioning on, every change can also be undone in S3)' : ''));

  const node = ['node', ...process.execArgv.filter((a) => a.startsWith('--env-file'))].join(' ');
  const script = path.relative(process.cwd(), fileURLToPath(import.meta.url)) || 's3-to-webp.mjs';
  const resumeCmd = `${node} ${script} --bucket ${shq(bucket)}${prefix ? ` --prefix ${shq(prefix)}` : ''}` +
    `${args.endpoint ? ` --endpoint ${shq(args.endpoint)}` : ''}${args['path-style'] ? ' --path-style' : ''}`;

  if (args.rollback) {
    await rollbackCommand({
      s3, bucket, prefix, S, prompt,
      resetJob: () => { const hist = startOver(); writeJson(jobFile, job); return hist; },
    });
    return;
  }

  let progress;
  let c;
  let confirmed = false;
  const saveStatus = (finished = false) => {
    job.status = {
      total: c.total,
      completed: c.completed,
      remaining: c.total - c.completed,
      failed: c.failed,
      invalid: c.invalid,
      totalBytes: c.totalBytes,
      completedBytes: c.completedBytes,
      updatedAt: new Date().toISOString(),
      ...(finished && { lastRunEnded: new Date().toISOString() }),
    };
    writeJson(jobFile, job);
  };

  for (;;) {
    // 5. Scan (once per job; --rescan to refresh)
    if (!fs.existsSync(manifestPath) || args.rescan) {
      log.info(`Scanning s3://${bucket}/${prefix} ...`);
      const skipLabel = (key) => (S.backupSuffix && isBackupKey(key, S.backupSuffix) ? 'backup copies'
        : S.sizes?.length && isVariantKey(key) ? 'size copies' : null);
      job.scan = await scanToManifest(s3, bucket, prefix, exts, manifestPath, skipLabel);
      log.info(`Scan: ${num(job.scan.count)} images, ${fmtBytes(job.scan.bytes)} (${fmtCounts(job.scan.byExt) || 'none'})`);
      const ignoredTotal = Object.values(job.scan.ignored).reduce((a, b) => a + b, 0);
      if (ignoredTotal) log.info(`        ${num(ignoredTotal)} other files ignored (${fmtCounts(job.scan.ignored)})`);
    } else {
      log.info(`Using scan from ${job.scan.at}: ${num(job.scan.count)} images, ${fmtBytes(job.scan.bytes)} (--rescan to refresh)`);
    }
    writeJson(jobFile, job);

    // 6. What's left?
    progress = new ProgressStore(progressPath);
    await progress.load();

    c = { total: 0, totalBytes: 0, completed: 0, completedBytes: 0, failed: 0, invalid: 0 };
    for await (const { k, s } of readJsonl(manifestPath)) {
      c.total++;
      c.totalBytes += s;
      const st = progress.status(k);
      if (isFinished(st)) { c.completed++; c.completedBytes += s; }
      if (st === 'failed') c.failed++;
      if (st === 'invalid') c.invalid++;
    }
    log.info(`Status:   ${num(c.completed)} of ${num(c.total)} finished (${pct(c.completed, c.total)}%) · ` +
      `${num(c.total - c.completed)} to go (${fmtBytes(c.totalBytes - c.completedBytes)})` +
      `${c.failed ? ` · ${num(c.failed)} failed earlier (will retry)` : ''}` +
      `${c.invalid ? ` · ${num(c.invalid)} invalid${RETRY_FAILED ? ' (retrying)' : ' (skipped; --retry-failed to retry)'}` : ''}`);
    saveStatus();

    if (c.total - c.completed > 0) break;

    // Nothing left: offer to start over instead of making the user delete the job folder.
    log.info('\nThis job is complete: every image found by the scan has been handled.');
    if (!args['dry-run'] && (prompt || process.stdin.isTTY)) {
      prompt ??= createPrompter();
      const a = await prompt.ask('Run it again from the start? The folder is re-scanned and ' +
        'already-converted images are detected and skipped. [y/N]: ');
      if (/^y(es)?$/i.test(a)) {
        const hist = startOver();
        log.info(`Starting this job over${hist ? ` (previous progress kept in ${hist})` : ''}\n`);
        confirmed = true;
        continue;
      }
    }
    log.info(`To run it again from the start:        ${resumeCmd} --fresh`);
    log.info(`To only pick up images added since:    ${resumeCmd} --rescan`);
    prompt?.close();
    return;
  }

  const remaining = c.total - c.completed;
  log.info(`Resume:   ${resumeCmd}`);
  if (args['dry-run']) { log.info('\nDry run: nothing was changed.'); prompt?.close(); return; }

  if (prompt && !args.yes && !confirmed) {
    const warn = S.deleteOriginal ? ' Originals will be DELETED after conversion.' : '';
    const a = await prompt.ask(`\nStart converting ${num(remaining)} images?${warn} [y/N]: `);
    if (!/^y(es)?$/i.test(a)) { log.info('Cancelled.'); prompt.close(); return; }
  }
  prompt?.close();

  // 7. Convert
  sharp.cache(false);
  const state = { stopping: false, hardStop: false, active: new Set(), consecutiveFailures: 0 };
  const run = { ok: 0, sized: 0, skipped: 0, failed: 0, invalid: 0, bytesIn: 0, bytesOut: 0, sizeBytes: 0, processedBytes: 0, started: Date.now() };
  const convert = createConverter({ s3, bucket, S, state });
  progress.open();

  const onSignal = () => {
    state.signalled = true;
    if (!state.stopping) {
      state.stopping = true;
      log.warn(`\nStopping: letting ${state.active.size} in-flight image(s) finish. Press Ctrl+C again to abort them now.`);
      return;
    }
    if (state.hardStop) return;
    state.hardStop = true;
    log.warn('Aborting in-flight uploads...');
    setTimeout(() => process.exit(130), 10_000).unref();
    Promise.allSettled([...state.active].map((h) => h.abort())).finally(() => {
      saveStatus(true);
      log.warn(`Aborted. Progress is saved — resume with:\n  ${resumeCmd}`);
      process.exit(130);
    });
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  const statusLine = () => {
    const elapsed = (Date.now() - run.started) / 1000;
    const rate = run.processedBytes / Math.max(elapsed, 1);
    const left = c.totalBytes - c.completedBytes;
    log.info(`── ${num(c.completed)}/${num(c.total)} (${pct(c.completed, c.total)}%) · ` +
      `${fmtBytes(c.completedBytes)} of ${fmtBytes(c.totalBytes)} · ${fmtBytes(rate)}/s · ` +
      `ETA ${rate > 0 ? fmtDuration(left / rate) : '?'} · this run: ${num(run.ok + run.sized)} ok, ${num(run.skipped)} skipped, ` +
      `${num(run.failed)} failed, ${num(run.invalid)} invalid · elapsed ${fmtDuration(elapsed)}`);
  };
  const ticker = setInterval(() => { statusLine(); saveStatus(); }, STATUS_EVERY_MS);

  async function* pending() {
    for await (const { k, s } of readJsonl(manifestPath)) {
      if (state.stopping) return;
      if (!isFinished(progress.status(k))) yield { key: k, size: s };
    }
  }

  function finish(item, r, ms) {
    const prev = progress.status(item.key);
    progress.record(item.key, r, ms);

    if (prev === 'failed') c.failed--;
    if (prev === 'invalid') c.invalid--;
    if (r.st === 'failed') c.failed++;
    if (r.st === 'invalid') c.invalid++;
    if (r.st !== 'failed') { c.completed++; c.completedBytes += item.size; run.processedBytes += item.size; }

    const p = `[${pct(c.completed, c.total).padStart(5)}%]`;
    const sz = r.sizes?.length ? ` + sizes ${r.sizes.map((w) => `${w}w`).join(',')} (${fmtBytes(r.vout)})` : '';
    run.sizeBytes += r.vout ?? 0;
    if (r.st === 'done' && r.onlySizes) {
      run.sized++;
      log.info(`${p} ok     ${item.key}${sz || ' (nothing new)'} [${r.reason}] ${(ms / 1000).toFixed(1)}s`);
    } else if (r.st === 'done') {
      run.ok++;
      run.bytesIn += r.in ?? 0;
      run.bytesOut += r.out ?? 0;
      const saved = r.in ? Math.round((1 - r.out / r.in) * 100) : 0;
      const where = r.backup ? `(now webp, backup ${r.backup.slice(r.backup.lastIndexOf('/') + 1)})` : `-> ${r.to}`;
      log.info(`${p} ok     ${item.key} ${where}  ${fmtBytes(r.in)} -> ${fmtBytes(r.out)} ` +
        `(${saved >= 0 ? '-' : '+'}${Math.abs(saved)}%)${sz} ${(ms / 1000).toFixed(1)}s` +
        `${S.deleteOriginal ? ' [original deleted]' : ''}${r.reason ? ` [${r.reason}]` : ''}`);
    } else if (r.st === 'skipped') {
      run.skipped++;
      log.info(`${p} skip   ${item.key} (${r.reason})${sz}`);
    } else if (r.st === 'invalid') {
      run.invalid++;
      log.error(`${p} BAD    ${item.key}: ${r.err}`);
    } else {
      run.failed++;
      log.error(`${p} FAIL   ${item.key} after ${r.attempts} attempt(s): ${r.err}`);
    }

    if (r.st === 'failed') {
      state.consecutiveFailures++;
      if (state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES && !state.stopping) {
        state.stopping = true;
        log.error(`\n${state.consecutiveFailures} failures in a row — stopping this run. ` +
          `Check the network / key permissions, then resume with:\n  ${resumeCmd}`);
      }
    } else {
      state.consecutiveFailures = 0;
    }
  }

  async function worker(source) {
    for await (const item of source) {
      const t0 = Date.now();
      const r = await convert(item);
      if (r.st === 'aborted' || state.hardStop) return; // not recorded: redone on resume
      finish(item, r, Date.now() - t0);
    }
  }

  log.info(`\nConverting with concurrency ${CONCURRENCY} (Ctrl+C to stop safely)\n`);
  const source = pending();
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(source)));
  clearInterval(ticker);
  if (state.hardStop) return; // the signal handler exits

  // 8. Wrap up
  const failedLines = [];
  for (const [k, v] of progress.map) {
    if (v.st === 'failed' || v.st === 'invalid') failedLines.push(`${v.st}\t${k}\t${v.err ?? ''}`);
  }
  if (failedLines.length) fs.writeFileSync(failedPath, `${failedLines.join('\n')}\n`);
  else fs.rmSync(failedPath, { force: true });
  saveStatus(true);

  statusLine();
  const savedPct = run.bytesIn ? Math.round((1 - run.bytesOut / run.bytesIn) * 100) : 0;
  log.info(`\nRun finished: ${num(run.ok)} converted${run.sized ? `, ${num(run.sized)} got new sizes only` : ''}, ` +
    `${num(run.skipped)} skipped, ${num(run.failed)} failed, ` +
    `${num(run.invalid)} invalid` +
    (run.bytesIn ? ` · ${fmtBytes(run.bytesIn)} -> ${fmtBytes(run.bytesOut)} (${savedPct >= 0 ? '-' : '+'}${Math.abs(savedPct)}%)` : '') +
    (run.sizeBytes ? ` · size copies ${fmtBytes(run.sizeBytes)}` : ''));

  const left = c.total - c.completed;
  if (left === 0 && c.invalid === 0) {
    log.info('Job complete.');
  } else {
    if (failedLines.length) log.info(`Problem files listed in ${failedPath}`);
    if (left > 0) log.info(`${num(left)} image(s) still to do. Resume with:\n  ${resumeCmd}`);
    process.exitCode = 1;
  }
  if (state.signalled && left > 0) process.exitCode = 130;
}

main().catch((err) => {
  log.error(`Error: ${explainError(err)}`);
  process.exit(1);
});
