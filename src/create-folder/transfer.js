import { formatBytes } from '../utils/format.js';

export function recordFailure({ stats }, message) {
  stats.failed++;
  console.error(`FAIL      ${message}`);
}

export function skipIfAlreadyThere({ args, existing, stats }, key, rel, size) {
  if (args.overwrite || existing.get(key) !== size) {
    return false;
  }

  stats.skipped++;
  console.log(`skip      ${rel} (already there)`);

  return true;
}

// kind is 'uploaded' or 'copied': the stat it counts in and the word it logs.
export async function transferFile(context, { kind, from, to, size, send }) {
  try {
    await send();
  } catch (error) {
    recordFailure(context, `${from}: ${error.name}: ${error.message}`);

    return;
  }

  context.existing.set(to, size);
  context.stats[kind]++;
  context.stats.bytes += size;
  console.log(`${kind.padEnd(10)}${from} -> ${to} (${formatBytes(size)})`);
}
