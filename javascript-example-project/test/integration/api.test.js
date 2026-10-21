// INTEGRATION TESTS
// Scope: the real Express app, real routes, real middleware, real JSON and
// cookies. supertest sends HTTP requests straight to the app object without
// opening a port. The only thing faked is the database (see lib/db.js).
const request = require('supertest');
const app = require('../../server');

const GOOD_LOGIN = { username: 'admin', password: 'password' };

describe('POST /api/login', () => {
  test('correct credentials return ok and set the auth cookie', async () => {
    const res = await request(app).post('/api/login').send(GOOD_LOGIN);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(res.headers['set-cookie'][0]).toMatch(/^token=/);
  });

  test('wrong credentials return 401 and no cookie', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ username: 'admin', password: 'nope' });
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ ok: false });
    expect(res.headers['set-cookie']).toBeUndefined();
  });
});

describe('protected routes without a cookie', () => {
  test('GET /api/me returns 401', async () => {
    const res = await request(app).get('/api/me');
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
  });

  test('GET /api/widgets returns 401', async () => {
    const res = await request(app).get('/api/widgets');
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
  });
});

describe('session lifecycle', () => {
  test('login -> me -> widgets -> logout -> me', async () => {
    // request.agent keeps cookies between calls, like a browser would.
    const agent = request.agent(app);

    const loginRes = await agent.post('/api/login').send(GOOD_LOGIN);
    expect(loginRes.statusCode).toBe(200);

    const meRes = await agent.get('/api/me');
    expect(meRes.statusCode).toBe(200);
    expect(meRes.body).toEqual({ username: 'admin' });

    const widgetsRes = await agent.get('/api/widgets');
    expect(widgetsRes.statusCode).toBe(200);
    expect(widgetsRes.body).toHaveLength(3);
    expect(widgetsRes.body[0]).toEqual({
      id: 1,
      name: 'Widget A',
      description: 'A basic widget',
      price: '9.99',
    });

    const logoutRes = await agent.post('/api/logout');
    expect(logoutRes.statusCode).toBe(200);
    expect(logoutRes.body).toEqual({ ok: true });

    const meAfterLogout = await agent.get('/api/me');
    expect(meAfterLogout.statusCode).toBe(401);
  });
});

describe('static files', () => {
  test('serves the app shell and the front-end bundle', async () => {
    const rootRes = await request(app).get('/');
    expect(rootRes.statusCode).toBe(200);
    expect(rootRes.text).toContain('<div id="root">');

    const bundleRes = await request(app).get('/static/js/bundle.js');
    expect(bundleRes.statusCode).toBe(200);
    expect(bundleRes.headers['content-type']).toMatch(/javascript/);
  });
});
