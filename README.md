# examples

Teaching examples for the Modern Software Development course. Two versions of the same
small app, each with unit, integration, and end-to-end tests, coverage tooling, CI, a
class playbook of break/fix demos, and a 45-minute presentation deck.

| Project | Stack | Start here |
|---|---|---|
| [javascript-example-project/](javascript-example-project/) | Node.js, Express, Jest, supertest, Playwright | [README](javascript-example-project/README.md), [Playbook](javascript-example-project/TESTING_PLAYBOOK.md), [Deck](javascript-example-project/TESTING_PRESENTATION.md) |
| [python-example-project/](python-example-project/) | Python, Flask, pytest, pytest-cov, Playwright | [README](python-example-project/README.md), [Playbook](python-example-project/TESTING_PLAYBOOK.md), [Deck](python-example-project/TESTING_PRESENTATION.md) |

Each project is self-contained: `cd` into it and follow its README. CI runs from `.github/workflows/`:
`node.yml` whenever files under the Node project change, and `python.yml`, a full CI/CD pipeline
(tests, a Docker build with a k6 smoke test, then a deploy to the class Kubernetes cluster from `main`),
on every pull request and merge to `main`. The Python project also has a
[CI/CD deck](python-example-project/CICD_PRESENTATION.md) and
[exercises](python-example-project/CICD_EXERCISES.md). The JavaScript project also has lesson plans for
[containers](javascript-example-project/container-lessonplan.md) and
[Kubernetes](javascript-example-project/kubernetes-lessonplan.md).
