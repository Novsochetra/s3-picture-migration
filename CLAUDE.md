# Project rules

Two Node command-line tools for moving a bucket's pictures to WebP: `s3-to-webp` converts every
image under an S3 folder to WebP, resumably and reversibly, and `create-folder` fills a test folder
with originals to try it on. Read `docs/architecture.md` before changing structure.

## Commands

| Command                      | What it runs                                                          |
| ---------------------------- | --------------------------------------------------------------------- |
| `npm run convert -- …`       | the converter (`bin/s3-to-webp.js`) with the keys in `.env`           |
| `npm run create-folder -- …` | the test-folder tool (`bin/create-folder.js`) with the keys in `.env` |
| `npm run check`              | lint, format and every test; run it before done                       |
| `npm run lint`               | ESLint                                                                |
| `npm run format`             | Prettier, writes files                                                |
| `npm test`                   | all Vitest projects: `unit`, `integration`, `regression`              |

`npm install` points git at `.githooks/`, whose pre-commit runs `npm run check`.

## Coding

- Simplest solution that works. Small files and functions with one job each. Lint enforces size and
  complexity limits (150 lines a file, 40 lines a function, complexity 10, depth 3, 4 parameters);
  split code instead of raising limits.
- Put code where it belongs (see "Layout" below and `docs/architecture.md`). No god objects, god
  functions or god files.
- No comments that say what code does. Only write a comment to explain **why** something non-obvious
  is done (workarounds, S3 quirks, safety reasons). If deleting the comment loses nothing a reader
  can't get from the names and the code, delete it: `// the key must end with a slash` over
  `toFolder` goes; `// IfMatch makes S3 refuse the write when the app replaced the file meanwhile`
  stays.
- Lint enforces this for `/** */` and `/* */` blocks (`local/no-jsdoc-blocks` in `eslint.config.js`)
  and for section banners (`local/no-banner-comments`): write a why as a short `//` comment. A
  tool's `--help` text lives in its `usage.txt`, not in a comment.
- A Claude Code hook (`.claude/settings.json`, `tools/claude-hooks/`) shows Claude each comment an
  edit or a commit adds, so it deletes the what-comments before going on.
- No `TODO` / `FIXME` comments (`no-warning-comments`). Put follow-up work in the tracker as an issue.
- Put logic in plain functions with unit tests. Entry points (`bin/`) and the `main.js` of each
  tool stay thin: they parse, wire and hand over.
- Every S3 request goes through the bucket facade (`src/s3/bucket.js`); nothing else sends object
  commands. That keeps the S3 rules (copy-source encoding, not-found as `null`) in one place and
  lets the tests swap in `test/support/memory-bucket.js`.
- Never change what is already on users' disks or in their buckets without a migration: job folder
  names (`jobDirFor`), the `progress.jsonl` line format and the metadata markers (`original-key`,
  `original-backup`, `size-of`) are read by later runs and by `--rollback`. `test/regression/`
  locks them in.
- Never install packages without asking; concurrent installs corrupt `node_modules`.

## Code style

- Write self-explaining code: descriptive names, no single-letter names except `x`, `y`, `i`, `j`.
- Keep comments minimal: no comments that restate the code, no section-banner comments, no long
  JSDoc on obvious functions.
- Prettier owns formatting (`.prettierrc.json`), but it never adds a blank line, so space code into
  steps yourself (see "Function layout"). Put a blank line:
  - between the blocks of a function,
  - after a block (`if`, `for`, `try`, `switch`) that closes with `}` when more code follows,
  - after an early return (`if (!current) { ...; return ...; }`),
  - before the final `return`, unless it is the only line of the function,
  - between the methods of an object.

  Never put one right after `{` or right before `}`. Blank lines don't count toward the lint size
  limits (`skipBlankLines` in `eslint.config.js`).

  ```js
  export async function ensureFolder({ bucket, folder, existing }) {
    if (existing.has(folder)) {
      console.log(`Folder exists: s3://${bucket.name}/${folder}`);

      return;
    }

    await bucket.put(folder, { Body: '', ContentLength: 0 });
    existing.set(folder, 0);
  }
  ```

- A function with more than a few inputs takes one object (`{ bucket, prefix, manifestPath }`).
  Tools return an exit code instead of calling `process.exit`; only `bin/` and interactive prompts
  exit.

## Function layout

- Group function bodies into blocks separated by one blank line; each block does one thing.
- Declare variables in the block where they are first used, not at the top of the function.
- Process-wide setup (signal/stream handlers, exit handling) belongs in the CLI entry file, not in
  command functions.
- No comments that describe what code does; only comments explaining a non-obvious _why_.

Reordering and grouping alone, with nothing else changed, makes a function read as its steps:

```js
export async function lsCommand(context) {
  const { args, connection, log, connect } = context;

  const target = await pickTarget(context);
  const knownRegion = args.region ?? target.region;
  const { bucket } = await connect(target.name, { connection, knownRegion, log });

  const prefix = normalizePrefix(args.prefix);
  const delimiter = args.recursive ? null : '/';
  const totals = { files: 0, bytes: 0, folders: 0 };

  console.log(`s3://${bucket.name}/${prefix}${args.recursive ? '   (recursive)' : ''}\n`);
  for await (const page of bucket.pages({ prefix, delimiter })) {
    printPage(page, prefix, totals);
  }

  const folderNote = args.recursive
    ? ''
    : ` · ${formatNumber(totals.folders)} folder(s) — add --recursive to include everything inside them`;

  console.log(`\n${formatNumber(totals.files)} file(s), ${formatBytes(totals.bytes)}${folderNote}`);

  return 0;
}
```

## Testing

- Unit tests are not enough. Each change needs the right mix of:
  - **unit** tests (`test/unit/`) for plain functions,
  - **integration** tests (`test/integration/`) for modules working together: the converter with
    real sharp encoding against the in-memory bucket, a whole `runConvert` / `runCreateFolder` run,
    the layout of `src/`,
  - **regression** tests (`test/regression/`) that lock in fixed bugs and what earlier runs left on
    disk and in buckets.
- Fixing a bug: first write a test that reproduces it and fails, then fix it, then keep the test.
- Tests never reach AWS: they pass `connect` to `runConvert` / `runCreateFolder` and get a
  `createMemoryBucket()`, which keeps S3's conditional-write rules (`IfMatch`,
  `CopySourceIfMatch`).
- Verify your work: run `npm run check`.

## Versions

The version is SemVer, the `version` in `package.json`. Raise it without being asked, in the change
that ships something a user of the tools sees:

- `npm version patch --no-git-tag-version` for fixes and changed messages,
- `npm version minor --no-git-tag-version` for something new: a flag, a mode, a command,
- `npm version major --no-git-tag-version` only for a change that breaks what a user keeps (their
  job folders, the files a run left in a bucket, a flag they script), and only once the user agrees.

A change users never see (tests, docs, tooling, a refactor) keeps the version. Say in the reply
which version it now is.

## Layout

`bin/` holds one entry per tool: it calls the tool's `main.js` and turns an error into exit code 1.
`src/` holds:

- `utils/`: plain helpers that know no feature (`format.js`, `pool.js`, `json-files.js`),
- `logging/`: the logger that writes to the console and a job's `run.log`,
- `cli/`: what every command line needs (`prompter.js`, `integer-option.js`, `usage.js`),
- `s3/`: everything that talks to S3 and knows no tool: the bucket facade (`bucket.js`), clients
  and region detection, error explanations, and key helpers (`keys.js`),
- `convert/`: the `s3-to-webp` tool:
  - `options.js` (its flags), `naming.js` (backup and size-copy names), `usage.txt`, `main.js`,
  - `settings/`: defaults, the settings flags, merging them with a saved job, describing them,
  - `job/`: the job folder on disk: `job.json`, the scan (`manifest.jsonl`), `progress.jsonl`,
  - `menu/`: the interactive pickers (job, bucket, folder),
  - `converter/`: converting one image (plain, `--replace`, sizes, retries),
  - `run/`: one conversion run, from the session to the summary,
  - `rollback/`: `--rollback`: plan, show, apply,
  - `commands/`: the one-shot commands (`--list-buckets`, `--ls`),
- `create-folder/`: the `create-folder` tool, one file per step (empty, ensure, upload, copy,
  summary).

Where a file goes:

1. It knows no feature: `utils/`.
2. It talks to S3 and knows no tool: `s3/`.
3. Every command line needs it: `cli/`.
4. Everything else goes in the folder of the tool, and of the step, that uses it.
5. A tool never imports the other tool.

No catch-all folders (`types/`, `constants/`, `helpers/`): a type or a constant lives with its
owner. `test/integration/layout.test.js` holds `src/` to these folders and fails when a folder
imports one it may not (`utils/` and `logging/` nothing, `cli/` and `s3/` only `utils/`, a tool
never the other tool). Tests mirror `src/`: `src/convert/naming.js` is tested in
`test/unit/convert/naming.test.js`; shared fakes live in `test/support/`.
