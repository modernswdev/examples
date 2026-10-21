# python-example-project

A small Flask app with cookie-based login and a widgets page, built for teaching
automated testing in Python. It is the Python twin of `javascript-example-project`
(Node.js): same front end, same API, same three test layers.

## Tech stack

- Python 3.12 or newer
- Flask
- SQLite (standard library) for the database
- pytest, pytest-cov (unit and integration tests, coverage)
- Playwright for Python via pytest-playwright (end-to-end tests)
- k6 (smoke and load tests against a running server)

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
playwright install chromium        # one-time browser download for the E2E tests
```

## Run the app

```bash
python -m app                      # http://localhost:8000, login admin / password
```

The database is a SQLite file, `app.db` by default. Set `APP_DB_PATH` to change it.
Set `DEFAULT_ADMIN_PASSWORD` to change the seeded admin password.

## Testing

Three layers, three folders, three commands:

| Layer | Folder | Command | What is real | What is faked |
|---|---|---|---|---|
| Unit | `tests/unit/` | `make test-unit` | One module of pure functions | Everything else is absent |
| Integration | `tests/integration/` | `make test-integration` | The Flask app, routes, cookies, real SQL on in-memory SQLite | Nothing, but the DB is in memory |
| End-to-end | `tests/e2e/` | `make test-e2e` | A real Chromium browser and the real server process | Nothing |

- `make test` (or plain `pytest`) runs unit + integration. Fast, no browser needed.
- `make test-all` runs everything.
- `make coverage` runs the fast layers with a coverage table, plus an HTML report in `htmlcov/index.html`.
- `make coverage-unit` and `make coverage-integration` show what each layer covers on its own.
- `make coverage-summary` reprints the last coverage run as a table with raw covered/total counts.

Every `make` target is a single plain command. Open the `Makefile` to see it, or run
the command directly if you do not have `make`.

See [TESTING_PLAYBOOK.md](TESTING_PLAYBOOK.md) for the class walkthrough: it explains
what each layer proves and includes verified break/fix demos.

## Docker

```bash
docker build -t python-example-project .           # or: make docker-build
docker run --rm -p 8000:8000 python-example-project
```

## Smoke and load tests (k6)

[`k6/smoke.js`](k6/smoke.js) is one user journey (page, 401 without a cookie, login, widgets,
logout) with pass/fail thresholds. Start the app first (`make run` or `docker run` above), then:

```bash
make smoke                                         # k6 run k6/smoke.js: 1 user for 10 s
make load                                          # same script, 20 users for 30 s
k6 run --vus 50 --duration 2m k6/smoke.js          # any size you like
k6 run -e BASE_URL=http://localhost:8080 k6/smoke.js
```

Install k6 with `brew install k6` (or see [grafana.com/docs/k6](https://grafana.com/docs/k6/latest/set-up/install-k6/)).
Without installing it: `docker run --rm -i -e BASE_URL=http://host.docker.internal:8000 grafana/k6 run - < k6/smoke.js`.

Under load, some requests fail with `sqlite3.InterfaceError`. That is a real bug the functional
tests cannot see; [CICD_PRESENTATION.md](CICD_PRESENTATION.md) uses it as a live demo.

[CICD_EXERCISES.md](CICD_EXERCISES.md) has hands-on exercises for Docker, k6, and GitHub Actions,
from easy to hard, including finding and fixing that bug.

## CI/CD

GitHub Actions runs [`../.github/workflows/python.yml`](../.github/workflows/python.yml)
on every pull request to `main`, every merge to `main`, and on demand from the Actions tab:

```
fast-tests (Python 3.12, 3.13, 3.14) ──► e2e-tests ──► docker-image ──────► deploy (main only)
unit, integration, coverage              Playwright      build, k6 smoke,    push to Docker Hub,
                                                         save image          rolling update, k6 smoke,
                                                                             roll back on failure
```

Each job runs only if the one before it passed. A second workflow,
[`python-load-test.yml`](../.github/workflows/python-load-test.yml), runs the k6 script as a load
test on demand ("Run workflow", choose users and duration) and uploads k6's HTML report.

## Kubernetes

The app runs in the `python-example` namespace on the class Linode cluster: a one-pod Deployment
(rolling updates, readiness probe) and a ClusterIP Service. Manifests are in [`k8s/app/`](k8s/app/); CI applies them with `kubectl apply -k`.

```bash
kubectl -n python-example get deploy,pods
kubectl -n python-example port-forward svc/python-example 8000:80   # then open http://localhost:8000
kubectl -n python-example rollout history deployment/python-example
kubectl -n python-example rollout undo deployment/python-example
```

One-time setup, as a cluster admin: `kubectl apply -f k8s/bootstrap/` creates the namespace and a
`github-deployer` service account limited to it. Then store its kubeconfig and a Docker Hub token on
the repo's `production` environment:

```bash
scripts/deployer_kubeconfig.sh | gh secret set KUBECONFIG --env production
gh secret set DOCKERHUB_TOKEN --env production
```

See [CICD_PRESENTATION.md](CICD_PRESENTATION.md) for the class deck.

## Security notes

This example stores passwords in plaintext and uses a fixed token as the login cookie.
That keeps the code short for teaching. Do not copy either idea into a real application.
