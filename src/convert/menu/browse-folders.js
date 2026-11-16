import { normalizePrefix } from '../../s3/keys.js';

const BROWSE_QUESTION =
  '\nFolder number to open · Enter = use this folder (incl. sub-folders) · .. = up · q = quit: ';

function showFolder({ bucketName, prefix, listing, folders }) {
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

  const files = (listing.Contents ?? []).filter((object) => object.Key !== prefix);
  const more = listing.IsTruncated ? '+' : '';
  console.log(`        ${files.length}${more} file(s) directly in this folder`);
}

const parentOf = (prefix) => {
  const parent = prefix.split('/').slice(0, -2).join('/');

  return parent ? `${parent}/` : '';
};

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

  const picked = folders[Number(answer) - 1];

  if (Number.isInteger(Number(answer)) && picked) {
    return { open: picked };
  }

  return answer.includes('/') ? { open: normalizePrefix(answer) } : {};
}

export async function browseFolders(bucket, prompt) {
  let prefix = '';

  for (;;) {
    const listing = await bucket.listOnce({ prefix, delimiter: '/' });
    const folders = (listing.CommonPrefixes ?? []).map((entry) => entry.Prefix);
    showFolder({ bucketName: bucket.name, prefix, listing, folders });

    const step = nextStep(await prompt.ask(BROWSE_QUESTION), { prefix, folders });

    if (step.quit) {
      process.exit(0);
    }

    if (step.use !== undefined) {
      return step.use;
    }

    prefix = step.open ?? prefix;
    if (step.open === undefined) {
      console.log('  Not a valid choice.');
    }
  }
}
