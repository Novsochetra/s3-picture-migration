# s3-to-webp

Convert the pictures in an S3 bucket to WebP, resumably and reversibly, and set up a test folder to
try it on first.

## Setup

```bash
npm install
cp env.example .env
```

Then fill in `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in `.env`. Each bucket's region is
found on its own; S3-compatible services work with `--endpoint` (and `--path-style` for MinIO).

For production, put the prod keys in `.env.prod` (`cp env.example .env.prod`) and run
`npm run convert:prod -- …` or `npm run create-folder:prod -- …`. A run started with `.env.prod`
opens with `INFO  PRODUCTION: keys from .env.prod, every change goes to prod.`

## Try it on a test folder

```bash
npm run create-folder -- --bucket my-bucket --copy-from "raw/partner/123/profile"
npm run convert -- --bucket my-bucket --prefix "raw/partner/sochetra-image-migration/profile/" --replace --sizes 320,640,1080
npm run convert -- --bucket my-bucket --prefix "raw/partner/sochetra-image-migration/profile/" --rollback
```

## Convert

```bash
npm run convert
npm run convert -- --bucket my-bucket --prefix raw/2024/
```

With no `--bucket`, a menu picks a job, a bucket and a folder. Every bucket + folder is a job in
`./s3-webp-jobs/`; run the same command again to resume. `npm run convert -- --help` and
`npm run create-folder -- --help` list every flag.

## Develop

Read `CLAUDE.md` (rules and layout) and `docs/architecture.md`. `npm run check` runs lint,
formatting and every test, and runs before each commit.
