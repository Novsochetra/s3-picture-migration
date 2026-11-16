import { askUntilValid } from '../../cli/prompter.js';

function showBuckets(buckets) {
  const nameWidth = Math.max(...buckets.map((bucket) => bucket.Name.length));

  console.log('\nBuckets:');
  buckets.forEach((bucket, i) => {
    const number = String(i + 1).padStart(3);

    console.log(`  ${number})  ${bucket.Name.padEnd(nameWidth)}  ${bucket.BucketRegion ?? ''}`);
  });
}

export async function pickBucket(prompt, buckets) {
  if (!buckets.length) {
    throw new Error('This key can see no buckets.');
  }

  showBuckets(buckets);

  const question = `\nPick a bucket [1-${buckets.length}] or type its name: `;
  const bucket = await askUntilValid(
    prompt,
    question,
    (answer) => buckets[Number(answer) - 1] ?? buckets.find((entry) => entry.Name === answer),
  );

  return { name: bucket.Name, region: bucket.BucketRegion ?? null };
}
