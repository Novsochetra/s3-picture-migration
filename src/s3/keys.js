function splitName(key) {
  const slash = key.lastIndexOf('/');
  const base = key.slice(slash + 1);
  const dot = base.lastIndexOf('.');
  const hasExtension = dot > 0;

  return {
    folder: key.slice(0, slash + 1),
    stem: hasExtension ? base.slice(0, dot) : base,
    extension: hasExtension ? base.slice(dot + 1) : '',
  };
}

export const extensionOf = (key) => splitName(key).extension.toLowerCase();

export const stemOf = (key) => splitName(key).stem;

export function insertBeforeExtension(key, text) {
  const { folder, stem, extension } = splitName(key);

  return `${folder}${stem}${text}${extension ? `.${extension}` : ''}`;
}

export function swapExtension(key, extension) {
  const { folder, stem } = splitName(key);

  return `${folder}${stem}.${extension}`;
}

export function removeStemSuffix(key, suffix) {
  const { folder, stem, extension } = splitName(key);

  return `${folder}${stem.slice(0, -suffix.length)}${extension ? `.${extension}` : ''}`;
}

export function normalizePrefix(prefix) {
  const trimmed = (prefix ?? '').replace(/^\/+/, '');

  return trimmed && !trimmed.endsWith('/') ? `${trimmed}/` : trimmed;
}

export const toFolder = (folderPath) => `${folderPath.replace(/^\/+/, '').replace(/\/+$/, '')}/`;

export const fileNameOf = (key) => key.slice(key.lastIndexOf('/') + 1);
