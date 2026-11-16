import { formatDateTime, formatNumber, percent } from '../../utils/format.js';

function describeJob(job) {
  const status = job.status;

  if (!status) {
    return 'not started';
  }

  const failed = status.failed ? ` · ${formatNumber(status.failed)} failed` : '';
  const lastRun = formatDateTime(status.updatedAt ? new Date(status.updatedAt) : null);

  return (
    `${percent(status.completed, status.total)}% ` +
    `(${formatNumber(status.completed)}/${formatNumber(status.total)})${failed} · last run ${lastRun}`
  );
}

export async function pickUnfinishedJob(prompt, jobs) {
  if (!jobs.length) {
    return null;
  }

  console.log('\nUnfinished jobs on this machine:');
  jobs.forEach((job, i) => {
    console.log(
      `  ${String(i + 1).padStart(3)})  s3://${job.bucket}/${job.prefix}   ${describeJob(job)}`,
    );
  });

  for (;;) {
    const answer = await prompt.ask('\nResume a job [number], or press Enter for a new one: ');

    if (answer === '') {
      return null;
    }

    const job = jobs[Number(answer) - 1];

    if (job) {
      return job;
    }

    console.log('  Not a valid choice.');
  }
}
