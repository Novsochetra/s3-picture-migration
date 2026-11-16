import { explainError, isPreconditionFailed } from '../../s3/errors.js';
import { sleep } from '../../utils/pool.js';
import { convertPlain } from './convert-plain.js';
import { replaceWithBackup } from './replace-with-backup.js';

const MAX_RETRY_DELAY_MS = 30_000;

export const retryDelay = (attempt) =>
  Math.min(MAX_RETRY_DELAY_MS, 1000 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 500);

const failureMessage = (error) =>
  isPreconditionFailed(error)
    ? 'file changed during conversion (the app replaced it); retrying with the new version'
    : explainError(error);

// The result to keep, or null when the error is worth another attempt.
function finalOutcome(context, error, attempt) {
  if (context.state.hardStop) {
    return { status: 'aborted' };
  }

  const message = failureMessage(error);

  if (error.permanent) {
    return { status: 'invalid', error: message, attempts: attempt };
  }

  if (attempt > context.retries || context.state.stopping) {
    return { status: 'failed', error: message, attempts: attempt };
  }

  return null;
}

async function waitBeforeRetry(context, { item, error, attempt }) {
  const delay = retryDelay(attempt);
  const seconds = (delay / 1000).toFixed(1);
  const next = `attempt ${attempt + 1}/${context.retries + 1}`;

  context.log.warn(`retry  ${item.key} in ${seconds}s (${next}): ${failureMessage(error)}`);
  await (context.wait ?? sleep)(delay);
}

export function createConverter(context) {
  const convertOnce = (item) =>
    context.settings.backupSuffix ? replaceWithBackup(context, item) : convertPlain(context, item);

  return async function convert(item) {
    for (let attempt = 1; ; attempt++) {
      try {
        return { ...(await convertOnce(item)), attempts: attempt };
      } catch (error) {
        const outcome = finalOutcome(context, error, attempt);

        if (outcome) {
          return outcome;
        }

        await waitBeforeRetry(context, { item, error, attempt });
      }
    }
  };
}
