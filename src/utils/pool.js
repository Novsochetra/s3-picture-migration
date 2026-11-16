export async function runPool(items, limit, task) {
  let next = 0;
  const workerCount = Math.min(limit, items.length);

  const worker = async () => {
    while (next < items.length) {
      await task(items[next++]);
    }
  };

  await Promise.all(Array.from({ length: workerCount }, worker));
}

export function chunk(items, size) {
  const chunks = [];

  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }

  return chunks;
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
