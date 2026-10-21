// UNIT TESTS
// Scope: one module of pure functions, nothing else.
// No Express, no HTTP, no database, no browser. These run in milliseconds.
const {
  AUTH_TOKEN,
  hasValidAuthToken,
  normalizeCredentials,
  hasLoginFields,
} = require('../../lib/auth-utils');

describe('hasValidAuthToken', () => {
  test('accepts the expected token', () => {
    expect(hasValidAuthToken(AUTH_TOKEN)).toBe(true);
  });

  test('rejects anything else', () => {
    expect(hasValidAuthToken('wrong-token')).toBe(false);
    expect(hasValidAuthToken('')).toBe(false);
    expect(hasValidAuthToken(undefined)).toBe(false);
    expect(hasValidAuthToken(null)).toBe(false);
  });
});

describe('normalizeCredentials', () => {
  test('trims the username and leaves the password untouched', () => {
    expect(normalizeCredentials({ username: '  admin  ', password: ' pw ' })).toEqual({
      username: 'admin',
      password: ' pw ',
    });
  });

  test('turns non-string values into empty strings', () => {
    expect(normalizeCredentials({ username: 42, password: ['x'] })).toEqual({
      username: '',
      password: '',
    });
  });

  test('handles a missing body', () => {
    expect(normalizeCredentials()).toEqual({ username: '', password: '' });
  });
});

describe('hasLoginFields', () => {
  test('is true only when both fields are non-empty', () => {
    expect(hasLoginFields({ username: 'admin', password: 'password' })).toBe(true);
    expect(hasLoginFields({ username: '   ', password: 'password' })).toBe(false);
    expect(hasLoginFields({ username: 'admin', password: '' })).toBe(false);
    expect(hasLoginFields({})).toBe(false);
    expect(hasLoginFields(undefined)).toBe(false);
  });
});
