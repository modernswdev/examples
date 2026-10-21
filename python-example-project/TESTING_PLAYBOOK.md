# Automated Testing Playbook (Python)

A live teaching script for a class session on automated testing, using this repo.
Every command and every expected output below was run against this exact code, so
if you follow the steps you will see what the script says you will see.

This is the Python twin of the Node.js playbook in `javascript-example-project`. The
app, the API, the front end, and the demos are the same. The tools differ, and so
does one detail of how coverage is counted, which is called out in Demo 4.

## What students should leave with

- The difference between **unit**, **integration**, and **end-to-end (E2E)** tests,
  in terms of *what is real and what is faked* at each layer.
- Why faster tests should be more numerous (the test pyramid).
- How to read a failing test: the `assert` line and the `E` lines under it.
- What **coverage** measures, how the percentage is calculated, and how to count
  it by hand for a small file.
- Why a green suite is not proof of correctness, and how coverage exposes blind spots.
- The red / green cycle: write the test, watch it fail, fix, watch it pass.
- Test-driven development: building a new feature one failing test at a time, and refactoring on green.

## The three layers in this repo

| Layer | Folder | Command | What is real | What is faked | Speed |
|---|---|---|---|---|---|
| Unit | `tests/unit/` | `make test-unit` | One module of pure functions (`app/auth_utils.py`) | Everything else is absent | ~0.05 s |
| Integration | `tests/integration/` | `make test-integration` | The Flask app, routes, the `require_auth` decorator, cookies, JSON, and real SQL against SQLite | Nothing. The database is in memory instead of on disk, but it is real SQLite running the real SQL | ~0.05 s |
| End-to-end | `tests/e2e/` | `make test-e2e` | A real Chromium browser, real HTTP, the real server process, the real front end | Nothing | ~2 s (plus browser start) |

Other commands (each `make` target is one plain `pytest` command; see the `Makefile`):

| Command | What it does |
|---|---|
| `make test` (or `pytest`) | Unit + integration. Run this constantly while coding. |
| `make test-all` | All three layers. |
| `make coverage` | Unit + integration with a coverage table, plus an HTML report in `htmlcov/index.html`. |
| `make coverage-unit` | Coverage from the unit tests alone. |
| `make coverage-integration` | Coverage from the integration tests alone. |
| `make coverage-summary` | Reprints the last coverage run as a Markdown table with the raw counts. |

How each layer talks to the app:

- Unit tests `import` one module and call functions.
- Integration tests call `create_app(db_path=":memory:")` and use Flask's **test client**
  to send requests to the app in memory. No port is opened. The `client` fixture builds a
  fresh app and database for every test and closes it afterwards.
- E2E tests let `tests/e2e/conftest.py` start `python -m app` on port 8100 as a subprocess,
  wait for it to answer, then **Playwright** drives Chromium against it: fill fields, click
  buttons, look for text.

A difference from the Node.js twin worth saying out loud: there the database is a hand-written
fake, here it is real SQLite in memory. Ask students what the Python integration tests prove
that the Node.js ones cannot. (That the SQL is valid and the schema matches the queries.)

## Pre-class checklist (5 minutes, do this the day before too)

```bash
cd python-example-project
source .venv/bin/activate           # create it first with: python3 -m venv .venv && pip install -r requirements.txt
playwright install chromium         # one-time browser download, ~150 MB
git status                          # must be clean: the demos edit files and you restore with git
make test-all
```

Expected baseline:

```
Unit:         6 passed
Integration:  6 passed
E2E:          3 passed
```

If `git status` is not clean, commit or stash first. Every demo below ends with
`git checkout -- <file>` to undo the deliberate bug, and that only works from a clean tree.

## Demo 1: Run the pyramid (8 minutes)

Run the three layers one at a time and narrate what each one touches.

```bash
make test-unit
```

Open `tests/unit/test_auth_utils.py`. Talking points: no Flask, no HTTP, no DB, no browser.
Tests a function with inputs and expected outputs. Runs in a twentieth of a second.

```bash
make test-integration
```

Open `tests/integration/test_api.py`. Talking points: the real app is built by `create_app`,
requests go through real routing, the real `require_auth` decorator, real cookie handling,
and real SQL. The test client keeps cookies between calls, the way a browser does, which is
what the `session lifecycle` test relies on. Show the `client` fixture: setup before `yield`,
teardown after. Then open `app/db.py` and point out that the same `init_db` seeds both the
real file and the test database.

```bash
make test-e2e
```

Open `tests/e2e/test_app.py` and `tests/e2e/conftest.py`. Talking points: the `server`
fixture started the real server as a subprocess, Playwright launched a real browser and
typed into real inputs. This is the only layer that executes `app/static/js/app.js`. It is
also the only layer that takes seconds instead of milliseconds. That is the pyramid: many
cheap tests at the bottom, few expensive ones at the top.

## Demo 2: One bug, three safety nets (10 minutes)

Introduce a bug at the bottom of the stack and watch every layer catch it, then compare
how *useful* each failure message is.

In `app/auth_utils.py`, make `has_valid_auth_token` always succeed:

```python
def has_valid_auth_token(token):
    return True
```

```bash
make test-unit
```

Expected: 1 failed, 5 passed. pytest shows the exact assertion and the values in it:

```
>       assert has_valid_auth_token("wrong-token") is False
E       AssertionError: assert True is False
E        +  where True = has_valid_auth_token('wrong-token')
```

```bash
make test-integration
```

Expected: 3 failed, 3 passed. Both 401 tests and the session lifecycle fail with
`assert 200 == 401`. Ask students: the test says "/api/me returns 200 without a cookie".
Does it tell you *why*? (No. It tells you the symptom, not the line.)

```bash
make test-e2e
```

Expected: 3 failed, and it takes about a minute because the tests wait for elements that
never appear. The first failure reads:

```
E       AssertionError: Locator expected to be visible
E       Error: element(s) not found
E       Call log:
E         - Expect "to_be_visible" get_by_placeholder("username") with timeout 5000ms
E       Aria snapshot:
E       - heading "Widgets" [level=2]
E       - button "Logout"
```

The "Aria snapshot" is Playwright telling you what *was* on the page: the dashboard,
rendered without a login. Screenshots are also saved under `test-results/`. Ask: which
layer would you rather debug from? Which one would you rather have run on every save?

Restore:

```bash
git checkout -- app/auth_utils.py
make test
```

## Demo 3: The bug only E2E can see (8 minutes)

Now break something unit and integration tests cannot reach: the front end.

In `app/static/js/app.js`, inside the `Login` click handler, change the login
request method:

```js
const res = await fetch('/api/login', {
  method: 'GET',        // was 'POST'
```

```bash
make test
```

Expected: 12 passed. Both fast layers are green. The server is fine; nobody asked it
the wrong question yet.

```bash
make test-e2e
```

Expected: 1 passed, 2 failed. Both tests that click Login fail: the "wrong password"
test sees no alert (`assert [] == ['login failed']`), and the "login shows the widgets"
test times out waiting for the `Widgets` heading. (Browsers refuse to send a GET with a
body, so the click handler throws before it can do anything. Open the screenshot: the
form is still sitting there.)

Talking points:

- The server tests could not catch this because the bug is in code they never run.
- E2E trusts nothing: no mocks, no fakes, a real browser talking to a real server.
- This is why you keep a few E2E tests even though they are slow.

Restore:

```bash
git checkout -- app/static/js/app.js
```

## Demo 4: Coverage. What the numbers mean and how to calculate them (15 minutes)

### 4a. The table

```bash
make coverage
```

Expected table (the `Missing` column is the useful one):

```
Name                Stmts   Miss Branch BrPart   Cover   Missing
----------------------------------------------------------------
app/__init__.py        54      7      6      1  86.67%   33, 37-39, 62-64
app/auth_utils.py      15      0      4      0 100.00%
app/db.py              17      0      0      0 100.00%
----------------------------------------------------------------
TOTAL                  86      7     10      1  91.67%
```

Column by column:

| Column | Meaning |
|---|---|
| Stmts | Executable statements in the file. A `def` line counts (it runs at import). A docstring does not. |
| Miss | Statements that never ran. |
| Branch | Branch *paths*: for each `if`, `while`, `for`, the places execution can jump to next. A plain `if` has two: into the body, or past it. |
| BrPart | Partial branches: decision points where only some of the paths ran. |
| Cover | One combined percentage, see 4b. |
| Missing | Line numbers that never ran. |

Note `app/__main__.py` is absent. `pyproject.toml` omits it on purpose because only
`python -m app` runs it. Tell students: always look at what a coverage config excludes
before trusting a number.

### 4b. The formula

coverage.py gives one percentage per file, and it combines statements and branches:

```
Cover % = (statements executed + branch paths taken) / (statements + branch paths) × 100
```

```bash
make coverage-summary
```

This reprints the last run with the raw counts that feed the formula:

```
| File              | Statements covered | Branch paths covered | Coverage |
| app/__init__.py   | 47/54              | 5/6                  | 86.67%   |
| app/auth_utils.py | 15/15              | 4/4                  | 100.00%  |
| app/db.py         | 17/17              | 0/0                  | 100.00%  |
| **All files**     | 79/86              | 9/10                 | 91.67%   |
```

Do one on the board: `app/__init__.py` is (47 + 5) ÷ (54 + 6) = 52 ÷ 60 = 0.8667, so 86.67%.
Then point out the "All files" row is *not* the average of the file percentages. It is
(79 + 9) ÷ (86 + 10) = 88 ÷ 96 = 91.67%. A big file pulls the total toward its own number.

### 4c. Count a file by hand, then check

Open `app/auth_utils.py`. It is 24 lines and students can count it in three minutes.
Have them count before you reveal the answer.

```python
 3  AUTH_TOKEN = "fake-jwt-token"                          # statement 1
 6  def has_valid_auth_token(token):                       # statement 2 (the def runs at import)
 7      return token == AUTH_TOKEN                         # statement 3
10  def normalize_credentials(body):                       # statement 4
11      """docstring"""                                    # not a statement
12      payload = body if isinstance(body, dict) else {}   # statement 5 (NOT a branch, see below)
13      username = payload.get("username")                 # statement 6
14      password = payload.get("password")                 # statement 7
15      if not isinstance(username, str):                  # statement 8, branch paths: to 16, or to 17
16          username = ""                                  # statement 9
17      if not isinstance(password, str):                  # statement 10, branch paths: to 18, or to 19
18          password = ""                                  # statement 11
19      return {"username": username.strip(), ...}         # statement 12
22  def has_login_fields(body):                            # statement 13
23      creds = normalize_credentials(body)                # statement 14
24      return len(...) > 0 and len(...) > 0               # statement 15 (`and` is NOT a branch)
```

Answer: 15 statements, 2 `if` statements with 2 paths each = 4 branch paths.

The surprise for anyone who has used a JavaScript coverage tool: line 12's
`x if cond else y` and line 24's `and` are decisions, but coverage.py does not count
them as branches. It only counts jumps from one line to another. Istanbul, the tool
under Jest, counts both. Same code, different tool, different number. This is why
"we have 90% coverage" means nothing until you know which tool and which metric.

Now the interesting part. Which of the 4 branch paths does the *integration* suite reach?
Ask students to predict, then run:

```bash
make coverage-integration
```

Expected row:

```
app/auth_utils.py      15      2      4      2  78.95%   16, 18
```

Lines 16 and 18 never ran, and both `if` statements are partial: the "into the body" path
was never taken. Flask always hands the route a JSON body with string fields, so the
integration tests physically cannot send a non-string username. Check the formula:
(13 + 2) ÷ (15 + 4) = 15 ÷ 19 = 78.95%.

Only the unit tests, which call the function directly with `42` and `["x"]`, reach those lines:

```bash
make coverage-unit
```

Expected: `app/auth_utils.py` at 100%, `app/__init__.py` at 10.00% because the unit tests
never build the app, and `app/db.py` at 35.29% because only the import ran. Put the two
runs side by side. Each layer covers what it can reach, and `make coverage` is the union.

Talking points:

- Coverage counts *execution*, not *checking*. A test that calls a function and asserts
  nothing gives 100% coverage and 0% protection. Demo 5 makes this concrete.
- The 500 error handlers (`37-39`, `62-64`) are missing in every run. They need a database
  that throws. That is a real gap, and it belongs in the "what is not yet tested" slide.

### 4d. How the tool gets the numbers

Students should know this is not magic. coverage.py asks the Python interpreter to call it
back on every line executed (through `sys.settrace`, or `sys.monitoring` on Python 3.12+).
It records the set of (file, line) pairs that ran, and with `branch = true` it also records
each (from line, to line) jump. When the tests finish, it compares those sets against every
statement and possible jump it finds by parsing the source. Missing = in the source, not in
the recorded set.

```bash
open htmlcov/index.html      # macOS; on Windows: start htmlcov/index.html
```

Click into `app/__init__.py` and show the red lines and the yellow partial branches. This
is the same information as the `Missing` column, but students find the colored source much
easier to read.

Why E2E is not in these numbers: coverage.py records what happens inside the process it is
running in. In the E2E layer the server is a separate `python -m app` subprocess, so nothing
records it. (It *can* be done in Python: start the subprocess under `coverage run` and
`coverage combine` afterwards. That is follow-up exercise 2.) E2E tests are usually measured
by user journeys covered, not lines covered. It is a different question.

## Demo 5: Green is not proof. Red/green on a coverage gap (12 minutes)

Go back to the missing lines in `app/__init__.py` from Demo 4:

- **Line 33**: the `400` response when the login body is missing a field.
- **37-39 and 62-64**: the `500` responses when the database raises.

Now point at the unit tests: `has_login_fields` has a passing unit test. The *function*
is tested. The *wiring* of that function into the route is not. This is the gap between
unit and integration testing, made visible by a number.

**Step 1: break the wiring.** In `app/__init__.py` line 33, change the status code:

```python
return jsonify(error="username and password are required"), 200
```

```bash
make test
```

Expected: 12 passed. Green, with an obvious bug in the code. Say it out loud:
green means "nothing we check is broken", not "nothing is broken".

**Step 2: write the test first (red).** Add this method to `TestLogin` in
`tests/integration/test_api.py`:

```python
    def test_missing_fields_return_400_before_touching_the_database(self, client):
        res = client.post("/api/login", json={"username": "admin"})
        assert res.status_code == 400
        assert res.get_json() == {"error": "username and password are required"}
```

```bash
make test-integration
```

Expected: 1 failed, 6 passed, with `assert 200 == 400`.

**Step 3: fix (green).** Change line 33 back to `400`.

```bash
make coverage
```

Expected: 13 passed, and line 33 is gone from the missing list:

```
app/__init__.py        54      6      6      0  90.00%   37-39, 62-64
TOTAL                  86      6     10      0  93.75%
```

Have a student do the arithmetic: one more statement and one more branch path,
(48 + 6) ÷ (54 + 6) = 54 ÷ 60 = 90.00%.

Decide together whether to keep the new test. (Keep it. Commit it. That is how suites grow.)

If a student already merged this test before class, the gap is gone: use the `500`
branches instead. They need `monkeypatch` to make `db.find_user` raise, which is a good
stretch exercise rather than a live demo.

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

Create `tests/unit/test_widget_utils.py`:

```python
from app.widget_utils import filter_widgets

WIDGETS = [
    {"id": 1, "name": "Widget A", "description": "A basic widget", "price": 9.99},
    {"id": 2, "name": "Widget B", "description": "An advanced widget", "price": 19.99},
    {"id": 3, "name": "Widget C", "description": "A premium widget", "price": 29.99},
]


def test_empty_query_returns_every_widget():
    assert filter_widgets(WIDGETS, "") == WIDGETS
```

```bash
make test-unit
```

Expected: **red**, before any assertion runs:

```
E   ModuleNotFoundError: No module named 'app.widget_utils'
```

Students often think this does not count. It does. The test told you the first thing to build.

Create `app/widget_utils.py` with the smallest thing that passes:

```python
def filter_widgets(widgets, query):
    return widgets
```

Run again. Expected: **green**, 7 passed. Yes, it ignores the query. No test asked for more.

### Cycle 2: match on name

Add to the test file:

```python
def test_matches_on_name_ignoring_case():
    assert filter_widgets(WIDGETS, "widget b") == [WIDGETS[1]]
```

Run. Expected: **red**. pytest's diff says `Left contains 2 more items`: all three came back.

Make it pass:

```python
def filter_widgets(widgets, query):
    q = query.lower()
    return [w for w in widgets if q in w["name"].lower()]
```

Run. Expected: **green**, 8 passed. Point out cycle 1's test still passes: `"" in s` is true for every string.

### Cycle 3: match on description, ignore whitespace

```python
def test_matches_on_description_and_ignores_surrounding_whitespace():
    assert filter_widgets(WIDGETS, "  premium ") == [WIDGETS[2]]
```

Run. Expected: **red**, `assert [] == [{'id': 3, ...}]`.

```python
def filter_widgets(widgets, query):
    q = query.strip().lower()
    return [w for w in widgets if q in w["name"].lower() or q in w["description"].lower()]
```

Run. Expected: **green**, 9 passed.

### Cycle 4: no query at all

The route will call this with `request.args.get("q")`, which is `None` when the parameter is absent.

```python
def test_missing_query_returns_every_widget():
    assert filter_widgets(WIDGETS, None) == WIDGETS
```

Run. Expected: **red**, and this time it is a crash, not a wrong answer:

```
E       AttributeError: 'NoneType' object has no attribute 'strip'
```

Fix: `q = (query or "").strip().lower()`. Run. Expected: **green**, 10 passed.

### Refactor on green

The comprehension repeats itself. Clean it up:

```python
"""Case-insensitive search over widget name and description."""


def filter_widgets(widgets, query):
    q = (query or "").strip().lower()

    def includes_query(text):
        return q in (text or "").lower()

    return [w for w in widgets if includes_query(w["name"]) or includes_query(w["description"])]
```

Run. Expected: still **green**, 10 passed. That is what the tests are for: you just changed
every line of the function and know in a twentieth of a second that nothing broke.

Now run `make coverage`. The new file reads `app/widget_utils.py  5  0  0  0  100.00%`.
Ask the class: the refactor added `(text or "")` to guard a null description. No test demanded
it. Why does coverage not flag it? Because coverage.py does not count `or` as a branch (Demo 4c).
The Node.js twin of this demo shows a partial branch here. Same code, different tool. The
honest move is the same either way: write the test for a `None` description, or delete the guard.

### Cycle 5: wire it into the route

The function works. The app does not use it yet. Same loop, one layer up. Add to
`tests/integration/test_api.py`:

```python
class TestWidgetSearch:
    def test_q_filters_by_name_or_description(self, client):
        client.post("/api/login", json=GOOD_LOGIN)
        res = client.get("/api/widgets?q=premium")
        assert res.status_code == 200
        assert [w["name"] for w in res.get_json()] == ["Widget C"]
```

```bash
make test-integration
```

Expected: **red**, `assert ['Widget A', 'Widget B', 'Widget C'] == ['Widget C']`. The route ignores `q`.

In `app/__init__.py`, add the import next to the other `from .` lines and change one line in
the widgets route:

```python
from .widget_utils import filter_widgets
# ...
            return jsonify(filter_widgets(db.list_widgets(conn), request.args.get("q")))
```

```bash
make test
```

Expected: **green**, 17 passed. The session lifecycle test still passes because no `q` means
`None`, which cycle 4 handled.

### Where the loop stops

Ask: is the feature done? There is no search box in the UI, so a user cannot reach it.
TDD at the E2E layer would start with a Playwright test that types into a search box that
does not exist yet. That is follow-up exercise 2.

Talking points:

- Six red/green cycles, each under two minutes. The feature was never broken for longer than that.
- Every line in `app/widget_utils.py` exists because a test demanded it. Coverage is 100% as a
  side effect, not a goal.
- The crash in cycle 4 is the kind of bug that normally ships. Here it was found before the
  route existed.

Restore (this demo creates two files and edits two):

```bash
rm app/widget_utils.py tests/unit/test_widget_utils.py
git checkout -- app/__init__.py tests/integration/test_api.py
make test
```

## Wrap-up (5 minutes)

- Tests are about **risk**, not count. Each layer buys confidence about a different thing.
- A passing suite tells you what you *checked*. Coverage tells you what you *never executed*.
  Neither tells you what you *asserted*.
- Coverage is covered ÷ total. Know which tool and which metric before quoting a number.
- Write the test before the fix so you see it fail. A test that has never failed has
  never proven it can catch anything.
- TDD is the same idea applied to new code: red, green, refactor, in cycles of a minute or two.
  Every line exists because a test asked for it.
- Prompts: Which missing lines in `app/__init__.py` matter? Which layer should own each one?

The full set of demos runs about 70 minutes. For a 45-minute slot, pick: Demos 1, 3, 4a-b, and 5,
or Demos 1, 4a-b, and 6 if the session is about TDD.

## Compressed 20-minute version

1. `make test-all`, narrate the three layers from the table above (4 min)
2. Demo 3 only: break the front end, fast tests stay green, E2E fails (5 min)
3. Demo 4a and 4b: run coverage, explain the columns, do one division on the board (4 min)
4. Demo 5: break line 33, add the test, red, fix, green, watch the number move (6 min)
5. One-minute debrief: green is not proof, E2E sees what unit tests cannot

## Troubleshooting during a live demo

- **`ModuleNotFoundError: No module named 'app'`.** You are not in the project root, or the
  venv is not active. `pyproject.toml` sets `pythonpath = ["."]` so `pytest` from the root works.
- **A demo passes or fails unexpectedly.** Save the file. Confirm with `git diff` that you
  edited the line you meant to. Re-run the single layer, not `test-all`.
- **A change seems to be ignored.** Delete the bytecode cache: `find . -name __pycache__ -exec rm -r {} +`
  and re-run. Python skips recompiling a file whose size and modification second did not change.
- **`make test-e2e` says the browser is missing.** Run `playwright install chromium`.
- **E2E says the server did not start, or port 8100 is in use.** A previous server is still
  running: `lsof -i :8100` and kill it, or change `PORT` in `tests/e2e/conftest.py`.
- **E2E failure output is long.** Read the `AssertionError` line, the `Call log`, and the
  `Aria snapshot`. Screenshots are in `test-results/`.
- **Coverage numbers differ from this file.** Someone added or removed a test or a line of
  source. The arithmetic still works; recompute from `make coverage-summary`.
- **`make coverage-summary` says no coverage.json found.** Run `make coverage` first.
- **`git checkout --` does not restore.** The tree was not clean at the start. Compare against
  the snippets in this file and fix by hand.
- **Undo everything at once:**

  ```bash
  rm -f app/widget_utils.py tests/unit/test_widget_utils.py
  git checkout -- app/auth_utils.py app/__init__.py app/static/js/app.js tests/integration/test_api.py
  ```

## Follow-up exercises for students

1. Cover the `500` branches in `app/__init__.py` with `monkeypatch.setattr` so `db.find_user`
   and `db.list_widgets` raise. Predict the new percentages before running, then check.
2. Finish Demo 6 test-first at the E2E layer: write a Playwright test that types into a search
   box and sees one card, watch it fail, then add the box to `app/static/js/app.js`.
3. Measure E2E coverage: in `tests/e2e/conftest.py` start the server with
   `coverage run --parallel-mode -m app`, then `coverage combine` and `coverage report`.
   Compare with `make coverage`. Which lines does E2E cover that the fast layers do not?
4. Add `fail_under = 90` to `[tool.coverage.report]` so `make coverage` fails below that.
   Then delete a test and watch CI go red.
5. Write a test that calls every function in `app/auth_utils.py` but asserts nothing. Show it
   gets 100% coverage. Discuss what that number is worth.
6. Add an E2E test that a second browser context is *not* logged in.
7. Look at `.github/workflows/python.yml`: the E2E job only runs if the fast job passes, and the
   coverage table lands in the job summary. Argue for or against that ordering.
