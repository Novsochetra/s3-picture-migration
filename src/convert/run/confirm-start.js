import { saysYes } from '../../cli/prompter.js';
import { formatNumber } from '../../utils/format.js';

function closeWith(session, message) {
  if (message) {
    session.log.info(message);
  }

  session.prompt?.close();

  return false;
}

export async function confirmStart(session, { counts, confirmed }) {
  const { args, log, prompt, settings, resumeCommand } = session;

  log.info(`Resume:   ${resumeCommand}`);

  if (args['dry-run']) {
    return closeWith(session, '\nDry run: nothing was changed.');
  }

  if (prompt && !args.yes && !confirmed) {
    const remaining = formatNumber(counts.total - counts.completed);
    const warning = settings.deleteOriginal ? ' Originals will be DELETED after conversion.' : '';
    const answer = await prompt.ask(`\nStart converting ${remaining} images?${warning} [y/N]: `);

    if (!saysYes(answer)) {
      return closeWith(session, 'Cancelled.');
    }
  }

  prompt?.close();

  return true;
}
