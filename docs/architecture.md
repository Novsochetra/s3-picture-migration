# Architecture

Two command-line tools over one S3 layer. `s3-to-webp` converts every image under a bucket folder to
WebP and can undo it; `create-folder` prepares a test folder of originals to try it on. Both are
plain Node ES modules, run as they are written: no build step.

```
bin/
  s3-to-webp.js         entry: runConvert(argv), exit code, errors explained
  create-folder.js      entry: runCreateFolder(argv)
src/
  utils/                format.js (bytes, durations, counts), pool.js (runPool, chunk, sleep),
                        json-files.js (atomic JSON, JSON lines that survive a crash)
  logging/              logger.js: console + the job's run.log
  cli/                  prompter.js (questions, piped or typed), integer-option.js, usage.js
  s3/                   bucket.js (the facade every request goes through), client.js, region.js
                        (finds a bucket's region from the two keys alone), buckets.js, errors.js,
                        keys.js (extension, stem, folder helpers)
  convert/              s3-to-webp
    main.js             --help, --list-buckets, --ls, then a session: --rollback or a run
    options.js          its flags and run limits; naming.js the names of backups and size copies
    settings/           defaults.js, cli-settings.js, resolve-settings.js, describe-settings.js
    job/                job-dir.js, job-files.js, progress-store.js, scan-manifest.js, tally.js
    menu/               choose-target.js over pick-job.js, pick-bucket.js, browse-folders.js
    converter/          create-converter.js (retries) over convert-plain.js and
                        replace-with-backup.js, which use fetch-buffer.js, encode-upload.js,
                        byte-counter.js and sizes.js
    run/                convert-job.js over open-session.js, prepare-work.js, confirm-start.js,
                        convert-all.js, record-result.js, wrap-up.js
    rollback/           rollback.js over plan-rollback.js, show-plan.js, apply-rollback.js
    commands/           list-buckets.js, ls.js
  create-folder/        main.js over empty-folder.js, ensure-folder.js, upload-local.js,
                        copy-from-bucket.js (copy-sources.js), summary.js
test/
  unit/ integration/ regression/   mirroring src/
  support/              memory-bucket.js (the facade over a Map), images.js, capture-log.js
tools/
  eslint-rules/         no-jsdoc-blocks, no-banner-comments
  claude-hooks/         shows Claude every comment it adds
defaults-image-files/   a sample original to upload with create-folder --upload
```

## The bucket facade

`src/s3/bucket.js` turns a client and a bucket name into the few operations the tools use: `head`
(null when missing), `open` (a download that can be aborted), `upload` (streamed, abortable),
`put`, `copy` (server side, `CopySource` encoded), `remove`, `removeMany`, `pages`, `listOnce`,
`checkAccess` and `versioning`. Nothing else sends object commands, so the tests run the real
converter, rollback and create-folder against `test/support/memory-bucket.js`, which has the same
shape and S3's conditional-write rules.

`connectBucket` (`src/s3/region.js`) finds the bucket's region (GetBucketLocation, then HeadBucket's
redirect header) so `.env` needs only the two keys; `runConvert` takes it as `connect`, which the
tests replace.

## A conversion run

1. **Target**: `--bucket`/`--prefix`, or the menu (an unfinished job, or a bucket and a folder).
2. **Session** (`run/open-session.js`): the job folder `s3-webp-jobs/<bucket>__<prefix>__<hash>/`,
   its `job.json` (settings: defaults < saved < flags), the connected bucket, the header in
   `run.log`.
3. **Work** (`run/prepare-work.js`): the scan writes `manifest.jsonl` once (`--rescan` redoes it),
   then `progress.jsonl` is read and the job tallied. A finished job offers to start over.
4. **Convert** (`run/convert-all.js`): `--concurrency` workers pull from the manifest, skipping
   finished images. Each result is appended to `progress.jsonl` at once and counted; `job.json`
   is saved every 30 s. Ctrl+C once drains, twice aborts.
5. **Wrap up** (`run/wrap-up.js`): `failed.txt`, the final status, the summary, and the exit code
   (0 done, 1 work or problems left, 130 stopped by a signal).

## Converting one image

- **Default**: `cat.jpg` → `cat.webp`, tagged `original-key`.
- **`--keep-ext`**: the WebP over `cat.jpg`, no backup.
- **`--replace`**: `cat.jpg` is copied to `cat-original.jpg` (`CopySourceIfMatch`), then the WebP is
  written over `cat.jpg` with `IfMatch`, tagged `original-backup`. If the app replaced the file
  meanwhile, S3 refuses the write and the retry starts from the new version.
- **`--sizes`**: one `-<width>w` copy per width, tagged `size-of`, never enlarged.

A WebP larger than its original is not uploaded (`byteCounter` aborts the stream) unless
`--allow-larger`. A sharp error is `invalid` (not retried); a network or S3 error is retried with
backoff, then `failed`.

## Rollback

`--rollback` works from what is in the bucket, not from local files, so it covers crashed runs too.
It plans from the metadata tags: a backup whose image still carries `original-backup` is restored
(copied back with `IfMatch`, verified, then the backup removed); a backup whose image never changed
is removed; files tagged `size-of`, or `original-key` with their original still there, are deleted;
anything the app changed since is left alone and reported.
