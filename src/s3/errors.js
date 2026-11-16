const CREDENTIAL_ERRORS = [
  'CredentialsProviderError',
  'InvalidAccessKeyId',
  'SignatureDoesNotMatch',
];

const KNOWN_ERRORS = {
  InvalidAccessKeyId: 'AWS rejected the access key ID (AWS_ACCESS_KEY_ID).',
  SignatureDoesNotMatch: 'AWS rejected the secret key (AWS_SECRET_ACCESS_KEY).',
  AccessControlListNotSupported: 'This bucket has ACLs disabled; run without --acl.',
};

const MISSING_CREDENTIALS =
  'No AWS credentials found. Put AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in a .env file ' +
  'and run with: node --env-file=.env (npm run convert / npm run create-folder do this)';

export const isCredentialError = (error) => CREDENTIAL_ERRORS.includes(error?.name);

export const isAccessDenied = (error) =>
  error?.name === 'AccessDenied' || error?.$metadata?.httpStatusCode === 403;

export const isNotFound = (error) =>
  error?.$metadata?.httpStatusCode === 404 || error?.name === 'NotFound';

export const isPreconditionFailed = (error) => error?.name === 'PreconditionFailed';

export function explainError(error) {
  const name = error?.name ?? '';
  const message = error?.message ?? String(error);

  if (name === 'CredentialsProviderError' || /could not load credentials/i.test(message)) {
    return MISSING_CREDENTIALS;
  }

  if (KNOWN_ERRORS[name]) {
    return KNOWN_ERRORS[name];
  }

  return isAccessDenied(error) ? `Access denied: ${message}` : message;
}
