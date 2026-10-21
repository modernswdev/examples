# CI/CD Exercises: Docker, k6, and GitHub Actions

Hands-on practice for [CICD_PRESENTATION.md](CICD_PRESENTATION.md). The exercises go from
easy to hard, in four parts:

| Part | Topic | Level | Rough time |
|---|---|---|---|
| 1 | Docker, by hand | ★ → ★★★ | 2–3 hours |
| 2 | k6: smoke tests, load tests, and the config file | ★ → ★★★ | 2–3 hours |
| 3 | GitHub Actions on your own fork | ★ → ★★★ | 2–3 hours |
| 4 | Put it together: find, fix, and prove the load bug | ★★★ | 1–2 hours |

★ means you follow the steps and answer the questions. ★★ means you change a file. ★★★ means
you design the change yourself and the hint is only a nudge.

Every Docker and k6 command in Parts 1 and 2 was run against this code with Docker and k6 v2.3.0.
The numbers in the **You should see** sections came from those runs. Yours will be close, but
load-test numbers change from run to run, because the bug they find is a race.

## Before you start

You need:

- **Docker** running (Docker Desktop on macOS or Windows): `docker version` prints a server version.
- **k6**: `brew install k6`, or see [the install page](https://grafana.com/docs/k6/latest/set-up/install-k6/).
  `k6 version` should print v2.x.
- **The project set up** as in the [README](README.md): a venv, `pip install -r requirements.txt`, and `make test` green.
- **For Part 3:** a GitHub account and the GitHub CLI (`gh auth login`).

Work from `python-example-project/` unless an exercise says otherwise. Keep a notes file open:
most exercises ask a question, and writing the answer down is part of the exercise.

If something is already listening on port 8000 (for example `make run` in another terminal),
stop it first, or use another host port such as `-p 8001:8000` and `BASE_URL=http://localhost:8001`.

---

# Part 1: Docker, by hand

The CI job "Build and smoke-test the Docker image" runs a handful of Docker commands. In this part
you run them yourself, one at a time, until you can read that job and know what every line does.

## 1.1 Build the image and look at it ★

```bash
docker build -t python-example-project .       # or: make docker-build
docker images python-example-project
docker history python-example-project
```

**You should see:** an image of roughly 235 MB. `docker history` lists one line per Dockerfile
instruction, newest first. The `COPY app ./app` layer is about 94 kB; the `pip install` layer is about 15 MB.

**Questions**
1. The app code is under 100 kB and Flask is about 15 MB. Where do the other ~220 MB come from?
2. Match each line of `docker history` to a line of the [Dockerfile](Dockerfile). Which lines create
   a layer with a size, and which only change settings (0 B)?
3. Open [.dockerignore](.dockerignore). Why is `.venv` in it? What would happen to the build if it weren't?

## 1.2 Run it, reach it, stop it ★

```bash
docker run -d --name app -p 8000:8000 python-example-project
docker ps
curl -i http://localhost:8000/
docker logs app
docker stop app
docker ps -a                      # the stopped container is still there
docker rm app
```

Now run it again with a different host port, and log in with `curl`:

```bash
docker run -d --rm --name app -p 8081:8000 python-example-project
curl -i -X POST http://localhost:8081/api/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"password"}'
```

Leave this container running for the questions, then stop it with `docker stop app` (`--rm` deletes
it as soon as it stops).

If `docker run` says the port is already allocated, or `curl` gets a `404` from a server that isn't
Flask (look at the `Server:` header), something else on your laptop owns that port. Pick another one,
such as `-p 8082:8000`, and use it in every URL below.

**Questions**
1. In `-p 8081:8000`, which number is on your laptop and which is inside the container?
   Does `curl http://localhost:8000/` work with that mapping? Why?
2. What does `-d` do? Run the container once without it: what happens to your terminal, and how do you get it back?
3. The login response has a `Set-Cookie` header. Copy the cookie and use it:
   `curl -i --cookie 'token=...' http://localhost:8081/api/widgets`. What do you get without it?
4. `docker logs` starts with a red WARNING. What is it, and where in the CI pipeline would you want it gone?
   (You'll come back to this in Exercise 4.2.)

## 1.3 Look inside a running container ★

```bash
docker run -d --rm --name app -p 8000:8000 python-example-project
docker exec app whoami
docker exec app ls -la /usr/src/app
docker exec app pip list
docker exec -it app bash          # look around; `exit` to leave
docker stop app
```

**You should see:** `root`; an `app/` folder, `requirements.txt`, and an `app.db` that the app
created when it started; and only **8 packages** in `pip list`: Flask, its dependencies, and pip.

**Questions**
1. `requirements.txt` is in the image. Are pytest and Playwright installed? Read the Dockerfile's
   `RUN` line and explain.
2. Is it a good thing that the image doesn't have pytest in it? Give one reason for and one against.
3. The process runs as `root`. Write down one thing that could go wrong because of that. (Exercise 1.8 fixes it.)

## 1.4 Configure it with environment variables ★★

The app reads three environment variables. Find them in [app/\_\_init\_\_.py](app/__init__.py)
and [app/\_\_main\_\_.py](app/__main__.py) first.

```bash
# A different port inside the container: the mapping has to change too
docker run -d --rm --name app -e PORT=9000 -p 8000:9000 python-example-project
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8000/
docker stop app

# A different admin password
docker run -d --rm --name app -e DEFAULT_ADMIN_PASSWORD=s3cret -p 8000:8000 python-example-project
```

With the second container running, use `curl` to log in with the old password, then with the new one.
Leave it running for Exercise 2.3.

**Questions**
1. With `-e PORT=9000 -p 8000:8000` (the mapping left alone), what does `curl` print? Try it and explain.
2. `DEFAULT_ADMIN_PASSWORD` is a password passed on the command line. Where can someone else on
   the machine see it? (Try `docker inspect app | grep -i password`.)
3. Which variable would you set to keep the database on a volume, and what would the `docker run` line look like?

## 1.5 The layer cache ★★

```bash
docker build -t python-example-project .         # warm the cache
echo "# cache test" >> app/auth_utils.py
docker build -t python-example-project .         # which steps say CACHED?
git checkout app/auth_utils.py

echo "# cache test" >> requirements.txt
docker build -t python-example-project .         # and now?
git checkout requirements.txt
```

**You should see:** after the code change, `COPY requirements.txt` and `RUN pip install` are
`CACHED` and only `COPY app ./app` runs again. After the `requirements.txt` change, `pip install`
runs again too.

**Questions**
1. Why does the Dockerfile copy `requirements.txt` *before* the app code, instead of `COPY . .` once?
2. The `pip install` line installs `flask` and nothing else, so why does a change to `requirements.txt`
   make it run again? Is that a bug, a waste, or both?
3. In CI every job starts on a fresh machine. Does the layer cache help there at all?

## 1.6 The bug that only the image has ★★

Add one line at the top of [app/\_\_init\_\_.py](app/__init__.py) and **don't** touch `requirements.txt`:

```python
import requests
```

Then:

```bash
make test                                      # do the tests pass?
pip show requests                              # why is it installed?
docker build -t python-example-project .
docker run -d --name app -p 8000:8000 python-example-project
curl --fail --retry 3 --retry-delay 1 --retry-all-errors http://localhost:8000/
docker ps -a --filter name=app
docker logs app
docker rm -f app
```

**You should see:** `12 passed`. `pip show` says requests is `Required-by: pytest-base-url`.
`curl` fails with `Couldn't connect to server`, the container is `Exited (1)`, and the log ends with
`ModuleNotFoundError: No module named 'requests'`.

Now fix the setup so this can't happen silently:

1. Split the requirements: `requirements.txt` holds only what the app needs to run (`flask`), and a new
   `requirements-dev.txt` starts with `-r requirements.txt` and adds the test tools.
2. Change the Dockerfile to `pip install --no-cache-dir -r requirements.txt`.
3. Update the [README](README.md) setup step to install `requirements-dev.txt`.
4. Leave the CI workflow for now. Exercise 3.5 updates it.

**Questions**
1. Name the three layers of test that passed. Why could none of them catch this?
2. After your fix, add `requests` to `requirements.txt` and rebuild. Does the container start? Check the
   image size before and after.
3. Undo the `import requests` line when you're done.

<details><summary>Hint</summary>

`requirements-dev.txt`:

```
-r requirements.txt
pytest>=8
pytest-cov>=5
pytest-playwright>=0.5
```
</details>

## 1.7 Listening on the wrong address ★★

In [app/\_\_main\_\_.py](app/__main__.py), change `host="0.0.0.0"` to `host="127.0.0.1"`. Then:

```bash
make test && make test-e2e                     # still green?
docker build -t python-example-project .
docker run -d --name app -p 8000:8000 python-example-project
curl -sS http://localhost:8000/
docker exec app python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8000/').status)"
docker logs app | grep Running
docker rm -f app
git checkout app/__main__.py
```

**You should see:** from your laptop, `curl: (56) Recv failure: Connection reset by peer`. From
inside the container, `200`. The log says `Running on http://127.0.0.1:8000`.

**Questions**
1. The app is running and answering. Why can't your laptop reach it?
2. Why do the E2E tests pass with this bug?
3. In CI, which step of which job fails first, and roughly how long does it take to fail?
   (Read the `curl` line in `.github/workflows/python.yml`.)

## 1.8 Don't run as root ★★★

Add a non-root user to the Dockerfile:

```dockerfile
RUN useradd --create-home appuser
USER appuser
```

Build, run, and check `docker ps -a` and `docker logs`.

**You should see:** the container exits at once with `sqlite3.OperationalError: unable to open database file`.

Work out why, then fix it so the container runs, `docker exec app whoami` prints `appuser`, and
`make smoke` passes against it. There's more than one correct fix. Write down which one you picked and why.

<details><summary>Hint</summary>

Where does the app try to create `app.db`, and who owns that directory? You can give `appuser`
that directory (`chown`), or point `APP_DB_PATH` somewhere `appuser` can write.
</details>

## 1.9 Teach Docker to tell healthy from running ★★★

`docker ps` says "Up" as soon as the process starts, even if it never answers a request. Add a
`HEALTHCHECK` to the Dockerfile so that `docker ps` shows `(healthy)` only when the login page loads.

Constraints: `python:3.12-slim` has no `curl`, and you may not install anything extra.

**You should see:** `Up 8 seconds (healthy)` a few seconds after start. With the 127.0.0.1 bug from
1.7, the container still answers *inside*. Does your healthcheck catch that bug? Should it?

<details><summary>Hint</summary>

The healthcheck runs inside the container, and Python is already there:
`python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/')"`.
`--interval=5s --timeout=2s --retries=3` keeps it quick.
</details>

---

# Part 2: k6

[k6/smoke.js](k6/smoke.js) is one user journey with pass/fail thresholds. In this part you run it
in every way CI does, break it on purpose, and then grow it into a real load test.

## 2.1 Read the script, predict, then run ★

Read [k6/smoke.js](k6/smoke.js) before running anything, and write down:

1. How many HTTP requests does one iteration send?
2. How many checks does one iteration make?
3. With 1 virtual user for 10 seconds, about how many iterations will run? (Look at the last line.)
4. So how many checks in total?

Then:

```bash
docker run -d --rm --name app -p 8000:8000 python-example-project
make smoke
echo $?
```

**You should see:** every threshold ✓, `70 out of 70` checks, and `0` from `echo $?`.

**Questions**
1. Were your predictions right? If not, which line did you misread?
2. One request gets a `401` on purpose. Why doesn't it count in `http_req_failed`? Which line makes that so?
3. What is the difference between a **check** and a **threshold**? Which one makes CI go red?

## 2.2 Three ways to run k6 against a container ★

CI runs k6 on the runner against a container. Try that and two other ways, with the container from 2.1 still running:

```bash
# 1. k6 on your laptop (what you just did)
k6 run k6/smoke.js

# 2. k6 in a container, reaching the app through your laptop
docker run --rm -i -e BASE_URL=http://host.docker.internal:8000 grafana/k6:2.3.0 run - < k6/smoke.js
docker stop app

# 3. Both in containers on one Docker network, using the container name
docker network create loadtest
docker run -d --rm --name app --network loadtest python-example-project
docker run --rm -i --network loadtest -e BASE_URL=http://app:8000 grafana/k6:2.3.0 run - < k6/smoke.js
docker stop app && docker network rm loadtest
```

**You should see:** all three green.

On Linux, `host.docker.internal` needs `--add-host=host.docker.internal:host-gateway` on the k6 container.

**Questions**
1. In way 3 there's no `-p` on the app container. Why does it still work?
2. Why does `localhost` mean something different to the k6 container than it does to your laptop?
3. Which way would you use in CI if you couldn't install k6 on the runner?

## 2.3 Make k6 fail, and read why ★

Run the smoke test against the container from 1.4 that has a different password:

```bash
docker run -d --rm --name app -e DEFAULT_ADMIN_PASSWORD=s3cret -p 8000:8000 python-example-project
k6 run k6/smoke.js
echo $?
```

**You should see:** `checks` ✗ at about 43%, `http_req_failed` ✗ at 40%, `login is 200` ✗, and exit code `99`.

**Questions**
1. Only the login is wrong. Why do the widgets checks fail too?
2. Why is `http_req_failed` exactly 40%? (Count the requests in one iteration and which ones fail.)
3. Why does the exit code matter more to CI than anything printed on screen?

## 2.4 Credentials from the environment ★★

The username and password are hard-coded in the script. Change [k6/smoke.js](k6/smoke.js) to read
`USERNAME` and `PASSWORD` from `__ENV`, with `admin` and `password` as defaults, the same way it reads `BASE_URL`.

```bash
k6 run -e PASSWORD=s3cret k6/smoke.js           # against the container from 2.3: green now
docker stop app
```

**Done when:** `k6 run k6/smoke.js` still works with no `-e` flags against the normal container,
and `-e PASSWORD=s3cret` makes it green against the `s3cret` one.

## 2.5 From smoke test to load test ★

```bash
docker run -d --name app -p 8000:8000 python-example-project
make smoke
make load                                         # 20 users for 30 s
docker logs app 2>&1 | grep -c '" 500 '
docker logs app 2>&1 | grep -E 'Error' | sort | uniq -c
docker logs app 2>&1 | grep -c '" 401 '
docker rm -f app
```

Run `make load` three times, restarting the container each time, and record `checks`,
`http_req_failed`, and p95 in a table.

**You should see:** the smoke test green, and the load test red on `checks` (around 94–98%) and
`http_req_failed` (around 1–3%). The latency threshold stays green: p95 is about 10 ms locally.
The server logs a handful of 500s, sometimes as `sqlite3.InterfaceError` and sometimes as
`IndexError: tuple index out of range`.

**Questions**
1. Count the 401s in the log. The script expects exactly one per iteration (600 iterations for 20 users × 30 s).
   Are there more? Which requests are getting a 401 they shouldn't?
2. So some correct logins get "wrong password" without any 500. Why is that worse than a crash?
3. Why do your three runs give different numbers?
4. Same script, same thresholds. Why was the smoke test green? (Answer in one sentence.)

## 2.6 Check that logout really logs you out ★★

The script calls `POST /api/logout` but never checks it worked. After the logout, add a request
to `/api/widgets` that must return `401`, and a check for it.

**Done when:** the smoke test is green, the summary shows a new check
`widgets after logout is 401`, and each iteration now makes 8 checks.

Then break logout on purpose (comment out `response.delete_cookie("token")` in
[app/\_\_init\_\_.py](app/__init__.py)), rebuild the image, and confirm your check goes red. Put it back.

<details><summary>Hint</summary>

The same trick as the anonymous 401: pass `responseCallback: http.expectedStatuses(401)` so the
expected 401 isn't counted as a failed request.
</details>

## 2.7 Thresholds for one group, one request, one custom metric ★★

The thresholds cover every request together. Add these to `options.thresholds`:

```js
'http_req_duration{group:::logged in}': ['p(95)<200'],   // only requests inside group('logged in')
'http_req_duration{name:login}':        ['p(95)<100'],   // only requests tagged name=login
```

For the second one to match anything, tag the login request: `{ headers: ..., tags: { name: 'login' } }`.

Then add a **custom metric**: a `Counter` named `bad_logins` (from `k6/metrics`) that you increment
whenever the login check fails, with the threshold `bad_logins: ['count<1']`.

**Questions**
1. Run the smoke test. Where do the new thresholds appear in the summary?
2. Lower `name:login` until it fails. What's the fastest login p95 you can demand of your laptop?
3. `checks` already covers the login. What does a separate `bad_logins` metric tell you that `checks` doesn't?

## 2.8 Stop early when it's hopeless ★★

Change the `bad_logins` threshold to stop the test the moment it's crossed:

```js
bad_logins: [{ threshold: 'count<1', abortOnFail: true }],
```

Run a 30-second test with the wrong password (`-e PASSWORD=wrong`, from 2.4).

**You should see:** k6 stops after about 2 seconds with `thresholds on metrics 'bad_logins, checks'
were crossed; at least one has abortOnFail enabled, stopping test prematurely`, and exit code `99`.

**Questions**
1. Why might you want this in CI? Why might you *not* want it on a latency threshold?
2. k6 checks thresholds every few seconds, not on every request. How does that change what "stops at once" means?

## 2.9 Ramps and arrival rates ★★★

Copy the script to `k6/ramp.js` and replace `vus` and `duration` with **stages**: ramp from 0 to 20 users
over 30 s, hold 20 for 1 minute, ramp down over 30 s.

Then copy it again to `k6/rate.js`, and instead of stages use a **scenario** with the
`constant-arrival-rate` executor: 10 iterations per second for 30 s, `preAllocatedVUs: 5`, `maxVUs: 20`.

**Questions**
1. `--vus 20` sets how many users exist. An arrival rate sets how many iterations *start* per second.
   If the server slows down, which of the two sends less traffic? Which one is closer to real users
   arriving at a website?
2. Run `k6/rate.js` with the race still in the app. Does it fail like `make load` did? Why or why not?
3. What does k6 do if the server gets so slow that 20 VUs aren't enough to keep 10 iterations per second?

## 2.10 Reports: HTML, JSON, and Markdown ★★★

1. **HTML:** run the load test with the web dashboard exported to a file:
   `K6_WEB_DASHBOARD=true K6_WEB_DASHBOARD_EXPORT=report.html k6 run --vus 20 --duration 30s k6/smoke.js`.
   Open `report.html`. Find when the first errors happened.
2. **JSON + Markdown:** add a `handleSummary(data)` function to the script that writes `summary.json`
   (checks rate, failed-request rate, p95) and `summary.md` (the same three numbers as a Markdown table).

**Watch out:** once you define `handleSummary`, it *replaces* the usual end-of-test summary, so your
terminal goes quiet. Return a `stdout` entry too if you still want something printed. The exit code
still comes from the thresholds.

You'll use `summary.md` in Exercise 3.8.

<details><summary>Hint</summary>

`data.metrics.checks.values.rate`, `data.metrics.http_req_failed.values.rate`, and
`data.metrics.http_req_duration.values['p(95)']`. Return an object mapping file names
(or `stdout`) to strings.
</details>

---

# Part 3: GitHub Actions on your own fork

You can't push to the class repo, so you'll run everything on a fork. Your fork gets its own Actions tab,
its own runs, and its own `main` to protect.

## 3.1 Fork, enable Actions, and run a first workflow ★

1. Fork `modernswdev/examples` on GitHub and clone your fork.
2. Point `gh` at **your fork**, not the class repo. In a clone of a fork, `gh pr create` otherwise opens
   the PR on the class repo, and several exercises below open PRs with broken code on purpose:

   ```bash
   gh repo set-default <you>/examples
   gh repo set-default --view                  # should print your fork
   ```

3. On your fork's **Actions** tab, enable workflows (forks start with them turned off).
4. Create `.github/workflows/hello.yml` **at the repo root**, not inside `python-example-project/`:

```yaml
name: Hello

on:
  push:
  workflow_dispatch:

jobs:
  hello:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: uname -a && python3 --version && docker --version
      - run: ls python-example-project
      - run: echo "### Hello from run ${{ github.run_number }} on \`${{ github.ref_name }}\`" >> "$GITHUB_STEP_SUMMARY"
```

5. Commit and push to a branch. Open the run on the Actions tab and find your summary line.
6. Merge the branch into your fork's `main`, then find the **Run workflow** button.
   The push to `main` also runs `python.yml`, and its deploy job goes red. That's expected:
   Exercise 3.2 is about why, and how to fix it.

**Questions**
1. The **Run workflow** button didn't appear until the file was on `main`. Why?
2. Is `k6` on the runner? Is `docker`? Add a step to find out.
3. Why did the step that runs `ls` need `actions/checkout` first?

## 3.2 Make your fork safe to merge into ★★

When your fork's `main` gets a push, `python.yml` runs the deploy job. Your fork has no `DOCKERHUB_TOKEN`
or `KUBECONFIG` secrets, so that job fails at the Docker Hub login.

Change the deploy job's `if:` so that it runs only on `main` **of the class repo**, and shows as skipped everywhere else.

**Done when:** a push to your fork's `main` shows fast tests, E2E, and the image job green, and deploy skipped.

**Questions**
1. Why is this better than deleting the deploy job from your fork?
2. Could a stranger who forks the class repo deploy to the class cluster from their fork? What stops them?

<details><summary>Hint</summary>

`github.repository` is `owner/name`. Combine it with the existing condition using `&&`.
</details>

## 3.3 Read a red run ★

1. On a branch, break the login rule in [app/auth_utils.py](app/auth_utils.py): change `and` to `or` in
   `has_login_fields`.
2. Push and open a PR **into your fork's `main`** (`gh pr create --fill`; check the URL it prints has your username in it, not `modernswdev`).
3. Read the failure, in this order: which job, which step, then the last lines of that step's log.
4. Try `gh run view --log-failed` for the same run.

**Questions**
1. Which jobs are red, which are skipped, and why are they skipped instead of red?
2. Which test failed? Paste its name.
3. With `fail-fast: false`, all three Python versions ran to the end. What would you have seen with `fail-fast: true`?

Close the PR without merging.

## 3.4 What Python versions do you really support? ★★

The README says "Python 3.12 or newer." Add `'3.11'` and `'3.10'` to the matrix and open a PR.

**Questions**
1. Which versions pass? (3.11 passes locally. Find out about 3.10.)
2. Find the oldest version that passes. Update the README so it tells the truth, or explain why you'd keep "3.12".
3. Each matrix entry is a separate check on the PR. What does that mean for the ruleset in 3.9 when you add a version?

## 3.5 Teach CI about `requirements-dev.txt` ★★

If you did Exercise 1.6, CI now installs only Flask and the tests can't run. Push your branch and look:
which step fails, and with what error?

Fix `python.yml` so that both test jobs install `requirements-dev.txt`, and the pip cache keys on both files
(`cache-dependency-path` accepts several lines).

**Done when:** the PR is green, and the image job still builds from `requirements.txt` alone.

## 3.6 Add a lint job that runs in parallel ★★

Add a job `lint` that installs [ruff](https://docs.astral.sh/ruff/) and runs `ruff check .` in
`python-example-project`. It should run **at the same time** as `fast-tests`, not after it, and
`e2e-tests` should wait for **both**.

**Questions**
1. Sketch the new pipeline as a diagram, the way the deck draws it.
2. Ruff may find problems. Fix them, or configure ruff in `pyproject.toml`, and say which you chose.
3. Why put lint in parallel with the fast tests instead of first in line?

<details><summary>Hint</summary>

A job with no `needs:` starts right away. `needs:` also takes a list: `needs: [fast-tests, lint]`.
</details>

## 3.7 Write a k6 workflow from scratch ★★★

Without copying `python-load-test.yml`, write `.github/workflows/k6-smoke.yml` that, on every PR to `main`:

1. Builds the image and starts a container.
2. Waits until it answers (not `sleep 10`).
3. Installs k6 v2.3.0 and runs `k6/smoke.js` against it.
4. Prints the container logs **whether or not** k6 passed.
5. Uploads an HTML report as an artifact **whether or not** k6 passed.

Then add a `workflow_dispatch` with inputs for users and duration, and use them on the k6 command line.

When it works, compare it with [python-load-test.yml](../.github/workflows/python-load-test.yml).

**Questions**
1. Which steps need `if: always()`, and what happens to them without it when k6 fails?
2. `python-load-test.yml` passes the inputs through `env:` instead of writing `${{ inputs.vus }}` straight
   into the `run:` line. Why? What could someone type into the input box to make the straight version misbehave?
3. Where did you put `working-directory`, and why does the artifact path still need the folder name?

## 3.8 Put the k6 results on the run page ★★

Using the `summary.md` from Exercise 2.10, add a step to your k6 workflow that appends it to
`$GITHUB_STEP_SUMMARY`, so the three numbers show on the run's page without opening a log.

**Done when:** the run page shows your table, on a green run *and* on a red one.

## 3.9 Protect your fork's `main` ★★

On your fork: **Settings → Rules → Rulesets → New branch ruleset**. Target the default branch, require a
pull request, require the status checks from `python.yml` (and your k6 workflow), and block force pushes.

Then repeat 3.3: open a PR with the broken login rule and try to merge it.

**Questions**
1. Some checks didn't show up in the picker. Why, and how did you get them to appear?
2. Can you, the owner, still merge a red PR? Should you be able to?
3. Why isn't the deploy job a required check?

## 3.10 A load gate on every PR ★★★

Add a job, after the image job, that runs `k6/smoke.js` with 10 users for 20 seconds against the
container, and make it a required check in your ruleset.

**You should see:** it goes red, for the same reason as Exercise 2.5. Leave it red. Part 4 turns it green.

**Questions**
1. How many minutes does this add to every PR? Is it worth it for this project? For your team project?
2. A load test on a shared CI runner is noisy. Which of the three thresholds would you trust in CI,
   and which would you drop or loosen? Why?

---

# Part 4: Put it together

## 4.1 Fix the race, and prove it ★★★

`app/db.py` shares one SQLite connection across all the server's threads. Fix it on a branch of your fork.

1. **Before:** record a `make load` result against the current image (from 2.5).
2. **Fix it.** Two options: a module-level `threading.Lock` around each query, or a new connection per request.
3. **After:** rebuild and rerun `make load`, three times.
4. **In CI:** push the branch. The load gate from 3.10 should turn green.

**You should see:** with the lock, 20 users for 30 s gives `checks` 100%, `http_req_failed` 0%, and 0 responses with status 500.

**Questions**
1. Try to write a pytest test that fails before the fix and passes after (for example, many requests at
   once from a `concurrent.futures.ThreadPoolExecutor`). Does it fail reliably? What does that tell you
   about testing for races?
2. Lock vs. connection-per-request: which one did you pick, and what does each cost under load?

## 4.2 Swap the dev server for gunicorn ★★★

Back on the **unfixed** code, change the Dockerfile to run gunicorn instead of the Flask dev server:

```dockerfile
RUN pip install --no-cache-dir flask gunicorn
CMD ["gunicorn", "--workers", "4", "--bind", "0.0.0.0:8000", "app:create_app()"]
```

Load-test it. Then run the same image with one worker and eight threads:

```bash
docker run -d --rm --name app -p 8000:8000 python-example-project \
  gunicorn --workers 1 --threads 8 --bind 0.0.0.0:8000 "app:create_app()"
make load
```

**You should see:** 4 workers: all green, with no code change. 1 worker × 8 threads: red again, checks around 97%.

**Questions**
1. Did gunicorn fix the bug? Explain what 4 sync workers changed and what the threads put back.
2. Is "it passes the load test" enough to merge? What would you write in the PR description?
3. Run the **Python example load test (k6)** workflow from your fork's Actions tab before and after the switch.
   Compare p95 and the error count.

## 4.3 Find the breaking point ★★★

With the race fixed (4.1), use `k6/ramp.js` from 2.9 to ramp up until a threshold fails. Do it twice:
once against the Flask dev server, once against gunicorn with 4 workers.

**Deliver:** for each server, the number of users where it first failed, which threshold failed, and the
HTML report from 2.10 showing it. One paragraph: what fails first, and what would you change next?

---

## What to hand in

Unless your instructor says otherwise:

1. Your notes file with the answers to every question you did.
2. A link to your fork, with:
   - the green PR from 4.1 (the race fix), including before/after k6 numbers in the description;
   - your `k6-smoke.yml` workflow and a run page that shows the summary table from 3.8;
   - your `main` ruleset (a screenshot is fine).
3. The two HTML reports from 4.3.
