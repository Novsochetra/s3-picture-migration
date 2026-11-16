export async function pickBucket(prompt, buckets) {
  if (!buckets.length) {
    throw new Error('This key can see no buckets.');
  }

  const nameWidth = Math.max(...buckets.map((bucket) => bucket.Name.length));
  console.log('\nBuckets:');
  buckets.forEach((bucket, i) => {
    console.log(
      `  ${String(i + 1).padStart(3)})  ${bucket.Name.padEnd(nameWidth)}  ${bucket.BucketRegion ?? ''}`,
    );
  });

  for (;;) {
    const answer = await prompt.ask(`\nPick a bucket [1-${buckets.length}] or type its name: `);
    const bucket = buckets[Number(answer) - 1] ?? buckets.find((entry) => entry.Name === answer);

    if (bucket) {
      return { name: bucket.Name, region: bucket.BucketRegion ?? null };
    }

    console.log('  Not a valid choice.');
  }
}
