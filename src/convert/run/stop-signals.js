const SIGNALS = ['SIGINT', 'SIGTERM'];
const FORCED_EXIT_AFTER_MS = 10_000;

function abortNow({ log, jobFiles, resumeCommand }, run) {
  run.state.hardStop = true;
  log.warn('Aborting in-flight uploads...');
  setTimeout(() => process.exit(130), FORCED_EXIT_AFTER_MS).unref();

  const aborts = [...run.state.active].map((handle) => handle.abort());
  Promise.allSettled(aborts).finally(() => {
    jobFiles.saveStatus(run.counts, true);
    log.warn(`Aborted. Progress is saved — resume with:\n  ${resumeCommand}`);
    process.exit(130);
  });
}

export function installStopSignals(session, run) {
  const { state } = run;

  const onSignal = () => {
    state.signalled = true;

    if (!state.stopping) {
      state.stopping = true;
      session.log.warn(
        `\nStopping: letting ${state.active.size} in-flight image(s) finish. ` +
          'Press Ctrl+C again to abort them now.',
      );

      return;
    }

    if (!state.hardStop) {
      abortNow(session, run);
    }
  };

  SIGNALS.forEach((signal) => process.on(signal, onSignal));

  return { remove: () => SIGNALS.forEach((signal) => process.off(signal, onSignal)) };
}
