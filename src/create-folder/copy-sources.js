import { extensionOf, fileNameOf, toFolder } from '../s3/keys.js';
import { listSizes } from './list-sizes.js';

function fail({ stats }, message) {
  stats.failed++;
  console.error(`FAIL      ${message}`);

  return null;
}

async function singleFile(context, sourceKey) {
  const found = await listSizes(context.bucket, sourceKey);

  if (!found.has(sourceKey)) {
    return fail(context, `--copy-from: no such file s3://${context.bucket.name}/${sourceKey}`);
  }

  const source = { key: sourceKey, size: found.get(sourceKey), rel: fileNameOf(sourceKey) };

  return { from: sourceKey, sources: [source] };
}

async function wholeFolder(context, sourcePath) {
  const { bucket, folder } = context;

  const sourceFolder = toFolder(sourcePath);

  if (folder.startsWith(sourceFolder) || sourceFolder.startsWith(folder)) {
    return fail(
      context,
      `--copy-from ${sourceFolder} overlaps the target folder ${folder}; skipped`,
    );
  }

  const found = await listSizes(bucket, sourceFolder);
  const sources = [...found]
    .filter(([key]) => !key.endsWith('/'))
    .map(([key, size]) => ({ key, size, rel: key.slice(sourceFolder.length) }));

  if (!sources.length) {
    console.log(`\nNothing to copy in s3://${bucket.name}/${sourceFolder}`);

    return null;
  }

  return { from: sourceFolder, sources };
}

export function resolveCopySources(context, rawSource) {
  const source = rawSource.replace(/^\/+/, '');
  const looksLikeFile = !source.endsWith('/') && extensionOf(source) !== '';

  return looksLikeFile ? singleFile(context, source) : wholeFolder(context, source);
}
