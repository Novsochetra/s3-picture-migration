import { askUntilValid } from '../../cli/prompter.js';
import { normalizePrefix } from '../../s3/keys.js';

const BROWSE_QUESTION =
  '\nFolder number to open · Enter = use this folder (incl. sub-folders) · .. = up · q = quit: ';

function showFolder({ bucketName, prefix, listing, folders }) {
  const files = (listing.Contents ?? []).filter((object) => object.Key !== prefix);
  const more = listing.IsTruncated ? '+' : '';

  console.log(`\ns3://${bucketName}/${prefix}`);
  folders.forEach((folder, i) => {
    console.log(`  ${String(i + 1).padStart(4)})  ${folder.slice(prefix.length)}`);
  });

  if (!folders.length) {
    console.log('        (no sub-folders)');
  }

  if (listing.IsTruncated) {
    console.log('        (list cut at 1000 — type a path like raw/2024/ to jump)');
  }

  console.log(`        ${files.length}${more} file(s) directly in this folder`);
}

const parentOf = (prefix) => {
  const parent = prefix.split('/').slice(0, -2).join('/');

  return parent ? `${parent}/` : '';
};

// Returns undefined for an answer that means nothing here.
export function nextStep(answer, { prefix, folders }) {
  if (answer === '' || answer === '.') {
    return { use: prefix };
  }

  if (answer === 'q') {
    return { quit: true };
  }

  if (answer === '..') {
    return { open: parentOf(prefix) };
  }

  const picked = Number.isInteger(Number(answer)) ? folders[Number(answer) - 1] : undefined;

  if (picked) {
    return { open: picked };
  }

  return answer.includes('/') ? { open: normalizePrefix(answer) } : undefined;
}

async function askInFolder(bucket, prompt, prefix) {
  const listing = await bucket.listOnce({ prefix, delimiter: '/' });
  const folders = (listing.CommonPrefixes ?? []).map((entry) => entry.Prefix);

  showFolder({ bucketName: bucket.name, prefix, listing, folders });

  return askUntilValid(prompt, BROWSE_QUESTION, (answer) => nextStep(answer, { prefix, folders }));
}

// The chosen folder, or null when the user quits.
export async function browseFolders(bucket, prompt) {
  let prefix = '';

  for (;;) {
    const step = await askInFolder(bucket, prompt, prefix);

    if (step.open === undefined) {
      return step.quit ? null : step.use;
    }

    prefix = step.open;
  }
}
