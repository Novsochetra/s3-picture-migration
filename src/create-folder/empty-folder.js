import { createPrompter } from '../cli/prompter.js';
import { formatBytes } from '../utils/format.js';
import { chunk } from '../utils/pool.js';
import { EMPTYABLE_FOLDER } from './options.js';

const DELETE_BATCH = 1000;
const SHOWN_KEYS = 10;

function showDeletion({ bucket, folder, existing }, keys) {
  const total = keys.reduce((sum, key) => sum + existing.get(key), 0);

  console.log(
    `\nAbout to DELETE ${keys.length} object(s) (${formatBytes(total)}) from s3://${bucket.name}/${folder}`,
  );
  keys.slice(0, SHOWN_KEYS).forEach((key) => console.log(`  - ${key.slice(folder.length)}`));

  if (keys.length > SHOWN_KEYS) {
    console.log(`  ... and ${keys.length - SHOWN_KEYS} more`);
  }
}

async function confirmEmpty(args) {
  if (args.yes) {
    return true;
  }

  if (!process.stdin.isTTY) {
    throw new Error('Not running in a terminal: add --yes to confirm emptying.');
  }

  const prompt = createPrompter();
  const answer = await prompt.ask('Type "yes" to delete them: ');
  prompt.close();

  return answer.toLowerCase() === 'yes';
}

async function deleteBatch({ bucket, existing, stats }, batch) {
  // A second safety net: no key outside the allowed folder is ever sent.
  if (batch.some((key) => !key.startsWith(EMPTYABLE_FOLDER))) {
    throw new Error('Safety check failed; nothing deleted.');
  }

  const errors = await bucket.removeMany(batch);
  const failedKeys = new Set(errors.map((error) => error.Key));
  errors.forEach((error) => {
    stats.failed++;
    console.error(`FAIL  delete ${error.Key}: ${error.Code} ${error.Message ?? ''}`);
  });
  batch
    .filter((key) => !failedKeys.has(key))
    .forEach((key) => {
      existing.delete(key);
      stats.deleted++;
    });
}

export async function emptyFolder(context) {
  const { bucket, folder, existing } = context;

  if (!folder.startsWith(EMPTYABLE_FOLDER)) {
    throw new Error(
      `--empty only works inside s3://${bucket.name}/${EMPTYABLE_FOLDER}\n` +
        `       Refusing to empty s3://${bucket.name}/${folder}`,
    );
  }

  const keys = [...existing.keys()].filter((key) => key !== folder && key.startsWith(folder));

  if (!keys.length) {
    console.log(`Already empty: s3://${bucket.name}/${folder}`);

    return true;
  }

  showDeletion(context, keys);

  if (!(await confirmEmpty(context.args))) {
    console.log('Cancelled — nothing was deleted.');

    return false;
  }

  for (const batch of chunk(keys, DELETE_BATCH)) {
    await deleteBatch(context, batch);
  }

  console.log(`Deleted ${context.stats.deleted} object(s).`);

  return true;
}
