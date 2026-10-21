# Automated Testing Playbook

A live teaching script for a class session on automated testing, using this repo.
Every command and every expected output below was run against this exact code, so
if you follow the steps you will see what the script says you will see.

## What students should leave with

- The difference between **unit**, **integration**, and **end-to-end (E2E)** tests,
  in terms of *what is real and what is faked* at each layer.
- Why faster tests should be more numerous (the test pyramid).
- How to read a failing test: expected vs. received.
- What **coverage** measures, how the percentages are calculated, and how to count
  them by hand for a small file.
- Why a green suite is not proof of correctness, and how coverage exposes blind spots.
- The red / green cycle: write the test, watch it fail, fix, watch it pass.
- Test-driven development: building a new feature one failing test at a time, and refactoring on green.

## The three layers in this repo

| Layer | Folder | Command | What is real | What is faked | Speed |
|---|---|---|---|---|---|
| Unit | `test/unit/` | `npm run test:unit` | One module of pure functions (`lib/auth-utils.js`) | Everything else is absent | ~0.1 s |
| Integration | `test/integration/` | `npm run test:integration` | The Express app, routes, middleware, cookies, JSON | The database (`lib/db.js` in-memory fake) | ~0.2 s |
| End-to-end | `test/e2e/` | `npm run test:e2e` | A real Chromium browser, real HTTP, the real server process, the real front end | The database only | ~2 s (plus browser start) |

Other commands:

| Command | What it does |
|---|---|
| `npm test` | Unit + integration. Run this constantly while coding. |
| `npm run test:all` | All three layers. |
| `npm run test:coverage` | Unit + integration with a coverage table, plus an HTML report in `coverage/index.html`. |
| `npm run test:coverage:unit` | Coverage from the unit tests alone. |
| `npm run test:coverage:integration` | Coverage from the integration tests alone. |
| `npm run coverage:summary` | Reprints the last coverage run as a Markdown table with the raw counts. |

How each layer talks to the app:

- Unit tests `require` one module and call functions.
- Integration tests `require('../../server')` and use **supertest** to send HTTP requests
  to the app object in memory. No port is opened.
- E2E tests let **Playwright** start `node server.js` on port 3100 (see `playwright.config.js`),
  then drive Chromium against it: fill fields, click buttons, look for text.

The app uses `NODE_ENV=test` to swap Postgres for an in-memory fake. Jest sets that
automatically; the Playwright config sets it for the server it launches.

## Pre-class checklist (5 minutes, do this the day before too)

```bash
cd javascript-example-project
npm install
npx playwright install chromium     # one-time browser download, ~150 MB
git status                          # must be clean: the demos edit files and you restore with git
npm run test:all
```

Expected baseline:

```
Unit:         1 suite,  6 tests passed
Integration:  1 suite,  6 tests passed
E2E:          3 passed
```

If `git status` is not clean, commit or stash first. Every demo below ends with
`git checkout -- <file>` to undo the deliberate bug, and that only works from a clean tree.

## Demo 1: Run the pyramid (8 minutes)

Run the three layers one at a time and narrate what each one touches.

```bash
npm run test:unit
```

Open `test/unit/auth-utils.test.js`. Talking points: no Express, no HTTP, no DB, no browser.
Tests a function with inputs and expected outputs. Runs in about a tenth of a second.

```bash
npm run test:integration
```

Open `test/integration/api.test.js`. Talking points: the real app is loaded, requests
go through real routing, real middleware (`requireAuth`), real cookie handling. The
`session lifecycle` test uses `request.agent` so cookies persist between calls, the way a
browser does. Then open `lib/db.js` and show the fake: it answers the two SQL queries the
server makes. Ask: what does that fake *not* tell us? (Whether the real SQL is valid.)

```bash
npm run test:e2e
```

Open `test/e2e/app.spec.js` and `playwright.config.js`. Talking points: Playwright started
the real server, launched a real browser, typed into real inputs. This is the only layer
that executes `public/static/js/bundle.js`. It is also the only layer that takes seconds
instead of milliseconds. That is the pyramid: many cheap tests at the bottom, few expensive
ones at the top.

## Demo 2: One bug, three safety nets (10 minutes)

Introduce a bug at the bottom of the stack and watch every layer catch it, then compare
how *useful* each failure message is.

In `lib/auth-utils.js`, make `hasValidAuthToken` always succeed:

```js
function hasValidAuthToken(token) {
  return true;
}
```

```bash
npm run test:unit
```

Expected: 1 failed, 5 passed. The failure says exactly what is wrong:

```
✕ rejects anything else
    Expected: false
    Received: true
```

```bash
npm run test:integration
```

Expected: 3 failed, 3 passed. Both 401 tests and the session lifecycle fail with
`Expected: 401, Received: 200`. Ask students: the test says "/api/me returns 200 without
a cookie". Does it tell you *why*? (No. It tells you the symptom, not the line.)

```bash
npm run test:e2e
```

Expected: 3 failed, and it takes about 35 seconds because the tests wait for elements
that never appear. The first failure reads:

```
Error: expect(locator).toBeVisible() failed
Locator: getByPlaceholder('username')
Expected: visible
```

Open the screenshot Playwright saved under `test-results/` and show the dashboard
rendered without a login. Ask: which layer would you rather debug from? Which one
would you rather have run on every save?

Restore:

```bash
git checkout -- lib/auth-utils.js
npm test
```

## Demo 3: The bug only E2E can see (8 minutes)

Now break something unit and integration tests cannot reach: the front end.

In `public/static/js/bundle.js`, inside the `Login` click handler, change the login
request method:

```js
const res = await fetch('/api/login', {
  method: 'GET',        // was 'POST'
```

```bash
npm test
```

Expected: 12 passed. Both fast layers are green. The server is fine; nobody asked it
the wrong question yet.

```bash
npm run test:e2e
```

Expected: 1 passed, 2 failed. Both tests that click Login fail: the "wrong password"
test never sees its alert, and the "login shows the widgets" test times out waiting for
the `Widgets` heading. (Browsers refuse to send a GET with a body, so the click handler
throws before it can do anything. Open the screenshot: the form is still sitting there.)

Talking points:

- The server tests could not catch this because the bug is in code they never run.
- We could have written a JSDOM test of `bundle.js` with a mocked `fetch`. That would
  catch this specific bug but would trust our mock to behave like the real server.
  E2E trusts nothing.
- This is why you keep a few E2E tests even though they are slow.

Restore:

```bash
git checkout -- public/static/js/bundle.js
```

## Demo 4: Coverage. What the numbers mean and how to calculate them (15 minutes)

### 4a. The four numbers

```bash
npm run test:coverage
```

Expected table (the `Uncovered Line #s` column is the useful one):

```
File            | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
All files       |   70.51 |    56.09 |   70.58 |   71.62 |
 server.js      |   80.95 |       80 |   71.42 |   82.92 | 24,38-39,57-58,67-68
 auth-utils.js  |     100 |      100 |     100 |     100 |
 db.js          |   48.27 |    30.43 |   57.14 |   46.15 | 31,35,41-85
```

Every percentage is the same formula:

```
coverage % = (items executed at least once) / (items in the file) × 100
```

The four columns just count different kinds of item:

| Metric | What is counted | Counted as covered when |
|---|---|---|
| Statements | Every executable statement: a `const`, a `return`, a function call, an `if`... | It ran at least once |
| Branches | Every *path* out of a decision: `if`/`else`, `? :`, `&&`, `\|\|`, `switch` cases. An `if` with no `else` still has two paths: taken and skipped | That path ran at least once |
| Functions | Every function or arrow function | It was called at least once |
| Lines | Every source line that contains a statement | Any statement on that line ran |

Lines and statements are usually close. They differ when one line holds two statements
or one statement spans several lines.

### 4b. Show the arithmetic

```bash
npm run coverage:summary
```

This reprints the last run with the raw counts:

```
| File              | Statements     | Branches      | Functions     | Lines          |
| server.js         | 80.95% (34/42) | 80% (8/10)    | 71.42% (5/7)  | 82.92% (34/41) |
| lib/auth-utils.js | 100% (7/7)     | 100% (8/8)    | 100% (3/3)    | 100% (7/7)     |
| lib/db.js         | 48.27% (14/29) | 30.43% (7/23) | 57.14% (4/7)  | 46.15% (12/26) |
| **All files**     | 70.51% (55/78) | 56.09% (23/41)| 70.58% (12/17)| 71.62% (53/74) |
```

Do one on the board: `server.js` lines, 34 ÷ 41 = 0.8292, so 82.92%. Then point out the
"All files" row is *not* the average of the file percentages. It is total covered over
total items: 53 ÷ 74 = 71.62%. A big file pulls the total toward its own number.

### 4c. Count a file by hand, then check

Open `lib/auth-utils.js`. It is 25 lines and students can count it in three minutes.
Have them count before you reveal the answer.

```js
 1  const AUTH_TOKEN = 'fake-jwt-token';                  // statement 1
 3  function hasValidAuthToken(token) {                   // function 1
 4    return token === AUTH_TOKEN;                        // statement 2
 7  function normalizeCredentials(body) {                 // function 2
 8    const payload = body || {};                         // statement 3, branch site A (2 paths)
 9    return {                                            // statement 4 (spans lines 9-12)
10      username: typeof ... === 'string' ? ... : '',     //             branch site B (2 paths)
11      password: typeof ... === 'string' ? ... : '',     //             branch site C (2 paths)
15  function hasLoginFields(body) {                       // function 3
16    const { username, password } = normalize...(body);  // statement 5
17    return username.length > 0 && password.length > 0;  // statement 6, branch site D (2 paths)
20  module.exports = { ... };                             // statement 7
```

Answer: 7 statements, 3 functions, 4 decision points with 2 paths each = 8 branch paths,
7 lines that contain a statement.

Now the interesting part. Which of those 8 paths does the *integration* suite reach?
Ask students to predict, then run:

```bash
npm run test:coverage:integration
```

Expected row:

```
auth-utils.js  |  100 |  62.5 |  100 |  100 | 8-11
```

100% of statements, 100% of lines, 100% of functions, and only 5 of 8 branch paths.
The three missed paths are: `body` falsy on line 8, username not a string on line 10,
password not a string on line 11. Express always hands the route a body object with
string fields, so the integration tests physically cannot reach those paths. Only the
unit tests, which call the function directly with `undefined` and `42`, can:

```bash
npm run test:coverage:unit
```

Expected: `auth-utils.js` at 100% across the board, and `server.js` at 0% because the
unit tests never load it. Put the two runs side by side. Each layer covers what it can
reach, and the totals in `npm run test:coverage` are the union.

Talking points:

- Line coverage of 100% with branch coverage of 62.5% on the same file is normal. Branch
  coverage is the stricter and more honest number. When someone quotes one coverage
  number, ask which one.
- Coverage counts *execution*, not *checking*. A test that calls a function and asserts
  nothing gives 100% coverage and 0% protection. Demo 5 makes this concrete.

### 4d. How the tool gets the numbers

Students should know this is not magic. Jest uses Istanbul, which rewrites each source
file on the fly before running it, inserting a counter at every statement, every branch
path, and every function. Conceptually:

```js
// what you wrote
function hasValidAuthToken(token) {
  return token === AUTH_TOKEN;
}

// what actually runs under --coverage
function hasValidAuthToken(token) {
  counters.f[0]++;                 // function 0 was entered
  counters.s[1]++;                 // statement 1 ran
  return token === AUTH_TOKEN;
}
```

When the tests finish, every counter that is above zero is "covered". The report divides
covered by total, and the HTML report colors any zero-count line red:

```bash
open coverage/index.html      # macOS; on Windows: start coverage/index.html
```

Click into `server.js` and show the red lines. This is the same information as the
`Uncovered Line #s` column, but students find the colored source much easier to read.

Why E2E is not in these numbers: the counters live inside the process that runs the
code. In the E2E layer that process is a separate `node server.js` that Playwright starts
and kills, so nothing collects its counters. E2E tests are measured by user journeys
covered, not lines covered. That is fine: it is a different question.

## Demo 5: Green is not proof. Red/green on a coverage gap (12 minutes)

Go back to the uncovered lines in `server.js` from Demo 4:

- **Line 24**: the `400` response when the login body is missing a field.
- **38-39 and 57-58**: the `500` responses when the database throws.
- **67-68**: the `app.listen` block, which tests never run on purpose.

Now point at the unit tests: `hasLoginFields` has a passing unit test. The *function*
is tested. The *wiring* of that function into the route is not. This is the gap between
unit and integration testing, made visible by a number.

**Step 1: break the wiring.** In `server.js` line 24, change the status code:

```js
return res.status(200).json({ error: 'username and password are required' });
```

```bash
npm test
```

Expected: 12 passed. Green, with an obvious bug in the code. Say it out loud:
green means "nothing we check is broken", not "nothing is broken".

**Step 2: write the test first (red).** Add this to the `POST /api/login` block in
`test/integration/api.test.js`:

```js
test('missing fields return 400 before touching the database', async () => {
  const res = await request(app).post('/api/login').send({ username: 'admin' });
  expect(res.statusCode).toBe(400);
  expect(res.body).toEqual({ error: 'username and password are required' });
});
```

```bash
npm run test:integration
```

Expected: 1 failed, 6 passed, with `Expected: 400, Received: 200`.

**Step 3: fix (green).** Change line 24 back to `400`.

```bash
npm run test:coverage
```

Expected: 13 passed, and line 24 is gone from the uncovered list:

```
server.js  |  83.33 |  90 |  71.42 |  85.36 | 38-39,57-58,67-68
```

Have a student do the arithmetic: one more statement covered, 35 ÷ 42 = 83.33%. One more
branch path, 9 ÷ 10 = 90%.

Decide together whether to keep the new test. (Keep it. Commit it. That is how suites grow.)

If a student already merged this test before class, the gap is gone: use the `500`
branches instead. They need `jest.mock('../../lib/db')` to make `pool.query` throw,
which is a good stretch exercise rather than a live demo.

## Demo 6: TDD. Build a feature test-first (15 minutes)

Demos 2 to 5 used tests to catch bugs in code that already existed. Test-driven development
turns that around: **write the test before the code, and let the failing test tell you what
to write next.** The loop is red (a failing test), green (the smallest change that passes),
refactor (clean up while the tests hold you).

The feature: a `?q=` search parameter on `/api/widgets` that matches name or description,
case-insensitive. Nothing for it exists in the repo yet. That is the point.

Rules for the live demo, say them out loud:

1. Never write production code without a failing test that demands it.
2. Write the *smallest* code that passes, even if it looks silly.
3. Only refactor on green.

### Cycle 1: the module does not exist

Create `test/unit/widget-utils.test.js`:

```js
const { filterWidgets } = require('../../lib/widget-utils');

const WIDGETS = [
  { id: 1, name: 'Widget A', description: 'A basic widget', price: '9.99' },
  { id: 2, name: 'Widget B', description: 'An advanced widget', price: '19.99' },
  { id: 3, name: 'Widget C', description: 'A premium widget', price: '29.99' },
];

test('empty query returns every widget', () => {
  expect(filterWidgets(WIDGETS, '')).toEqual(WIDGETS);
});
```

```bash
npm run test:unit
```

Expected: **red**, before any assertion runs:

```
Cannot find module '../../lib/widget-utils' from 'test/unit/widget-utils.test.js'
```

Students often think this does not count. It does. The test told you the first thing to build.

Create `lib/widget-utils.js` with the smallest thing that passes:

```js
function filterWidgets(widgets, query) {
  return widgets;
}

module.exports = { filterWidgets };
```

Run again. Expected: **green**, 7 passed. Yes, it ignores the query. No test asked for more.

### Cycle 2: match on name

Add to the test file:

```js
test('matches on name, ignoring case', () => {
  expect(filterWidgets(WIDGETS, 'widget b')).toEqual([WIDGETS[1]]);
});
```

Run. Expected: **red**, the diff shows all three widgets received where one was expected.

Make it pass:

```js
function filterWidgets(widgets, query) {
  const q = query.toLowerCase();
  return widgets.filter((w) => w.name.toLowerCase().includes(q));
}
```

Run. Expected: **green**, 8 passed. Point out cycle 1's test still passes: `''` is included in every string.

### Cycle 3: match on description, ignore whitespace

```js
test('matches on description and ignores surrounding whitespace', () => {
  expect(filterWidgets(WIDGETS, '  premium ')).toEqual([WIDGETS[2]]);
});
```

Run. Expected: **red**, received `[]`.

```js
function filterWidgets(widgets, query) {
  const q = query.trim().toLowerCase();
  return widgets.filter(
    (w) => w.name.toLowerCase().includes(q) || w.description.toLowerCase().includes(q)
  );
}
```

Run. Expected: **green**, 9 passed.

### Cycle 4: no query at all

The route will call this with `req.query.q`, which is `undefined` when the parameter is absent.

```js
test('a missing query returns every widget', () => {
  expect(filterWidgets(WIDGETS)).toEqual(WIDGETS);
});
```

Run. Expected: **red**, and this time it is a crash, not a wrong answer:

```
TypeError: Cannot read properties of undefined (reading 'trim')
```

Fix: `const q = (query || '').trim().toLowerCase();`. Run. Expected: **green**, 10 passed.

### Refactor on green

The filter line repeats itself. Clean it up:

```js
// Case-insensitive search over widget name and description.
function filterWidgets(widgets, query) {
  const q = (query || '').trim().toLowerCase();
  const includesQuery = (text) => (text || '').toLowerCase().includes(q);
  return widgets.filter((w) => includesQuery(w.name) || includesQuery(w.description));
}
```

Run. Expected: still **green**, 10 passed. That is what the tests are for: you just changed
every line of the function and know in a tenth of a second that nothing broke.

Now run `npm run test:coverage` and look at the new file:

```
widget-utils.js  |  100 |  83.33 |  100 |  100 | 4
```

A partial branch on line 4. The `(text || '')` fallback for a null description was added
"to be safe" during the refactor. No test demanded it, so no test covers it. Ask the class:
is that a missing test, or code that should not exist? (In Postgres `description` is nullable,
so it is a missing test. Write it, or delete the fallback. Either is honest. Leaving it is not.)

### Cycle 5: wire it into the route

The function works. The app does not use it yet. Same loop, one layer up. Add to
`test/integration/api.test.js`:

```js
describe('GET /api/widgets?q=', () => {
  test('filters by name or description', async () => {
    const agent = request.agent(app);
    await agent.post('/api/login').send(GOOD_LOGIN);
    const res = await agent.get('/api/widgets?q=premium');
    expect(res.statusCode).toBe(200);
    expect(res.body.map((w) => w.name)).toEqual(['Widget C']);
  });
});
```

```bash
npm run test:integration
```

Expected: **red**, received `['Widget A', 'Widget B', 'Widget C']`. The route ignores `q`.

In `server.js`, add the import next to the other `require` lines and change one line in the
widgets route:

```js
const { filterWidgets } = require('./lib/widget-utils');
// ...
    res.json(filterWidgets(rows, req.query.q));   // was: res.json(rows);
```

```bash
npm test
```

Expected: **green**, 17 passed across 3 suites. The session lifecycle test still passes because
no `q` means `undefined`, which cycle 4 handled.

### Where the loop stops

Ask: is the feature done? There is no search box in the UI, so a user cannot reach it.
TDD at the E2E layer would start with a Playwright test that types into a search box that
does not exist yet. That is follow-up exercise 2.

Talking points:

- Six red/green cycles, each under two minutes. The feature was never broken for longer than that.
- Every line in `lib/widget-utils.js` exists because a test demanded it. Coverage is 100% as a
  side effect, not a goal.
- The crash in cycle 4 is the kind of bug that normally ships. Here it was found before the
  route existed.

Restore (this demo creates two files and edits two):

```bash
rm lib/widget-utils.js test/unit/widget-utils.test.js
git checkout -- server.js test/integration/api.test.js
npm test
```

## Wrap-up (5 minutes)

- Tests are about **risk**, not count. Each layer buys confidence about a different thing.
- A passing suite tells you what you *checked*. Coverage tells you what you *never executed*.
  Neither tells you what you *asserted*.
- Coverage is covered ÷ total. Branch coverage is the honest one. The total is not an average.
- Write the test before the fix so you see it fail. A test that has never failed has
  never proven it can catch anything.
- TDD is the same idea applied to new code: red, green, refactor, in cycles of a minute or two.
  Every line exists because a test asked for it.
- Prompts: Which uncovered lines in `server.js` matter? Which layer should own each one?
  What would it take to test `lib/db.js` against a real Postgres?

The full set of demos runs about 70 minutes. For a 45-minute slot, pick: Demos 1, 3, 4a-b, and 5,
or Demos 1, 4a-b, and 6 if the session is about TDD.

## Compressed 20-minute version

1. `npm run test:all`, narrate the three layers from the table above (4 min)
2. Demo 3 only: break the front end, fast tests stay green, E2E fails (5 min)
3. Demo 4a and 4b: run coverage, explain the four numbers, do one division on the board (4 min)
4. Demo 5: break line 24, add the test, red, fix, green, watch the number move (6 min)
5. One-minute debrief: green is not proof, E2E sees what unit tests cannot

## Troubleshooting during a live demo

- **A demo passes or fails unexpectedly.** Save the file. Confirm with `git diff` that you
  edited the line you meant to. Re-run the single layer, not `test:all`.
- **`npm run test:e2e` says the browser is missing.** Run `npx playwright install chromium`.
- **E2E says port 3100 is in use.** A previous server is still running: `lsof -i :3100` and kill it,
  or change `PORT` in `playwright.config.js`.
- **E2E failure messages are long.** Read the first `Error:` line and the `Locator:` line, ignore
  the rest. Screenshots are in `test-results/`.
- **Coverage numbers differ from this file.** Someone added or removed a test or a line of
  source. The arithmetic still works; recompute from `npm run coverage:summary`.
- **`npm run coverage:summary` says no summary found.** Run `npm run test:coverage` first.
- **`git checkout --` does not restore.** The tree was not clean at the start. Compare against
  the snippets in this file and fix by hand.
- **Undo everything at once:**

  ```bash
  rm -f lib/widget-utils.js test/unit/widget-utils.test.js
  git checkout -- lib/auth-utils.js server.js public/static/js/bundle.js test/integration/api.test.js
  ```

## Follow-up exercises for students

1. Cover the `500` branches in `server.js` by mocking `lib/db.js` so `pool.query` rejects.
   Predict the new percentages before running, then check.
2. Finish Demo 6 test-first at the E2E layer: write a Playwright test that types into a search
   box and sees one card, watch it fail, then add the box to `bundle.js`.
3. Add a `coverageThreshold` to the Jest config in `package.json` so `npm run test:coverage`
   fails below a chosen branch percentage. Then delete a test and watch CI go red.
4. Write a test that calls every function in `lib/auth-utils.js` but asserts nothing. Show it
   gets 100% coverage. Discuss what that number is worth.
5. Add an E2E test that a second browser tab (a new Playwright `context`) is *not* logged in.
6. Run the integration tests against real Postgres from `docker-compose.yml` instead of the fake,
   and discuss what that would cost in CI time.
7. Look at `.github/workflows/node.yml`: the E2E job only runs if the fast job passes, and the
   coverage table lands in the job summary. Argue for or against that ordering.
