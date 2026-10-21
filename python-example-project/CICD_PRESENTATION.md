---
marp: true
paginate: true
style: |
  section { font-size: 23px; padding: 48px 64px 56px; }
  section h2 { margin-bottom: 0.4em; }
  section table { font-size: 0.92em; }
  section td, section th { padding: 4px 12px; }
  section pre { font-size: 0.82em; }
---

# CI/CD with GitHub Actions, k6, and Kubernetes

### From a merged PR to running pods, for `python-example-project`

30–45 minutes. One pipeline, one k6 script used two ways, one cluster.

<!--
Timing budget is in each slide title. The core slides sum to 41 minutes. Slides marked (optional)
add 12 more: skip them for a 45-minute slot. For about 35 minutes, also skip "LIVE: a red PR" and
"LIVE: break a rollout on purpose".

Before class:
  1. Actions tab: the latest run on main is green, including "Deploy to Linode".
  2. Demo PRs #2 (red unit test) and #3 (127.0.0.1 bind) are open as drafts with finished runs.
  3. Laptop: k6 installed (`brew install k6`), kubectl pointed at the class cluster
     (`kubectl -n python-example get pods` works), the app running locally (`make run`) for the load demo.
  4. Tabs open: the Actions tab, the PR list, .github/workflows/python.yml, k6/smoke.js.
Renders with Marp (VS Code extension or `npx @marp-team/marp-cli`); reads fine as plain Markdown too.
Follows TESTING_PRESENTATION.md: students should already know the three test layers.
-->

---

## Agenda `⏱ 1 min`

| Minutes | Topic |
|---|---|
| 0–9 | Why CI/CD, the three terms, the pipeline, the vocabulary |
| 9–16 | Triggers and the test jobs |
| 16–24 | k6: a smoke test, the same script as a load test, and the bug only load finds |
| 24–35 | Deploying: rolling updates, the k6 gate, rollback, load on the real cluster |
| 35–41 | A red PR, protecting `main`, wrap-up |

By the end you should be able to open `.github/workflows/python.yml`, say what runs when,
explain why a PR got a red X, and run a load test against the cluster.

---

## The problem CI solves `⏱ 2 min`

Last session we wrote 15 tests. They help only if someone runs them.

- "It passed on my machine": a dependency in your venv that isn't in `requirements.txt`
- "I forgot to run the E2E tests": they take longer, so they get skipped
- "Who broke `main`?": three PRs merged this morning, and none of them ran anything
- "It's merged. Is it live?": someone has to remember to deploy, and do it the same way every time

**Continuous integration:** every change gets tested **automatically, on a clean machine,
before and after it reaches `main`.** **Continuous deployment:** every green `main` ships itself.

<!--
Ask: who has pulled main and found it broken? What did it cost to find which commit did it?
CI makes "which commit broke it" a question you never have to ask: every commit has a check mark or an X.
-->

---

## Three terms people mix up `⏱ 2 min`

| Term | What happens automatically | Who decides to release |
|---|---|---|
| **Continuous Integration** | Every push and PR is built and tested | n/a, nothing is released |
| **Continuous Delivery** | ...and every green `main` produces a **ready-to-ship artifact** | A human clicks "deploy" |
| **Continuous Deployment** | ...and every green `main` **goes live** | Nobody: the pipeline does it |

Each row includes the one above it. **CD** means either of the bottom two, depending on who's talking.

**This project:** continuous deployment to the class cluster. Every green merge to `main`
is pushed, rolled out, smoke-tested in place, and **rolled back by itself** if the smoke test fails.

<!--
The difference between delivery and deployment is a human decision, not a technical one.
Plenty of good teams stop at delivery on purpose. Going all the way is only safe because of what
runs before (tests) and after (the k6 gate and automatic rollback). That's what most of today is about.
-->

---

## The pipeline at a glance `⏱ 2 min`

```
 PR opened / commit pushed / merged to main
                │
                ▼
┌──────────────────────┐   ┌──────────────┐   ┌───────────────────┐   ┌──────────────────────────┐
│ fast-tests  (×3 Py)  │   │ e2e-tests    │   │ docker-image      │   │ deploy      (main only)  │
│  pytest tests/unit   │──►│  Chromium    │──►│  docker build     │──►│  push to Docker Hub      │
│  pytest tests/integ. │   │  pytest e2e  │   │  docker run       │   │  kubectl apply + rollout │
│  coverage → summary  │   │              │   │  k6 smoke test    │   │  k6 smoke on live pods   │
└──────────────────────┘   └──────────────┘   │  save image       │   │  roll back on failure    │
                                              └───────────────────┘   └──────────────────────────┘
```

Fast and cheap first, slow and risky last. Each arrow means **"only if everything to the left passed."**

Plus a separate button, **Python example load test (k6)**: the same k6 script, as many users as you ask for.

<!--
On a PR, the first three run and deploy shows as skipped. On main, all four run.
Show the real job times on the Actions tab. On the first deploy: 12–22 s, 36 s, 30 s, and 53 s for the deploy.
-->

---

## GitHub Actions vocabulary `⏱ 2 min`

| Word | Meaning | In our file |
|---|---|---|
| **Workflow** | One YAML file in `.github/workflows/` | `python.yml` |
| **Event** | What starts it | `push`, `pull_request`, `workflow_dispatch` |
| **Job** | A group of steps on **one fresh machine** | `fast-tests`, ..., `deploy` |
| **Runner** | That machine: a clean Ubuntu VM, thrown away after the job | `runs-on: ubuntu-latest` |
| **Step** | One shell command (`run:`) or one reusable action (`uses:`) | `run: pytest tests/unit` |
| **Action** | A packaged, reusable step someone published | `grafana/setup-k6-action@v1` |
| **Artifact** | A file a job saves for you to download | coverage HTML, the Docker image, the k6 report |
| **Secret** | A credential the log never prints | `DOCKERHUB_TOKEN`, `KUBECONFIG` |

**Jobs share nothing.** That's why every job starts with checkout, and why the image travels as an artifact.

---

## Where the file lives (optional) `⏱ 1 min`

```
examples/                            ← the GitHub repo
├── .github/workflows/
│   ├── node.yml                     ← the Node project's pipeline
│   ├── python.yml                   ← ours
│   └── python-load-test.yml         ← the load-test button
├── javascript-example-project/
└── python-example-project/
```

GitHub only reads workflows from `.github/workflows/` **at the repo root**, so every command runs in the subfolder:

```yaml
defaults:
  run:
    working-directory: python-example-project
```

---

## Triggers: when does it run? `⏱ 2 min`

```yaml
on:
  push:
    branches: [ main ]     # every merge (or direct push) to main
  pull_request:
    branches: [ main ]     # every PR aimed at main, re-run on each new commit
  workflow_dispatch:       # adds a "Run workflow" button on the Actions tab
```

| You do | It runs? | Deploys? |
|---|---|---|
| Push commits to `feature/login` with no PR | No | No |
| Open a PR from `feature/login` → `main` | **Yes**, and on every push to it | No |
| Merge the PR | **Yes**, on `main`: tests the merged result | **Yes** |
| Click "Run workflow" on `main` | **Yes** | **Yes** (a redeploy) |

Why test again after merging? The PR tested *your branch*. The merge commit combines it with whatever
else landed on `main`, and nobody has tested that yet. It's also the commit that gets deployed.

<!--
There's no `paths:` filter (the Node workflow has one). With a filter, a PR that only touches the Node
project skips this workflow. If this workflow is a required check, that PR then waits forever for a status
that never arrives.
-->

---

## Concurrency and permissions (optional) `⏱ 2 min`

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

permissions:
  contents: read
```

**Concurrency:** push three commits to a PR in a minute, and only the newest one matters, so older
runs get cancelled. Runs on `main` are never cancelled; they queue. **Two deploys never run at once.**

**Permissions:** each run gets a `GITHUB_TOKEN`. We ask for the least it needs: read the code.

`${{ ... }}` is an **expression**: GitHub fills it in before the job starts.

---

## Job 1: fast tests, three Pythons at once `⏱ 2 min`

```yaml
  fast-tests:
    name: Unit and integration tests (Python ${{ matrix.python-version }})
    strategy:
      fail-fast: false
      matrix:
        python-version: [ '3.12', '3.13', '3.14' ]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: ${{ matrix.python-version }}
          cache: pip
      - run: pip install -r requirements.txt
      - name: Unit tests
        run: pytest tests/unit
      - name: Integration tests
        run: pytest tests/integration
```

A **matrix** turns one job into three, in parallel. The README promises "Python 3.12 or newer"; this checks it.
`fail-fast: false` lets the others finish when one fails, so you see *which* versions broke.

<!--
Why are unit and integration separate steps? So the red X names the layer.
`cache: pip` keeps downloaded packages between runs, keyed on requirements.txt.
-->

---

## Conditional steps, summaries, artifacts (optional) `⏱ 2 min`

```yaml
      - name: Coverage (unit + integration)
        if: matrix.python-version == '3.12'
        run: pytest --cov --cov-report=term-missing --cov-report=html --cov-report=json

      - name: Add coverage table to the job summary
        if: matrix.python-version == '3.12'
        run: python scripts/coverage_summary.py >> "$GITHUB_STEP_SUMMARY"
```

- **`if:`** skips a step unless the condition is true. Coverage is the same on every version, so measure it once.
- **`$GITHUB_STEP_SUMMARY`**: anything written to this file shows up as Markdown on the run's page.
- **Artifacts**: files the runner saves before it's thrown away. Download them from the run page.

---

## Job 2: end-to-end, only if the fast tests pass `⏱ 1 min`

```yaml
  e2e-tests:
    needs: fast-tests
    steps:
      - run: playwright install --with-deps chromium
      - run: pytest tests/e2e --screenshot only-on-failure
      - name: Upload failure screenshots
        if: failure()
```

- **`needs:`** draws the arrow. If `fast-tests` fails, this job shows as **skipped**.
- With a matrix, `needs: fast-tests` waits for **all three** versions.
- **`if: failure()`** runs a step only when an earlier one failed: a screenshot beats a timeout message.

---

## Job 3: test the thing you ship `⏱ 2 min`

```yaml
  docker-image:
    needs: e2e-tests
    steps:
      - run: docker build -t "$IMAGE" .
      - run: docker run -d --name app -p 8000:8000 "$IMAGE"
      - name: Wait for the container to answer
        run: curl --fail --retry 20 --retry-delay 1 --retry-all-errors http://localhost:8000/
      - uses: grafana/setup-k6-action@v1
      - name: k6 smoke test against the container
        run: k6 run -e BASE_URL=http://localhost:8000 k6/smoke.js
      - name: Show container logs
        if: always()
        run: docker logs app
```

Jobs 1 and 2 test **the code in a checkout**. Users run the **image**, which has its own Dockerfile,
its own installed packages, and its own start command.

A **smoke test** asks one question: *does the built thing turn on and do the basics?*

<!--
Look at the Dockerfile: `pip install flask`, not `pip install -r requirements.txt`. If someone adds a runtime
dependency to requirements.txt, the tests pass and only this job catches the crash. (Exercise 3.)
-->

---

## k6: one script, one user journey `⏱ 2 min`

```js
export const options = {
  vus: 1,                               // 1 virtual user...
  duration: '10s',                      // ...for 10 seconds: a smoke test
  thresholds: {
    checks: ['rate>0.99'],              // more than 99% of checks pass
    http_req_failed: ['rate<0.01'],     // fewer than 1% of requests fail
    http_req_duration: ['p(95)<500'],   // 95% of requests finish in under 500 ms
  },
};

export default function () {            // each virtual user runs this in a loop
  http.get(`${BASE_URL}/`);                                 // the login page
  http.get(`${BASE_URL}/api/widgets`, ...);                 // expect 401: no cookie yet
  const login = http.post(`${BASE_URL}/api/login`, ...);
  check(login, { 'login is 200': (r) => r.status === 200 });
  http.get(`${BASE_URL}/api/widgets`);                      // the cookie jar sends the token
  http.post(`${BASE_URL}/api/logout`);
  sleep(1);                                                 // think time
}
```

- **Check:** one assertion, counted, never stops the test. **Threshold:** the pass/fail rule for the whole run.
- Any threshold fails → k6 **exits 99** → the CI step goes red. That's the whole integration.

<!--
Open k6/smoke.js for the real thing: it groups requests, checks every response, and guards against
null bodies (a refused connection has no body; a check that throws would skip the sleep and spin).
`responseCallback: http.expectedStatuses(401)` tells k6 that 401 is the right answer there,
so it doesn't count as a failed request.
-->

---

## Smoke test → load test: same script, different flags `⏱ 2 min`

| What | Command |
|---|---|
| Smoke: 1 user, 10 s | `k6 run k6/smoke.js` (or `make smoke`) |
| Load: 20 users, 30 s | `k6 run --vus 20 --duration 30s k6/smoke.js` (or `make load`) |
| Ramp up, hold, ramp down | `k6 run --stage 30s:20 --stage 1m:20 --stage 30s:0 k6/smoke.js` |
| Somewhere else | `k6 run -e BASE_URL=http://localhost:8080 k6/smoke.js` |
| HTML report | `K6_WEB_DASHBOARD=true K6_WEB_DASHBOARD_EXPORT=report.html k6 run ...` |
| No k6 installed | `docker run --rm -i -e BASE_URL=http://host.docker.internal:8000 grafana/k6 run - < k6/smoke.js` |

Command-line flags override `options`; **the thresholds stay the same.** A load test is a smoke test
with more users: the same journey, the same definition of "working", under pressure.

On GitHub: **Actions → Python example load test (k6) → Run workflow**, type users and duration.
It runs against a throwaway container and uploads `k6-load-test-report`.

<!--
Smoke = "does it work at all?" Load = "does it still work with N people at once?"
Stress (find the breaking point) and soak (hours at normal load) are the same script with other flags.
-->

---

## LIVE: the bug only load can find `⏱ 4 min`

With the app running locally (`make run`):

```bash
make smoke          # 1 user:  ✓ all thresholds, 70 of 70 checks
make load           # 20 users: ✗ checks 'rate>0.99' rate=98.15%   ✗ http_req_failed 'rate<0.01' rate=1.06%
```

In the server's terminal:

```
sqlite3.InterfaceError: bad parameter or other API misuse
"POST /api/login HTTP/1.1" 500 -
```

`app/db.py` opens **one** SQLite connection, and Flask's server handles requests on **many threads**
at once. Two threads using one connection at the same moment corrupt each other's query.

15 tests, coverage, a smoke test: all green. **None of them ever sent two requests at the same time.**

<!--
Exact numbers vary run to run: it's a race. If a run comes up clean, use `--vus 50`.
The fix is a lock (or a connection per request). Verified: wrap the two queries in
`with _lock:` (a module-level threading.Lock), and 20 users for 30 s gives 0 of 4,088 checks failed.
Don't fix it in class: leave it as exercise 1. It shows up again when we load-test the cluster.
-->

---

## Job 4: deploy `⏱ 3 min`

```yaml
  deploy:
    needs: docker-image
    if: github.ref == 'refs/heads/main'
    environment: production              # holds the secrets; only main may use it
    steps:
      - uses: actions/download-artifact@v4   # the exact image job 3 tested
      - run: docker load -i image.tar.gz && docker tag "$LOCAL_IMAGE" "$IMAGE"
      - uses: docker/login-action@v3
        with: { username: dstrimble83, password: "${{ secrets.DOCKERHUB_TOKEN }}" }
      - run: docker push "$IMAGE"                       # dstrimble83/python-example-project:<sha>
      - name: Roll out the new image
        run: |
          kustomize edit set image "python-example-project=$IMAGE"
          kubectl apply -k .
          kubectl rollout status deployment/python-example --timeout=3m
```

- **Build once, ship that build.** No rebuilding from source on the way out.
- **Tag with the commit SHA**, never `latest`: every running pod traces back to one commit.
- **`KUBECONFIG` belongs to `github-deployer`**, a service account that can touch one namespace and nothing else (`k8s/bootstrap/10-deployer.yaml`). If the secret leaked, the damage stops at this app.

---

## Rolling update, the k6 gate, and rollback `⏱ 3 min`

```yaml
    strategy:
      rollingUpdate: { maxSurge: 1, maxUnavailable: 0 }   # one new pod at a time, never fewer ready
    readinessProbe: { httpGet: { path: /, port: http } }   # no traffic until it serves the page
```

```yaml
      - name: k6 smoke test against the cluster      # same script, now on the live pods
        run: k6 run -e BASE_URL=http://localhost:8000 k6/smoke.js     # via kubectl port-forward
      - name: Roll back
        if: failure() && steps.rollout.outputs.applied == 'true'
        run: kubectl rollout undo deployment/python-example
```

Three safety nets, in order:
1. **Readiness probe:** a pod that can't serve never gets traffic, and the rollout stops waiting for it.
2. **`rollout status --timeout`:** a rollout that never finishes fails the job.
3. **k6 smoke on the live pods:** a rollout that "finished" but doesn't work fails the job.

Any of them fails → **`rollout undo`** puts the previous ReplicaSet back.

<!--
The `applied == 'true'` guard matters: if the Docker push fails, nothing new was applied, and an undo
would roll back a perfectly good release instead.
-->

---

## LIVE: the deployed app, under load `⏱ 3 min`

```bash
kubectl -n python-example get deploy,pods
kubectl -n python-example rollout history deployment/python-example
kubectl -n python-example port-forward svc/python-example 8000:80     # leave running
```

In another terminal, the same script CI ran, then the same script as load:

```bash
k6 run k6/smoke.js                                  # what the deploy job just checked
k6 run --vus 20 --duration 30s k6/smoke.js          # 20 users on the real pod
kubectl -n python-example logs deploy/python-example | grep sqlite3
```

Expected (measured on this cluster):
- Smoke: **green**, p95 about 180 ms
- Load: **all three thresholds red**: checks 98.2%, failed requests 1.2%, p95 **914 ms**
- Logs: `sqlite3.InterfaceError: bad parameter or other API misuse`

The bug shipped. Every gate was green because no gate sends 20 users at once.

<!--
Why is latency red here when it was ~15 ms on your laptop? Every request goes through the port-forward:
laptop → Kubernetes API server → node → pod. That tunnel adds ~130 ms and queues under load. Lesson:
measure from where your users are, and know what's between k6 and the app before you trust a latency number.
The errors, though, are the app's: the same SQLite race as locally.
The deploy job's summary on the Actions run shows the running image and the pod, and
Settings → Environments → production lists every deploy.
Ask: should the deploy job run a small load test instead of a smoke test? What would that cost,
and what would it have caught today?
-->

---

## LIVE: break a rollout on purpose `⏱ 2 min`

With the port-forward from the last slide still running:

```bash
kubectl -n python-example set image deployment/python-example app=dstrimble83/python-example-project:does-not-exist
kubectl -n python-example get pods                 # old pod Running, new pod ImagePullBackOff
k6 run k6/smoke.js                                 # still green: 100% of checks
kubectl -n python-example rollout status deployment/python-example --timeout=5s   # "timed out": what CI would see
kubectl -n python-example rollout undo deployment/python-example
```

The new pod never became Ready, so the old one never stopped (`maxSurge: 1`, `maxUnavailable: 0`).
Users saw nothing. In CI, `rollout status --timeout=3m` would have failed and the job would have run that `undo` itself.

<!--
Verified on the cluster: the port-forward stays up throughout, because it's attached to the old pod,
which is the one that keeps running. After the undo, the bad pod goes Terminating and the image is back
to the last merged commit's SHA.
-->

---

## Canary releases, without installing anything (optional) `⏱ 2 min`

A **canary** sends a small share of real traffic to the new version first, and only continues if it's healthy.

With nothing but a Service, the share is the pod ratio:

```
Service  (selector: app=python-example)
 ├── Deployment python-example         3 pods  v1   → ~75% of requests
 └── Deployment python-example-canary  1 pod   v2   → ~25% of requests   (same label)
```

Run k6 load, compare the canary's errors to the stable pods' errors, then scale the canary up or delete it.

Tools like **Flagger** and **Argo Rollouts** automate exactly this: shift 10% → 20% → 50%, read error-rate
and latency from Prometheus at each step, and roll back on their own. They need a traffic router
(a service mesh or a smart ingress) and Prometheus, which is why this cluster doesn't run them yet.

<!--
Our pipeline is a "rolling update with a smoke gate": every pod gets the new version, but only after the
previous one is Ready, and k6 decides at the end. A canary decides gradually, using real traffic.
-->

---

## LIVE: a red PR `⏱ 3 min`

Open draft PR #2: it breaks the login rule in `app/auth_utils.py`:

```python
    return len(creds["username"]) > 0 or len(creds["password"]) > 0   # was: and
```

```bash
gh pr checks 2              # or: git switch -c ..., commit, push, gh pr create --draft --fill
```

Expected:
- All three **Unit and integration tests** jobs fail at **Unit tests**:
  `FAILED tests/unit/test_auth_utils.py::TestHasLoginFields::test_true_only_when_both_fields_are_non_empty`
- E2E, the image job, and deploy are **skipped**
- The PR can't be merged: required checks failed (the ruleset on the next slide)

<!--
Reading a failure, in order: which job is red, which step is red, then the last 20 lines of that step's log.
`gh run view --log-failed` prints only the failing step's log.
The integration tests would not have caught this: no integration test sends a body without a password.
-->

---

## LIVE: a bug only the pipeline sees (optional) `⏱ 3 min`

Open draft PR #3: in `app/__main__.py`, the server listens on `127.0.0.1` instead of `0.0.0.0`.

```bash
make test && make test-e2e          # locally: 12 passed, 3 passed. All green.
```

Expected on the PR:
- Fast tests: green. E2E: green. They run the server on the same machine, so `127.0.0.1` is fine.
- **Build and smoke-test: red** at "Wait for the container to answer", after about 20 seconds:
  `curl: (56) Recv failure: Connection reset by peer`
- "Show container logs" still runs and prints the clue: `Running on http://127.0.0.1:8000`

Inside a container, `127.0.0.1` means **the container itself**. Requests from outside never reach it.

<!--
The "works on my machine" bug in its purest form: every test passes, the shipped artifact is unusable.
Had it reached the cluster, the readiness probe would have kept the new pods out of the Service,
`rollout status` would have timed out, and the deploy job would have rolled back.
-->

---

## Make the checks matter: protect `main` `⏱ 1 min`

**Settings → Rules → Rulesets → "Protect main"** (already set up on this repo):
- Enforcement **Active**, target the **default branch**
- **Require a pull request before merging**
- **Require status checks to pass:** the three `Unit and integration tests (Python 3.x)` checks,
  `End-to-end tests (Playwright)`, `Build and smoke-test the Docker image`
- **Block force pushes** and **restrict deletions**

A red X that people can merge anyway is just a suggestion. Now it's a rule, and since merging deploys, it's also the release gate.

<!--
Check names only appear in the picker after they've run once. Each matrix entry is its own check.
Deploy is not a required check: it runs after the merge, so it can't block one.
This repo is public, so rulesets work on a free account; private repos need a paid plan.
-->

---

## "It passes locally but fails in CI" (optional) `⏱ 2 min`

| Symptom in the log | Usual cause |
|---|---|
| `ModuleNotFoundError` | Installed in your venv, missing from `requirements.txt` |
| `FileNotFoundError`, or a missing import | The file was never committed: check `git status` |
| Same, but the file *is* committed | Case: macOS ignores `App.py` vs `app.py`; Linux doesn't |
| Fails only on 3.12 | You used something newer than the oldest version you support |
| Passes on re-run, fails sometimes | A flaky test, or a race like the SQLite one |
| k6 `http_req_failed` near 100% | The server isn't reachable at `BASE_URL` (Demo PR #3) |
| Deploy: `Forbidden` from kubectl | The deployer's Role doesn't allow that verb or resource |

To reproduce CI locally: fresh venv, `pip install -r requirements.txt`, then the same `make` targets.

---

## What to take away `⏱ 2 min`

1. **CI is a rule, not a tool:** every change is tested automatically, on a clean machine, before and after `main`.
2. **Order the pipeline by cost and risk.** Fast tests, slow tests, package, deploy. `needs:` draws the arrows.
3. **Test the artifact, then test it again where it runs.** Same k6 script on the container and on the cluster.
4. **A smoke test with more users is a load test.** Load found a bug that every other test missed.
5. **Deploy safely, not bravely:** readiness probes, rolling updates, a smoke gate, and an automatic undo.
6. **A check only matters if it blocks the merge.** Protect `main`.

For your team project: every PR gets a green check, and you can show one k6 run and explain its thresholds.

---

## Exercises

1. Fix the SQLite race in `app/db.py` (a `threading.Lock`, or a connection per request).
   Prove it with `make load` before and after. Which test could have caught it? Write one.
2. The README says "Python 3.12 or newer". Add `'3.11'` to the matrix and find out if that's true.
3. Add `requests` to `requirements.txt` and `import requests` in `app/__init__.py`. Which job fails, and why?
   Fix the Dockerfile so the image installs what the app needs and nothing else.
4. Add a check to `k6/smoke.js` that logout clears the cookie. Then add a stricter threshold
   and find the number of users where it starts failing.
5. Replace the Flask dev server in the Dockerfile with `gunicorn` (4 workers). Run the same
   load test from the Actions tab before and after. Compare p95 and the error count.
6. Build the canary from the optional slide by hand: copy the Deployment as `python-example-canary`
   with one replica and a new image, run k6 in the cluster, and count which pods served the errors.

More, from easy to hard, with no cluster needed: [CICD_EXERCISES.md](CICD_EXERCISES.md).
