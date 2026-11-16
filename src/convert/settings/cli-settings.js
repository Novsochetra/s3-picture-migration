import { parseIntegerOption } from '../../cli/integer-option.js';
import { WEBP_MAX_DIMENSION } from './defaults.js';

const SIZES_OFF = /^(none|off|0)$/i;
const SAFE_SUFFIX = /^[\w.-]+$/;

export function parseSizes(text) {
  if (SIZES_OFF.test(text.trim())) {
    return null;
  }

  const widths = text
    .split(',')
    .map((width) => width.trim().replace(/w$/i, ''))
    .filter(Boolean)
    .map(Number);
  const isValid = (width) => Number.isInteger(width) && width >= 1 && width <= WEBP_MAX_DIMENSION;

  if (!widths.length || !widths.every(isValid)) {
    throw new Error(
      `--sizes must be widths between 1 and ${WEBP_MAX_DIMENSION}, e.g. --sizes 320,640,1080`,
    );
  }

  return [...new Set(widths)].sort((left, right) => left - right);
}

function imageSettings(args) {
  const settings = {};

  if (args.quality !== undefined) {
    settings.quality = parseIntegerOption(args.quality, { name: 'quality', min: 1, max: 100 });
  }

  if (args['max-width'] !== undefined) {
    const range = { name: 'max-width', min: 1, max: WEBP_MAX_DIMENSION };

    settings.maxWidth = parseIntegerOption(args['max-width'], range);
  }

  if (args.sizes !== undefined) {
    settings.sizes = parseSizes(args.sizes);
  }

  return settings;
}

function backupSettings(args) {
  if (!args.replace) {
    if (args['backup-suffix'] !== undefined) {
      throw new Error('--backup-suffix only works together with --replace');
    }

    return {};
  }

  const backupSuffix = args['backup-suffix'] ?? '-original';

  if (!SAFE_SUFFIX.test(backupSuffix)) {
    throw new Error('--backup-suffix may only contain letters, numbers, "-", "_" and "."');
  }

  return { keepExt: true, backupSuffix };
}

function switchSettings(args) {
  const switches = {
    keepExt: args['keep-ext'],
    deleteOriginal: args['delete-original'],
    overwrite: args.overwrite,
    allowLarger: args['allow-larger'],
  };

  return Object.fromEntries(Object.entries(switches).filter(([, isOn]) => isOn));
}

function textSettings(args) {
  return Object.fromEntries(
    Object.entries({ ext: args.ext, acl: args.acl }).filter(([, value]) => value !== undefined),
  );
}

// Only the settings the user passed, so they can override what the job saved.
export function cliSettings(args) {
  return {
    ...imageSettings(args),
    ...textSettings(args),
    ...switchSettings(args),
    ...backupSettings(args),
  };
}
