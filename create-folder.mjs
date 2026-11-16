#!/usr/bin/env node
/**
 * create-folder.mjs — set up the migration test folder in S3 and fill it with
 * original images.
 *
 * Default folder: raw/partner/sochetra-image-migration/profile/
 *
 *   # create the folder
 *   node --env-file=.env create-folder.mjs --bucket my-bucket
 *
 *   # upload originals from your computer (files and/or folders; repeat --upload)
 *   node --env-file=.env create-folder.mjs --bucket my-bucket --upload ./originals --upload ./cover.jpg
 *
 *   # copy originals that are already in the bucket (server-side, nothing is downloaded)
 *   node --env-file=.env create-folder.mjs --bucket my-bucket --copy-from "raw/partner/123/profile"
 *   node --env-file=.env create-folder.mjs --bucket my-bucket --copy-from "raw/partner/123/profile/avatar.jpg"
 *
 *   # empty the folder (ONLY allowed for raw/partner/sochetra-image-migration/profile/)
 *   node --env-file=.env create-folder.mjs --bucket my-bucket --empty
 *
 *   # reset + reload in one go: empty first, then copy fresh originals in
 *   node --env-file=.env create-folder.mjs --bucket my-bucket --empty --copy-from "raw/partner/123/profile"
 *
 * Options:
 *   --bucket <name>       Bucket (default: BUCKET_NAME from the environment / .env)
 *   --path <folder>       Folder to work on (default: raw/partner/sochetra-image-migration/profile)
 *   --upload <path>       Local file or folder to upload into the folder (repeatable)
 *   --copy-from <s3path>  Folder or single file in the same bucket to copy in (repeatable)
 *   --empty               Delete everything inside the folder; the folder itself stays
 *   --overwrite           Re-upload / re-copy files that are already there with the same size
 *   -y, --yes             Don't ask before emptying (required when not run in a terminal)
 *   --region <r>          Optional; the bucket's region is found automatically
 *   --endpoint <url>      S3-compatible endpoint (Spaces, R2, MinIO...)
 *   --path-style          Path-style URLs (MinIO and some others need this)
 */

import { parseArgs } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import {
  S3Client,
  PutObjectCommand,
  CopyObjectCommand,
  DeleteObjectsCommand,
  paginateListObjectsV2,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

// --empty refuses to touch anything outside this folder.
const EMPTY_ALLOWED_IN = 'raw/partner/sochetra-image-migration/profile/';
const CONCURRENCY = 4;
const MAX_COPY_BYTES = 5 * 1024 ** 3; // CopyObject limit

const CONTENT_TYPES = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  tif: 'image/tiff', tiff: 'image/tiff', bmp: 'image/bmp', avif: 'image/avif',
  heic: 'image/heic', heif: 'image/heif', svg: 'image/svg+xml',
};

const { values: args } = parseArgs({
  options: {
    bucket: { type: 'string', default: process.env.BUCKET_NAME },
    path: { type: 'string', default: EMPTY_ALLOWED_IN },
    upload: { type: 'string', multiple: true, default: [] },
    'copy-from': { type: 'string', multiple: true, default: [] },
    empty: { type: 'boolean', default: false },
    overwrite: { type: 'boolean', default: false },
    yes: { type: 'boolean', short: 'y', default: false },
    region: { type: 'string' },
    endpoint: { type: 'string' },
    'path-style': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (args.help) {
  const src = fs.readFileSync(new URL(import.meta.url), 'utf8');
  console.log(src.slice(src.indexOf('/**') + 3, src.indexOf('*/')).replace(/^ \* ?/gm, ''));
  process.exit(0);
}
if (!args.bucket) {
  console.error('Missing bucket: pass --bucket <name> or set BUCKET_NAME in .env');
  process.exit(1);
}

const toFolder = (p) => `${p.replace(/^\/+/, '').replace(/\/+$/, '')}/`; // "a/b" -> "a/b/"
const bucket = args.bucket;
const folder = toFolder(args.path);
if (folder === '/') {
  console.error('--path cannot be empty');
  process.exit(1);
}

const s3 = new S3Client({
  region: args.region || process.env.AWS_REGION || 'us-east-1',
  followRegionRedirects: true, // works for a bucket in any region with just the two keys
  ...(args.endpoint && { endpoint: args.endpoint }),
  ...(args['path-style'] && { forcePathStyle: true }),
});

// ───────── helpers ─────────

function fmtBytes(n) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n ?? 0;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return i === 0 ? `${v} B` : `${v.toFixed(v < 10 ? 2 : 1)} ${units[i]}`;
}

const extOf = (name) => {
  const base = name.slice(name.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
};

/** key -> size for everything under a prefix */
async function listAll(prefix) {
  const out = new Map();
  for await (const page of paginateListObjectsV2({ client: s3, pageSize: 1000 }, { Bucket: bucket, Prefix: prefix })) {
    for (const o of page.Contents ?? []) out.set(o.Key, o.Size ?? 0);
  }
  return out;
}

/** Run fn over items with at most `limit` in flight. */
async function runPool(items, limit, fn) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]);
  });
  await Promise.all(workers);
}

/** Local files under a file/folder path, skipping hidden files like .DS_Store */
function localFiles(input) {
  const abs = path.resolve(input);
  if (!fs.existsSync(abs)) throw new Error(`--upload: not found: ${input}`);
  if (fs.statSync(abs).isFile()) return [{ abs, rel: path.basename(abs) }];
  const out = [];
  const walk = (dir) => {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      if (d.name.startsWith('.')) continue;
      const p = path.join(dir, d.name);
      if (d.isDirectory()) walk(p);
      else if (d.isFile()) out.push({ abs: p, rel: path.relative(abs, p).split(path.sep).join('/') });
    }
  };
  walk(abs);
  return out;
}

const copySource = (key) => `${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;

const stats = { uploaded: 0, copied: 0, skipped: 0, deleted: 0, failed: 0, bytes: 0 };

// ───────── steps ─────────

async function emptyFolder(existing) {
  if (!folder.startsWith(EMPTY_ALLOWED_IN)) {
    throw new Error(`--empty only works inside s3://${bucket}/${EMPTY_ALLOWED_IN}\n` +
      `       Refusing to empty s3://${bucket}/${folder}`);
  }
  const keys = [...existing.keys()].filter((k) => k !== folder && k.startsWith(folder));
  if (!keys.length) {
    console.log(`Already empty: s3://${bucket}/${folder}`);
    return;
  }

  const total = keys.reduce((sum, k) => sum + existing.get(k), 0);
  console.log(`\nAbout to DELETE ${keys.length} object(s) (${fmtBytes(total)}) from s3://${bucket}/${folder}`);
  for (const k of keys.slice(0, 10)) console.log(`  - ${k.slice(folder.length)}`);
  if (keys.length > 10) console.log(`  ... and ${keys.length - 10} more`);

  if (!args.yes) {
    if (!process.stdin.isTTY) throw new Error('Not running in a terminal: add --yes to confirm emptying.');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question('Type "yes" to delete them: ');
    rl.close();
    if (answer.trim().toLowerCase() !== 'yes') {
      console.log('Cancelled — nothing was deleted.');
      process.exit(0);
    }
  }

  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000);
    // Second safety net: never send a key outside the allowed folder.
    if (batch.some((k) => !k.startsWith(EMPTY_ALLOWED_IN))) throw new Error('Safety check failed; nothing deleted.');
    const r = await s3.send(new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
    }));
    const failed = new Set();
    for (const e of r.Errors ?? []) {
      failed.add(e.Key);
      stats.failed++;
      console.error(`FAIL  delete ${e.Key}: ${e.Code} ${e.Message ?? ''}`);
    }
    for (const k of batch) {
      if (!failed.has(k)) { existing.delete(k); stats.deleted++; }
    }
  }
  console.log(`Deleted ${stats.deleted} object(s).`);
}

async function ensureFolder(existing) {
  if (existing.has(folder)) {
    console.log(`Folder exists: s3://${bucket}/${folder}`);
    return;
  }
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: folder, Body: '', ContentLength: 0 }));
  existing.set(folder, 0);
  console.log(`Created folder: s3://${bucket}/${folder}`);
}

async function uploadLocal(existing) {
  const files = args.upload.flatMap(localFiles);
  if (!files.length) return;
  console.log(`\nUploading ${files.length} local file(s)...`);
  await runPool(files, CONCURRENCY, async ({ abs, rel }) => {
    const key = folder + rel;
    const size = fs.statSync(abs).size;
    if (!args.overwrite && existing.get(key) === size) {
      stats.skipped++;
      console.log(`skip      ${rel} (already there)`);
      return;
    }
    try {
      await new Upload({
        client: s3,
        params: {
          Bucket: bucket,
          Key: key,
          Body: fs.createReadStream(abs),
          ContentType: CONTENT_TYPES[extOf(rel)] ?? 'application/octet-stream',
        },
      }).done();
      existing.set(key, size);
      stats.uploaded++;
      stats.bytes += size;
      console.log(`uploaded  ${path.relative(process.cwd(), abs)} -> ${key} (${fmtBytes(size)})`);
    } catch (err) {
      stats.failed++;
      console.error(`FAIL      ${abs}: ${err.name}: ${err.message}`);
    }
  });
}

async function copyFromBucket(existing) {
  for (const raw of args['copy-from']) {
    const src = raw.replace(/^\/+/, '');
    const looksLikeFile = !src.endsWith('/') && extOf(src) !== '';

    let sources;
    if (looksLikeFile) {
      const found = await listAll(src);
      if (!found.has(src)) {
        stats.failed++;
        console.error(`FAIL      --copy-from: no such file s3://${bucket}/${src}`);
        continue;
      }
      sources = [{ key: src, size: found.get(src), rel: src.slice(src.lastIndexOf('/') + 1) }];
    } else {
      const srcFolder = toFolder(src);
      if (folder.startsWith(srcFolder) || srcFolder.startsWith(folder)) {
        stats.failed++;
        console.error(`FAIL      --copy-from ${srcFolder} overlaps the target folder ${folder}; skipped`);
        continue;
      }
      const found = await listAll(srcFolder);
      sources = [...found]
        .filter(([key]) => !key.endsWith('/')) // folder placeholders
        .map(([key, size]) => ({ key, size, rel: key.slice(srcFolder.length) }));
      if (!sources.length) {
        console.log(`\nNothing to copy in s3://${bucket}/${srcFolder}`);
        continue;
      }
    }

    console.log(`\nCopying ${sources.length} file(s) from s3://${bucket}/${looksLikeFile ? src : toFolder(src)} ...`);
    await runPool(sources, CONCURRENCY, async ({ key, size, rel }) => {
      const dest = folder + rel;
      if (dest === key) return;
      if (!args.overwrite && existing.get(dest) === size) {
        stats.skipped++;
        console.log(`skip      ${rel} (already there)`);
        return;
      }
      if (size > MAX_COPY_BYTES) {
        stats.failed++;
        console.error(`FAIL      ${key}: larger than 5 GB, cannot be copied in one request`);
        return;
      }
      try {
        // Server-side copy: keeps Content-Type and metadata, nothing goes through this machine.
        await s3.send(new CopyObjectCommand({ Bucket: bucket, Key: dest, CopySource: copySource(key) }));
        existing.set(dest, size);
        stats.copied++;
        stats.bytes += size;
        console.log(`copied    ${key} -> ${dest} (${fmtBytes(size)})`);
      } catch (err) {
        stats.failed++;
        console.error(`FAIL      ${key}: ${err.name}: ${err.message}`);
      }
    });
  }
}

async function main() {
  const existing = await listAll(folder); // one listing, reused by every step

  if (args.empty) await emptyFolder(existing);
  await ensureFolder(existing);
  await uploadLocal(existing);
  await copyFromBucket(existing);

  const files = [...existing.keys()].filter((k) => k !== folder);
  const total = files.reduce((sum, k) => sum + existing.get(k), 0);
  console.log(`\nDone. ${stats.uploaded} uploaded, ${stats.copied} copied, ${stats.skipped} skipped, ` +
    `${stats.deleted} deleted, ${stats.failed} failed`);
  console.log(`s3://${bucket}/${folder} now holds ${files.length} file(s), ${fmtBytes(total)}`);
  if (files.length) {
    // The WebP script remembers what it already did for this folder:
    // after emptying, start its job over; after adding files, re-list the folder.
    const flag = stats.deleted ? '--fresh' : '--rescan';
    console.log(`\nConvert them to WebP:\n  node --env-file=.env s3-to-webp.mjs --bucket ${bucket} --prefix "${folder}" ${flag}`);
  }
  if (stats.failed) process.exitCode = 1;
}

main().catch((err) => {
  const msg = err?.name === 'CredentialsProviderError'
    ? 'No AWS credentials found. Put AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in .env and run with --env-file=.env'
    : err?.message ?? String(err);
  console.error(`Error: ${msg}`);
  process.exit(1);
});
