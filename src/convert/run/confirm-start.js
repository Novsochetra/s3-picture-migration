import { saysYes } from '../../cli/prompter.js';
import { formatNumber } from '../../utils/format.js';
import { closePrompt } from './session-prompt.js';

function closeWith(session, message) {
  session.log.info(message);
  closePrompt(session);

  return false;
}

async function userAgrees({ prompt, settings }, counts) {
  const remaining = formatNumber(counts.total - counts.completed);
  const warning = settings.deleteOriginal ? ' Originals will be DELETED after conversion.' : '';

  return saysYes(await prompt.ask(`\nStart converting ${remaining} images?${warning} [y/N]: `));
}

export async function confirmStart(session, { counts, confirmed }) {
  const { args, log, prompt, resumeCommand } = session;
  // Only a job picked in the menu asks first: with --bucket the command line is the answer.
  const mustAsk = prompt && !args.yes && !confirmed;

  log.info(`Resume:   ${resumeCommand}`);

  if (args['dry-run']) {
    return closeWith(session, '\nDry run: nothing was changed.');
  }

  if (mustAsk && !(await userAgrees(session, counts))) {
    return closeWith(session, 'Cancelled.');
  }

  closePrompt(session);

  return true;
}
