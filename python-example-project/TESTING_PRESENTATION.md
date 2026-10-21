---
marp: true
paginate: true
---

# Automated Testing: Unit, Integration, End-to-End

### A walk through `python-example-project`

45 minutes. One small Flask app, three kinds of tests, and the code that makes them possible.

<!--
Timing budget is in each slide title. The slides sum to 44 minutes, leaving a minute of slack.
Have a terminal open in the project root with the venv active and a clean git tree. Run `make test-all`
once before class so the browser is warm. Slides marked LIVE are where you switch to the terminal or editor.
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

By the end you should be able to open any file in `tests/` and say what is real, what is faked, and why.

---

## What a test is `⏱ 2 min`

Every automated test has the same three parts:

```python
def test_rejects_anything_else():
    token = "wrong-token"                      # 1. Arrange: set up inputs
    result = has_valid_auth_token(token)       # 2. Act: run the code
    assert result is False                     # 3. Assert: check the outcome
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
 Browser                          Server (Python + Flask)              Data
┌──────────────────┐   HTTP      ┌─────────────────────────┐        ┌──────────┐
│ static/index.html│ ──────────► │ app/__init__.py         │ ─────► │ SQLite   │
│ static/js/app.js │  fetch()    │   create_app(), routes  │  SQL   │  app.db  │
│  Login form      │ ◄────────── │ app/auth_utils.py       │ ◄───── │  or      │
│  Widgets list    │   JSON +    │   pure functions        │        │ :memory: │
└──────────────────┘   cookie    │ app/db.py               │        │ (tests)  │
                                 │   connect(), queries    │        └──────────┘
                                 └─────────────────────────┘
```

Four API routes: `POST /api/login`, `POST /api/logout`, `GET /api/me`, `GET /api/widgets`.

Login sets a cookie. The two `GET` routes require it.

<!--
Point at each box as you name it. Every test layer we see today draws its boundary somewhere
on this picture. Unit tests live inside auth_utils.py. Integration tests cover __init__.py + auth_utils + db.
E2E covers the whole thing left to right.
-->

---

## Code tour 1: `app/auth_utils.py` `⏱ 2 min`

```python
AUTH_TOKEN = "fake-jwt-token"

def has_valid_auth_token(token):
    return token == AUTH_TOKEN

def normalize_credentials(body):
    payload = body if isinstance(body, dict) else {}
    username = payload.get("username")
    password = payload.get("password")
    if not isinstance(username, str):
        username = ""
    if not isinstance(password, str):
        password = ""
    return {"username": username.strip(), "password": password}

def has_login_fields(body):
    creds = normalize_credentials(body)
    return len(creds["username"]) > 0 and len(creds["password"]) > 0
```

**Pure functions.** Input in, output out. No Flask, no database, no imports.
This is what makes them *unit-testable*: you can call them from anywhere with any value.

<!--
Ask: what inputs would you throw at normalize_credentials to break it? None, a number,
a list. Those are exactly the unit tests we'll see.
-->

---

## Code tour 2: `app/__init__.py`, the factory and the decorator `⏱ 2 min`

```python
def create_app(db_path=None):
    app = Flask(__name__)                       # serves app/static/ at /static/

    conn = db.connect(db_path or os.environ.get("APP_DB_PATH", "app.db"))
    db.init_db(conn, os.environ.get("DEFAULT_ADMIN_PASSWORD", "password"))

    def require_auth(view):
        @wraps(view)
        def wrapper(*args, **kwargs):
            if not has_valid_auth_token(request.cookies.get("token")):
                return jsonify(error="unauthorized"), 401
            return view(*args, **kwargs)
        return wrapper
```

`require_auth` is the **wiring** between the pure function and HTTP. The function decides;
the decorator turns the decision into a 401 or lets the request through.

<!--
Key vocabulary for later: "the function" vs "the wiring". Unit tests check the function.
Integration tests check the wiring.
-->

---

## Code tour 3: the login route `⏱ 2 min`

```python
    @app.post("/api/login")
    def login():
        body = request.get_json(silent=True)
        if not has_login_fields(body):
            return jsonify(error="username and password are required"), 400
        creds = normalize_credentials(body)
        try:
            user = db.find_user(conn, creds["username"], creds["password"])
        except Exception:
            app.logger.exception("login query failed")
            return jsonify(error="server error"), 500
        if user is None:
            return jsonify(ok=False), 401
        response = jsonify(ok=True)
        response.set_cookie("token", AUTH_TOKEN, httponly=True)
        return response
```

Count the exits: **400** missing fields, **500** DB failure, **401** wrong password, **200** with cookie.
Four paths. Keep that number in mind for the coverage section.

<!--
Have students count the exits before you reveal. Four is the answer. Write "4 paths" on the board.
-->

---

## Code tour 4: the pattern that makes the app testable `⏱ 2 min`

```python
# app/__init__.py
def create_app(db_path=None):
    ...
    return app          # build it, hand it back, do NOT run it

# app/__main__.py  (only runs for `python -m app`)
create_app().run(host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
```

- `create_app()` **builds** the app and returns it. Tests call it with `db_path=":memory:"`.
- `__main__.py` **runs** it. Tests never import that file.

Without this split, every test would need a running server on a free port, and every test
would share one database.

<!--
This is the single most common reason student projects are "hard to test": the file that defines
the app also starts it. Flask calls this the application factory pattern.
-->

---

## Code tour 5: `app/db.py`, real SQL, two places to keep it `⏱ 2 min`

```python
def connect(path):
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db(conn, admin_password="password"):
    conn.executescript("""CREATE TABLE IF NOT EXISTS users (...); CREATE TABLE IF NOT EXISTS widgets (...);""")
    conn.execute("INSERT OR IGNORE INTO users (username, password) VALUES (?, ?)", ("admin", admin_password))
    conn.executemany("INSERT OR IGNORE INTO widgets (name, description, price) VALUES (?, ?, ?)", SEED_WIDGETS)
    conn.commit()

def find_user(conn, username, password):
    row = conn.execute("SELECT id, username FROM users WHERE username = ? AND password = ?",
                       (username, password)).fetchone()
    return dict(row) if row else None
```

Production uses a file, `app.db`. Tests use `":memory:"`. **Same SQL, same schema, same seed.**
Nothing is faked here: the integration tests really execute these queries.

<!--
Contrast with the Node.js twin, where the test database is a hand-written fake.
Ask: what do these tests prove that a fake cannot? That the SQL is valid and the schema matches.
What do they still not prove? Behaviour on a real file with concurrent writers.
-->

---

## Code tour 6: the front end, `app/static/js/app.js` `⏱ 2 min`

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

Note what this code is: **browser JavaScript**. Python never runs it. Only a browser does.
Hold that thought for the end-to-end layer.

---

## The three layers `⏱ 2 min`

| Layer | Folder | Command | What is real | What is faked | Speed |
|---|---|---|---|---|---|
| Unit | `tests/unit/` | `make test-unit` | One module of pure functions | Everything else is absent | ~0.05 s |
| Integration | `tests/integration/` | `make test-integration` | Flask app, routes, decorator, cookies, JSON, real SQL on in-memory SQLite | Nothing | ~0.05 s |
| End-to-end | `tests/e2e/` | `make test-e2e` | Real Chromium, real HTTP, real server process, real front end | Nothing | ~2 s + browser start |

`make test` (or plain `pytest`) runs the fast two. `make test-all` runs all three.

**The pyramid:** many cheap tests at the bottom, few expensive ones at the top.
Not because E2E tests are bad, but because each one costs seconds and fails vaguely.

<!--
Draw the pyramid. Ask: why not make everything E2E, since it tests the most?
Answer: 10 seconds × 500 tests = 83 minutes per run. And when it fails, you get "element not found",
not "assert 200 == 401".
-->

---

## Layer 1: the unit test, `tests/unit/test_auth_utils.py` `⏱ 2 min`

```python
from app.auth_utils import AUTH_TOKEN, has_login_fields, has_valid_auth_token, normalize_credentials

class TestHasValidAuthToken:
    def test_accepts_the_expected_token(self):
        assert has_valid_auth_token(AUTH_TOKEN) is True

    def test_rejects_anything_else(self):
        assert has_valid_auth_token("wrong-token") is False
        assert has_valid_auth_token("") is False
        assert has_valid_auth_token(None) is False

class TestNormalizeCredentials:
    def test_turns_non_string_values_into_empty_strings(self):
        assert normalize_credentials({"username": 42, "password": ["x"]}) == {"username": "", "password": ""}

    def test_handles_missing_or_non_dict_body(self):
        assert normalize_credentials(None) == {"username": "", "password": ""}
```

pytest vocabulary: a `test_` function is one claim, a class groups them, plain `assert` is the
assertion. When it fails, pytest prints both sides of the comparison for you.

<!--
Point out: the test reaches inputs (None, 42, a list) that no HTTP request could ever send.
Only a unit test can get there.
-->

---

## Layer 2: the integration test, `tests/integration/test_api.py` `⏱ 3 min`

```python
@pytest.fixture
def client():
    app = create_app(db_path=":memory:")     # fresh app, fresh seeded DB, no port
    yield app.test_client()                   # the test runs here
    app.config["DB"].close()                  # teardown, even if the test failed

GOOD_LOGIN = {"username": "admin", "password": "password"}

class TestLogin:
    def test_correct_credentials_return_ok_and_set_the_auth_cookie(self, client):
        res = client.post("/api/login", json=GOOD_LOGIN)
        assert res.status_code == 200
        assert res.get_json() == {"ok": True}
        assert res.headers["Set-Cookie"].startswith("token=")

class TestProtectedRoutesWithoutCookie:
    def test_widgets_returns_401(self, client):
        res = client.get("/api/widgets")
        assert res.status_code == 401
        assert res.get_json() == {"error": "unauthorized"}
```

Flask's **test client** builds a real request and hands it to the app in memory. Real routing,
real JSON parsing, real `require_auth`, real `Set-Cookie`, real SQL. Every test gets its own database.

<!--
Walk the 401 test through the picture: request → Flask → require_auth → has_valid_auth_token(None)
→ False → 401 JSON. Four pieces of real code exercised by four lines of test.
The fixture is worth 30 seconds: setup above yield, teardown below, pytest injects it by name.
-->

---

## Layer 2, continued: a session `⏱ 2 min`

```python
class TestSessionLifecycle:
    def test_login_me_widgets_logout_me(self, client):
        # The test client keeps cookies between calls, like a browser would.
        assert client.post("/api/login", json=GOOD_LOGIN).status_code == 200

        me = client.get("/api/me")
        assert me.get_json() == {"username": "admin"}

        widgets = client.get("/api/widgets")
        assert len(widgets.get_json()) == 3
        assert widgets.get_json()[0] == {"id": 1, "name": "Widget A",
                                         "description": "A basic widget", "price": 9.99}

        client.post("/api/logout")
        assert client.get("/api/me").status_code == 401
```

One client object is one user: it holds the cookie jar across calls.

This one test checks the **contract** between four routes: what login gives, the others accept.

---

## Layer 3: end-to-end with Playwright `⏱ 3 min`

`tests/e2e/conftest.py` starts the real server once per session:

```python
@pytest.fixture(scope="session")
def server(tmp_path_factory):
    env = {**os.environ, "PORT": "8100", "APP_DB_PATH": str(db_path)}
    proc = subprocess.Popen([sys.executable, "-m", "app"], cwd=PROJECT_ROOT, env=env)
    # ... poll http://localhost:8100 until it answers ...
    yield "http://localhost:8100"
    proc.terminate()
```

`tests/e2e/test_app.py` then drives a real browser:

```python
def test_login_shows_the_widgets_and_logout_returns_to_the_form(page: Page, server):
    page.goto(f"{server}/")
    page.get_by_placeholder("username").fill("admin")
    page.get_by_placeholder("password").fill("password")
    page.get_by_role("button", name="Login").click()

    expect(page.get_by_role("heading", name="Widgets")).to_be_visible()
    expect(page.get_by_role("heading", level=3)).to_have_count(3)

    page.get_by_role("button", name="Logout").click()
    expect(page.get_by_placeholder("username")).to_be_visible()
```

<!--
Two things to say: (1) this is `python -m app` for real, so __main__.py runs and the server really listens.
(2) `expect(...).to_be_visible()` waits up to 5 s. No sleep() calls. The `page` fixture comes from
the pytest-playwright plugin. This is the only test that runs app.js.
-->

---

## What E2E locators are saying `⏱ 1 min`

| Locator | Finds |
|---|---|
| `get_by_placeholder("username")` | The input a user would see labelled "username" |
| `get_by_role("button", name="Login")` | The thing a screen reader calls a button named Login |
| `get_by_role("heading", level=3)` | Every `<h3>` on the page |

Locators describe the page **the way a user sees it**, not the way the DOM is built.
Rename a CSS class and these still work. Change the button text and they fail, which is correct:
the user would notice too.

---

## LIVE: run all three `⏱ 2 min`

```bash
make test-all
```

Watch the clock on each layer:

```
Unit:         6 passed   ~0.05 s
Integration:  6 passed   ~0.05 s
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
make coverage
```

```
Name                Stmts   Miss Branch BrPart   Cover   Missing
app/__init__.py        54      7      6      1  86.67%   33, 37-39, 62-64
app/auth_utils.py      15      0      4      0 100.00%
app/db.py              17      0      0      0 100.00%
TOTAL                  86      7     10      1  91.67%
```

| Column | Meaning |
|---|---|
| Stmts / Miss | Statements in the file, and how many never ran |
| Branch | Branch *paths*: for each `if`, into the body or past it |
| BrPart | Decision points where only some paths ran |
| Cover | **(statements run + branch paths taken) ÷ (statements + branch paths)** |
| Missing | Line numbers that never ran |

`make coverage-summary` prints the raw counts: `app/__init__.py` is (47 + 5) ÷ (54 + 6) = 52 ÷ 60 = 86.67%.

<!--
Open htmlcov/index.html if there's time: red lines are the missing ones, yellow are partial branches.
Note coverage.py gives ONE combined number, unlike the four columns Jest prints. And it does not
count `x if c else y` or `and` as branches, only line-to-line jumps. Same code, different tool,
different number. Always ask which tool.
-->

---

## Coverage: reading the missing lines `⏱ 2 min`

Back to the login route and its **four exits**:

| Exit | Line | Covered? | Why |
|---|---|---|---|
| 400 missing fields | 33 | **No** | No integration test sends a body without a password |
| 500 DB failure | 37–39 | **No** | SQLite in memory never raises |
| 401 wrong password | 41 | Yes | `wrong credentials` test |
| 200 with cookie | 42–44 | Yes | `correct credentials` test |

`has_login_fields` has a unit test and is at 100%. The **function** is tested.
Line 33, the **wiring** of that function into the route, is not. Coverage found the gap; no human did.

What coverage cannot tell you: whether the tests that ran those lines *asserted anything*.

<!--
This is the payoff of the "function vs wiring" vocabulary from the decorator slide.
If you have 5 extra minutes, do Demo 5 from TESTING_PLAYBOOK.md here: change 400 to 200,
tests stay green, add the test, red, fix, green.
-->

---

## LIVE: a bug only one layer can see `⏱ 3 min`

In `app/static/js/app.js`, change the login request:

```js
method: 'GET',        // was 'POST'
```

```bash
make test          # unit + integration
```
Expected: **12 passed.** The server is fine. Nobody has asked it the wrong question yet.

```bash
make test-e2e
```
Expected: **1 passed, 2 failed.** Both tests that click Login time out waiting for the next screen.

```bash
git checkout -- app/static/js/app.js
```

<!--
The point: the fast layers never run app.js, so they can't see it. The browser does.
Every layer has a blind spot, and the layers above it exist to cover that blind spot.
If a student asks "why not mock fetch and unit-test app.js?": you could, and it would catch this
bug, but it would trust your mock to behave like the real server. E2E trusts nothing.
-->

---

## How this runs in CI `⏱ 1 min`

`.github/workflows/python.yml` (repo root), first two jobs:

```
fast-tests  (pytest)              e2e-tests  (Playwright)
  pip install -r requirements.txt   needs: fast-tests
  pytest tests/unit          ───►   playwright install chromium
  pytest tests/integration          pytest tests/e2e
  pytest --cov ...                  upload screenshots on failure
  coverage table → job summary
```

The slow job only runs if the fast job passes. Same pyramid, drawn in YAML.
A third job builds and smoke-tests the Docker image; `CICD_PRESENTATION.md` covers the whole pipeline.

---

## The same lesson in JavaScript `⏱ 1 min`

`javascript-example-project` is the same app and the same three layers:

| | Python | Node |
|---|---|---|
| Pure functions | `app/auth_utils.py` | `lib/auth-utils.js` |
| App without a port | `create_app()` | `module.exports = app` |
| Unit / integration | pytest + Flask test client | Jest + supertest |
| Test database | real SQLite in memory | hand-written fake of `pool.query` |
| End-to-end | Playwright for Python | Playwright |
| Coverage | coverage.py via `pytest --cov` | Istanbul via `jest --coverage` |

Two differences worth knowing: the Node tests fake the database, so they cannot prove the SQL.
And Istanbul counts `? :` and `&&` as branches; coverage.py does not. Same code, different number.

---

## What to take away `⏱ 2 min`

1. **Separate building the app from running it.** `create_app()` returning the app, with
   `__main__.py` as the only place that calls `.run()`, is what made everything else possible.
2. **Pure functions get unit tests. Wiring gets integration tests. User journeys get E2E.**
   Each layer reaches inputs the others cannot.
3. **Know what your test database proves.** In-memory SQLite runs the real SQL. A fake does not.
   Either way, say out loud what is not covered.
4. **Green means "nothing we check is broken."** Coverage tells you what you never executed.
   Neither tells you what you asserted.
5. For your final presentation: show the test run, name the layers, and name the gaps.
   The rubric rewards knowing what is *not* tested as much as what is.

<!--
End here. If time remains, take questions or run Demo 2 from the playbook (break has_valid_auth_token,
watch all three layers fail, compare the error messages). For a TDD-focused follow-up session,
Demo 6 in the playbook builds a search feature test-first in six red/green cycles.
-->

---

## Exercises

1. Write the integration test for line 33 (the 400 exit). Watch coverage move.
2. Cover the 500 exits with `monkeypatch.setattr` so `db.find_user` raises.
3. Add an E2E test that a second browser context is not logged in.
4. Write a test that calls every function in `app/auth_utils.py` and asserts nothing.
   Check its coverage. Discuss what the number is worth.
5. Measure E2E coverage: start the server under `coverage run` in `conftest.py`, then
   `coverage combine`. Which lines does E2E cover that the fast layers do not?
