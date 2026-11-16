import { describe, expect, it } from 'vitest';
import { explainError, isCredentialError, isNotFound } from '../../../src/s3/errors.js';

const named = (name, message = 'boom', status) =>
  Object.assign(new Error(message), { name, $metadata: { httpStatusCode: status } });

describe('explainError', () => {
  it('tells the user how to give missing credentials', () => {
    expect(explainError(named('CredentialsProviderError'))).toMatch(/AWS_ACCESS_KEY_ID/);
  });

  it('names the key AWS rejected', () => {
    expect(explainError(named('InvalidAccessKeyId'))).toMatch(/access key ID/);
    expect(explainError(named('SignatureDoesNotMatch'))).toMatch(/secret key/);
  });

  it('marks a 403 as access denied and keeps other messages', () => {
    expect(explainError(named('Forbidden', 'no', 403))).toBe('Access denied: no');
    expect(explainError(named('SlowDown', 'Please reduce your request rate.'))).toBe(
      'Please reduce your request rate.',
    );
  });
});

describe('error kinds', () => {
  it('knows credential and not-found errors', () => {
    expect(isCredentialError(named('SignatureDoesNotMatch'))).toBe(true);
    expect(isCredentialError(named('NoSuchKey'))).toBe(false);
    expect(isNotFound(named('Unknown', 'x', 404))).toBe(true);
  });
});
