const AUTH_TOKEN = 'fake-jwt-token';

function hasValidAuthToken(token) {
  return token === AUTH_TOKEN;
}

function normalizeCredentials(body) {
  const payload = body || {};
  return {
    username: typeof payload.username === 'string' ? payload.username.trim() : '',
    password: typeof payload.password === 'string' ? payload.password : '',
  };
}

function hasLoginFields(body) {
  const { username, password } = normalizeCredentials(body);
  return username.length > 0 && password.length > 0;
}

module.exports = {
  AUTH_TOKEN,
  hasValidAuthToken,
  normalizeCredentials,
  hasLoginFields,
};
