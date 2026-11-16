import { formatNumber } from '../../utils/format.js';
import { askInSession, canAsk, closePrompt } from '../session-prompt.js';
import { applyRollback } from './apply-rollback.js';
import { planRollback, planSize } from './plan-rollback.js';
import { showPlan } from './show-plan.js';

function stopWith(session, message) {
  session.log.info(message);
  closePrompt(session);

  return false;
}

async function userTypesYes(session) {
  if (!canAsk(session)) {
    throw new Error('Not running in a terminal: add --yes to confirm the rollback.');
  }

  const where = `s3://${session.bucket.name}/${session.prefix}`;
  const answer = await askInSession(session, `\nType "yes" to roll back ${where}: `);

  return answer.toLowerCase() === 'yes';
}

async function confirmRollback(session, plan) {
  if (!planSize(plan)) {
    return stopWith(session, '\nNothing to roll back.');
  }

  if (session.args['dry-run']) {
    return stopWith(session, '\nDry run: nothing was changed.');
  }

  if (!session.args.yes && !(await userTypesYes(session))) {
    return stopWith(session, 'Cancelled: nothing was changed.');
  }

  closePrompt(session);

  return true;
}

function reportRollback({ log }, tally, history) {
  log.info(
    `\nRollback finished: ${formatNumber(tally.restored)} restored, ` +
      `${formatNumber(tally.backupsRemoved)} unused backups removed, ` +
      `${formatNumber(tally.copiesDeleted)} copies deleted, ${formatNumber(tally.failed)} failed`,
  );

  if (history) {
    log.info(
      `The job's progress was reset (kept in ${history}); the next run starts from scratch.`,
    );
  }

  if (tally.failed) {
    log.info('Run --rollback again to retry the failed ones.');
  }
}

export async function rollback(session) {
  const { args, log, bucket, prefix, settings, jobFiles } = session;
  const suffix = settings.backupSuffix ?? args['backup-suffix'] ?? '-original';

  log.info(
    `\nRollback of s3://${bucket.name}/${prefix}: looking for files this script created ...`,
  );

  const plan = await planRollback({ bucket, prefix, suffix });

  showPlan(session, plan);

  if (!(await confirmRollback(session, plan))) {
    return 0;
  }

  const tally = await applyRollback(session, plan);
  const history = jobFiles.startOver();

  // The job's progress is forgotten, so the next run starts clean.
  jobFiles.save();
  reportRollback(session, tally, history);

  return tally.failed ? 1 : 0;
}
