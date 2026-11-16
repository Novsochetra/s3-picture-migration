import { confirmStart } from './confirm-start.js';
import { convertAll } from './convert-all.js';
import { prepareWork } from './prepare-work.js';
import { wrapUp } from './wrap-up.js';

export async function convertJob(session) {
  const preparedWork = await prepareWork(session);

  if (!preparedWork || !(await confirmStart(session, preparedWork))) {
    return 0;
  }

  const run = await convertAll(session, preparedWork);

  // The signal handler saves the progress and exits.
  if (run.state.hardStop) {
    return 130;
  }

  return wrapUp(session, run);
}
