import { askUntilValid } from '../../cli/prompter.js';
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

// askUntilValid asks again on undefined; null is a valid answer: no job, start a new one.
const NEW_JOB = null;

function showJobs(jobs) {
  console.log('\nUnfinished jobs on this machine:');
  jobs.forEach((job, i) => {
    const number = String(i + 1).padStart(3);

    console.log(`  ${number})  s3://${job.bucket}/${job.prefix}   ${describeJob(job)}`);
  });
}

export async function pickUnfinishedJob(prompt, jobs) {
  if (!jobs.length) {
    return NEW_JOB;
  }

  showJobs(jobs);

  const question = '\nResume a job [number], or press Enter for a new one: ';

  return askUntilValid(prompt, question, (answer) =>
    answer === '' ? NEW_JOB : jobs[Number(answer) - 1],
  );
}
