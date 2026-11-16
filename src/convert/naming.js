import { insertBeforeExtension, removeStemSuffix, stemOf, swapExtension } from '../s3/keys.js';

const VARIANT_STEM = /-\d+w$/;

export const mainKeyFor = (key, keepExtension) =>
  keepExtension ? key : swapExtension(key, 'webp');

export const backupKeyFor = (key, suffix) => insertBeforeExtension(key, suffix);

export const variantKeyFor = (mainKey, width) => insertBeforeExtension(mainKey, `-${width}w`);

export const isBackupKey = (key, suffix) => stemOf(key).endsWith(suffix);

export const isVariantKey = (key) => VARIANT_STEM.test(stemOf(key));

export const mainKeyForBackup = (backupKey, suffix) => removeStemSuffix(backupKey, suffix);
