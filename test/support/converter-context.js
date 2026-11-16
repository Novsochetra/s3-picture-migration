import { createConverter } from '../../src/convert/converter/create-converter.js';
import { DEFAULT_SETTINGS } from '../../src/convert/settings/defaults.js';
import { captureLog } from './capture-log.js';

export function converterFor(bucket, settings = {}) {
  const log = captureLog();
  const state = { stopping: false, hardStop: false, active: new Set() };
  const convert = createConverter({
    bucket,
    settings: { ...DEFAULT_SETTINGS, ...settings },
    state,
    log,
    retries: 3,
    conditionalWrites: true,
    wait: async () => {},
  });

  return { convert, log, state };
}
