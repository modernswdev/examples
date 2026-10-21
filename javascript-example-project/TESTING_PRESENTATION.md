---
marp: true
paginate: true
---

# Automated Testing: Unit, Integration, End-to-End

### A walk through `javascript-example-project`

45 minutes. One small app, three kinds of tests, and the code that makes them possible.

<!--
Timing budget is in each slide title. The slides sum to 44 minutes, leaving a minute of slack.
Have a terminal open in the project root with a clean git tree. Run `npm run test:all` once before
class so the browser is warm. Slides marked LIVE are where you switch to the terminal or editor.
Renders with Marp (VS Code extension or `npx @marp-team/marp-cli`); reads fine as plain Markdown too.
-->

---

## Agenda `⏱ 1 min`

| Minutes | Topic |
|---|---|
| 0–3 | What a test is |
| 3–17 | The app: a tour of the code |
| 17–32 | The three test layers, and how each one is written |
| 32–37 | Coverage: what the number means |
| 37–44 | A bug only one layer can see, CI, wrap-up |

By the end you should be able to open any file in `test/` and say what is real, what is faked, and why.

---

## What a test is `⏱ 2 min`

Every automated test has the same three parts:

```js
test('hasValidAuthToken rejects anything else', () => {
  const token = 'wrong-token';                 // 1. Arrange: set up inputs
  const result = hasValidAuthToken(token);     // 2. Act: run the code
  expect(result).toBe(false);                  // 3. Assert: check the outcome
});
```

A test is a **claim** about the code, written as code, that a machine can check in milliseconds.

The suite is the set of claims we have bothered to write down. Nothing more.

<!--
Ask: what happens if the assert line is missing? The test "passes" and proves nothing.
We'll come back to that when we talk about coverage.
-->

---

## The app in one picture `⏱ 2 min`

```
 Browser                          Server (Node + Express)              Data
┌──────────────────┐   HTTP      ┌─────────────────────────┐        ┌──────────┐
│ public/index.html│ ──────────► │ server.js               │ ─────► │ Postgres │
│ bundle.js        │  fetch()    │   routes + middleware   │  SQL   │   or     │
│  Login form      │ ◄────────── │ lib/auth-utils.js       │ ◄───── │ fake     │
│  Widgets list    │   JSON +    │   pure functions        │        │ (tests)  │
└──────────────────┘   cookie    │ lib/db.js               │        └──────────┘
                                 │   createPool()          │
                                 └─────────────────────────┘
```

Four API routes: `POST /api/login`, `POST /api/logout`, `GET /api/me`, `GET /api/widgets`.

Login sets a cookie. The two `GET` routes require it.

<!--
Point at each box as you name it. Every test layer we see today draws its boundary somewhere
on this picture. Unit tests live inside lib/. Integration tests cover server.js + lib/.
E2E covers the whole thing left to right.
-->

---

## Code tour 1: `lib/auth-utils.js` `⏱ 2 min`

```js
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
```

**Pure functions.** Input in, output out. No Express, no database, no `require` of anything.
This is what makes them *unit-testable*: you can call them from anywhere with any value.

<!--
Ask: what inputs would you throw at normalizeCredentials to break it? undefined, a number,
an array. Those are exactly the unit tests we'll see.
-->

---

## Code tour 2: `server.js`, the middleware `⏱ 2 min`

```js
const { AUTH_TOKEN, hasValidAuthToken, hasLoginFields } = require('./lib/auth-utils');
const { createPool, initDb } = require('./lib/db');

const app = express();
const pool = createPool();

app.use(express.json());      // parse JSON bodies into req.body
app.use(cookieParser());      // parse cookies into req.cookies

// Middleware for routes that require the login cookie.
function requireAuth(req, res, next) {
  if (!hasValidAuthToken(req.cookies.token)) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}
```

`requireAuth` is the **wiring** between the pure function and HTTP. The function decides;
the middleware turns the decision into a 401 or lets the request through.

<!--
Key vocabulary for later: "the function" vs "the wiring". Unit tests check the function.
Integration tests check the wiring.
-->

---

## Code tour 3: `server.js`, the login route `⏱ 2 min`

```js
app.post('/api/login', async (req, res) => {
  if (!hasLoginFields(req.body)) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  const { username, password } = req.body;
  try {
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE username=$1 AND password=$2',
      [username, password]
    );
    if (rows.length > 0) {
      res.cookie('token', AUTH_TOKEN, { httpOnly: true });
      return res.json({ ok: true });
    }
    res.status(401).json({ ok: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
});
```

Count the exits: **400** missing fields, **200** with cookie, **401** wrong password, **500** DB failure.
Four paths. Keep that number in mind for the coverage section.

<!--
Have students count the exits before you reveal. Four is the answer. Write "4 paths" on the board.
-->

---

## Code tour 4: the two lines that make `server.js` testable `⏱ 2 min`

```js
// Only start listening when run directly (`node server.js`).
// Tests import `app` and drive it without opening a port.
if (require.main === module) {
  initDb(pool).then(() => {
    app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
  });
}

module.exports = app;
```

- `require.main === module` is true only for `node server.js`. When a test does
  `require('../../server')`, it is false, so **no port opens**.
- `module.exports = app` hands the configured Express app to whoever asked for it.

Without these two lines, every test would need a running server on a free port.

<!--
This is the single most common reason student projects are "hard to test": the file that defines
the app also starts it. Separate "build the app" from "run the app".
-->

---

## Code tour 5: `lib/db.js`, the swap `⏱ 2 min`

```js
function createFakePool() {
  async function query(text, params = []) {
    const sql = String(text).toLowerCase();
    if (sql.startsWith('select * from users')) {
      const [username, password] = params;
      return { rows: SEED_USERS.filter((u) => u.username === username && u.password === password) };
    }
    if (sql.includes('from widgets')) {
      return { rows: SEED_WIDGETS };
    }
    return { rows: [] };
  }
  return { query, connect: async () => ({ query, release() {} }) };
}

function createPool() {
  if (process.env.NODE_ENV === 'test') return createFakePool();
  return new Pool({ host: process.env.POSTGRES_HOST || 'db', /* ... */ });
}
```

Same **interface** (`pool.query(sql, params)` returns `{ rows }`), two implementations.
Jest sets `NODE_ENV=test` automatically, so tests get the fake and never need Postgres.

<!--
Ask: what does the fake NOT prove? That the SQL is valid, that the schema matches.
That's a real gap and it goes on the "what we don't test" slide in your final presentation.
-->

---

## Code tour 6: the front end, `public/static/js/bundle.js` `⏱ 2 min`

```js
btn.addEventListener('click', async () => {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ username: username.value, password: password.value })
  });
  if (res.ok) onLogin(); else alert('login failed');
});
```

On page load the app calls `GET /api/me`. 401 means show the login form; 200 means show the widgets.

Note what this code is: **browser JavaScript**. Node never runs it. Only a browser does.
Hold that thought for the end-to-end layer.

---

## The three layers `⏱ 2 min`

| Layer | Folder | Command | What is real | What is faked | Speed |
|---|---|---|---|---|---|
| Unit | `test/unit/` | `npm run test:unit` | One module of pure functions | Everything else is absent | ~0.1 s |
| Integration | `test/integration/` | `npm run test:integration` | Express app, routes, middleware, cookies, JSON | The database | ~0.2 s |
| End-to-end | `test/e2e/` | `npm run test:e2e` | Real Chromium, real HTTP, real server process, real front end | The database | ~2 s + browser start |

`npm test` runs the fast two. `npm run test:all` runs all three.

**The pyramid:** many cheap tests at the bottom, few expensive ones at the top.
Not because E2E tests are bad, but because each one costs seconds and fails vaguely.

<!--
Draw the pyramid. Ask: why not make everything E2E, since it tests the most?
Answer: 10 seconds × 500 tests = 83 minutes per run. And when it fails, you get "element not found",
not "expected 401, received 200".
-->

---

## Layer 1: the unit test, `test/unit/auth-utils.test.js` `⏱ 2 min`

```js
const { AUTH_TOKEN, hasValidAuthToken, normalizeCredentials, hasLoginFields } = require('../../lib/auth-utils');

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
  test('turns non-string values into empty strings', () => {
    expect(normalizeCredentials({ username: 42, password: ['x'] })).toEqual({ username: '', password: '' });
  });
});
```

Jest vocabulary: `describe` groups, `test` is one claim, `expect(...).toBe(...)` is the assertion.
`toBe` is `===`. `toEqual` compares object contents.

<!--
Point out: the test reaches inputs (undefined, 42, an array) that no HTTP request could ever send.
Only a unit test can get there.
-->

---

## Layer 2: the integration test, `test/integration/api.test.js` `⏱ 3 min`

```js
const request = require('supertest');
const app = require('../../server');       // no port opened, remember?

const GOOD_LOGIN = { username: 'admin', password: 'password' };

test('correct credentials return ok and set the auth cookie', async () => {
  const res = await request(app).post('/api/login').send(GOOD_LOGIN);
  expect(res.statusCode).toBe(200);
  expect(res.body).toEqual({ ok: true });
  expect(res.headers['set-cookie'][0]).toMatch(/^token=/);
});

test('GET /api/widgets returns 401', async () => {
  const res = await request(app).get('/api/widgets');
  expect(res.statusCode).toBe(401);
  expect(res.body).toEqual({ error: 'unauthorized' });
});
```

**supertest** builds a real HTTP request and hands it to the app object in memory.
Real routing, real `express.json()`, real `requireAuth`, real `Set-Cookie` header. Fake database.

<!--
Walk the second test through the picture: request → Express → requireAuth → hasValidAuthToken(undefined)
→ false → 401 JSON. Four pieces of real code exercised by five lines of test.
-->

---

## Layer 2, continued: a session `⏱ 2 min`

```js
test('login -> me -> widgets -> logout -> me', async () => {
  const agent = request.agent(app);      // keeps cookies between calls, like a browser

  const loginRes = await agent.post('/api/login').send(GOOD_LOGIN);
  expect(loginRes.statusCode).toBe(200);

  const meRes = await agent.get('/api/me');
  expect(meRes.body).toEqual({ username: 'admin' });

  const widgetsRes = await agent.get('/api/widgets');
  expect(widgetsRes.body).toHaveLength(3);
  expect(widgetsRes.body[0]).toEqual({ id: 1, name: 'Widget A', description: 'A basic widget', price: '9.99' });

  await agent.post('/api/logout');
  expect((await agent.get('/api/me')).statusCode).toBe(401);
});
```

`request.agent` is the difference between "a request" and "a user". It holds the cookie jar.

This one test checks the **contract** between four routes: what login gives, the others accept.

---

## Layer 3: end-to-end with Playwright `⏱ 3 min`

`playwright.config.js` starts the real server before any test runs:

```js
webServer: {
  command: 'node server.js',
  url: `http://localhost:${PORT}/`,
  env: { NODE_ENV: 'test', PORT: String(PORT) },   // fake DB, port 3100
},
```

`test/e2e/app.spec.js` then drives a real browser:

```js
test('login shows the widgets, logout returns to the form', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('username').fill('admin');
  await page.getByPlaceholder('password').fill('password');
  await page.getByRole('button', { name: 'Login' }).click();

  await expect(page.getByRole('heading', { name: 'Widgets' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 3 })).toHaveCount(3);

  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page.getByPlaceholder('username')).toBeVisible();
});
```

<!--
Two things to say: (1) `require.main === module` is true here, because Playwright ran `node server.js`,
so the server really listens. (2) `expect(...).toBeVisible()` waits up to 5 s. No sleep() calls.
This is the only test that runs bundle.js.
-->

---

## What E2E locators are saying `⏱ 1 min`

| Locator | Finds |
|---|---|
| `getByPlaceholder('username')` | The input a user would see labelled "username" |
| `getByRole('button', { name: 'Login' })` | The thing a screen reader calls a button named Login |
| `getByRole('heading', { level: 3 })` | Every `<h3>` on the page |

Locators describe the page **the way a user sees it**, not the way the DOM is built.
Rename a CSS class and these still work. Change the button text and they fail, which is correct:
the user would notice too.

---

## LIVE: run all three `⏱ 2 min`

```bash
npm run test:all
```

Watch the clock on each layer:

```
Unit:         6 passed   ~0.1 s
Integration:  6 passed   ~0.2 s
E2E:          3 passed   ~2 s, plus browser launch
```

Same app, three answers to the question "does it work?", each from a different distance.

<!--
Switch to the terminal. While it runs, ask: which of these would you run on every file save?
Which before every commit? Which only in CI?
-->

---

## Coverage: what the number means `⏱ 3 min`

```bash
npm run test:coverage
```

```
File            | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
 server.js      |   80.95 |       80 |   71.42 |   82.92 | 24,38-39,57-58,67-68
 auth-utils.js  |     100 |      100 |     100 |     100 |
 db.js          |   48.27 |    30.43 |   57.14 |   46.15 | 31,35,41-85
```

Every column is the same formula: **items that ran at least once ÷ items in the file**.

| Column | Item being counted |
|---|---|
| Stmts | each statement |
| Branch | each *path* out of an `if`, `? :`, `&&`, `\|\|` |
| Funcs | each function |
| Lines | each line containing a statement |

`npm run coverage:summary` prints the raw counts: `server.js` lines are 34 ÷ 41 = 82.92%.

<!--
Open coverage/index.html if there's time: red lines are the uncovered ones. It's the same data
as the last column, in a form students find much easier to read.
-->

---

## Coverage: reading the uncovered lines `⏱ 2 min`

Back to the login route and its **four exits**:

| Exit | Line | Covered? | Why |
|---|---|---|---|
| 400 missing fields | 24 | **No** | No integration test sends a body without a password |
| 200 with cookie | 33–34 | Yes | `correct credentials` test |
| 401 wrong password | 36 | Yes | `wrong credentials` test |
| 500 DB failure | 38–39 | **No** | The fake never throws |

`hasLoginFields` has a unit test and is at 100%. The **function** is tested.
Line 24, the **wiring** of that function into the route, is not. Coverage found the gap; no human did.

What coverage cannot tell you: whether the tests that ran those lines *asserted anything*.

<!--
This is the payoff of the "function vs wiring" vocabulary from the middleware slide.
If you have 5 extra minutes, do Demo 5 from TESTING_PLAYBOOK.md here: change 400 to 200,
tests stay green, add the test, red, fix, green.
-->

---

## LIVE: a bug only one layer can see `⏱ 3 min`

In `public/static/js/bundle.js`, change the login request:

```js
method: 'GET',        // was 'POST'
```

```bash
npm test          # unit + integration
```
Expected: **12 passed.** The server is fine. Nobody has asked it the wrong question yet.

```bash
npm run test:e2e
```
Expected: **1 passed, 2 failed.** Both tests that click Login time out waiting for the next screen.

```bash
git checkout -- public/static/js/bundle.js
```

<!--
The point: the fast layers never run bundle.js, so they can't see it. The browser does.
Every layer has a blind spot, and the layers above it exist to cover that blind spot.
If a student asks "why not mock fetch and unit-test bundle.js?": you could, and it would catch this
bug, but it would trust your mock to behave like the real server. E2E trusts nothing.
-->

---

## How this runs in CI `⏱ 1 min`

`.github/workflows/node.yml`, two jobs:

```
fast-tests  (Jest)            e2e-tests  (Playwright)
  npm ci                        needs: fast-tests
  npm run test:unit      ───►   npx playwright install chromium
  npm run test:integration      npm run test:e2e
  npm run test:coverage         upload screenshots on failure
  coverage table → job summary
```

The slow job only runs if the fast job passes. Same pyramid, drawn in YAML.

---

## The same lesson in Python `⏱ 1 min`

`python-example-project` is the same app and the same three layers:

| | Node | Python |
|---|---|---|
| Pure functions | `lib/auth-utils.js` | `app/auth_utils.py` |
| App without a port | `module.exports = app` | `create_app()` |
| Unit / integration | Jest + supertest | pytest + Flask test client |
| End-to-end | Playwright | Playwright for Python |
| Coverage | Istanbul via `jest --coverage` | coverage.py via `pytest --cov` |

One difference worth knowing: coverage.py does not count `x if c else y` or `and` as branches. Istanbul does.
Same code, different tool, different number. Always ask *which* tool and *which* metric.

---

## What to take away `⏱ 2 min`

1. **Separate building the app from running it.** `module.exports = app` plus
   `require.main === module` is what made everything else possible.
2. **Pure functions get unit tests. Wiring gets integration tests. User journeys get E2E.**
   Each layer reaches inputs the others cannot.
3. **Fakes have the same interface as the real thing** (`pool.query` returns `{ rows }`),
   and you must be able to say what they do not prove.
4. **Green means "nothing we check is broken."** Coverage tells you what you never executed.
   Neither tells you what you asserted.
5. For your final presentation: show the test run, name the layers, and name the gaps.
   The rubric rewards knowing what is *not* tested as much as what is.

<!--
End here. If time remains, take questions or run Demo 2 from the playbook (break hasValidAuthToken,
watch all three layers fail, compare the error messages). For a TDD-focused follow-up session,
Demo 6 in the playbook builds a search feature test-first in six red/green cycles.
-->

---

## Exercises

1. Write the integration test for line 24 (the 400 exit). Watch coverage move.
2. Cover the 500 exits by making the fake pool throw (`jest.mock('../../lib/db')`).
3. Add an E2E test that a second browser context is not logged in.
4. Write a test that calls every function in `lib/auth-utils.js` and asserts nothing.
   Check its coverage. Discuss what the number is worth.
5. Read `lib/db.js` lines 41–85. They are at 0%. What would it take to test them?
