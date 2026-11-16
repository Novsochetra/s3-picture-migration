import fs from 'node:fs';
import { formatNumber } from '../../utils/format.js';
import { runSummary, statusLine } from './status-line.js';

function writeProblems(failedPath, problems) {
  if (problems.length) {
    fs.writeFileSync(failedPath, `${problems.join('\n')}\n`);
  } else {
    fs.rmSync(failedPath, { force: true });
  }
}

function exitCodeOf({ log, jobFiles, resumeCommand }, run, problems) {
  const { counts, state } = run;

  const left = counts.total - counts.completed;

  if (left === 0 && counts.invalid === 0) {
    log.info('Job complete.');

    return 0;
  }

  if (problems.length) {
    log.info(`Problem files listed in ${jobFiles.paths.failed}`);
  }

  if (left > 0) {
    log.info(`${formatNumber(left)} image(s) still to do. Resume with:\n  ${resumeCommand}`);
  }

  return state.signalled && left > 0 ? 130 : 1;
}

export function wrapUp(session, run) {
  const { log, jobFiles } = session;

  const problems = run.progress.problems();
  writeProblems(jobFiles.paths.failed, problems);
  jobFiles.saveStatus(run.counts, true);

  log.info(statusLine(run));
  log.info(runSummary(run.stats));

  return exitCodeOf(session, run, problems);
}
