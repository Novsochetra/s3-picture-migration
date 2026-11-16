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

export async function transferFile(context, { counter, verb, from, to, size, send }) {
  try {
    await send();
  } catch (error) {
    recordFailure(context, `${from}: ${error.name}: ${error.message}`);

    return;
  }

  context.existing.set(to, size);
  context.stats[counter]++;
  context.stats.bytes += size;
  console.log(`${verb.padEnd(10)}${from} -> ${to} (${formatBytes(size)})`);
}
