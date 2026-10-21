# Final Presentation Rubric

This rubric defines expectations for the class final presentation and project delivery.

## Submission Requirements

Each team must present and provide links/screenshots for:

- GitHub repository
- Project board or issue board
- Pull requests and review history
- CI pipeline runs
- Kubernetes deployment evidence
- Automated test results

## Non-Negotiable Final Presentation Expectations

- The final presentation must explicitly cover all process and delivery areas in this rubric: Agile ceremonies, GitHub issues, pull requests/code review, automated tests, CI, and Kubernetes deployment.
- Kubernetes must be demonstrated on a local cluster controlled by the student team (for example, Docker Desktop Kubernetes, minikube, or kind on their machine).
- A hosted/shared instructor cluster may be discussed, but it does not replace the required local student-cluster demo.

## Scoring Summary (100 points)

| Category | Points |
| --- | ---: |
| 1. Product Demo and Presentation Quality | 15 |
| 2. Agile Process and Ceremonies | 15 |
| 3. GitHub Issues and Project Planning | 15 |
| 4. Pull Requests and Code Review Workflow | 15 |
| 5. Automated Testing Strategy and Results | 20 |
| 6. CI Pipeline Quality | 10 |
| 7. Kubernetes Deployment and Operations | 10 |
| **Total** | **100** |

---

## 1) Product Demo and Presentation Quality (15 points)

### Exceeds (13-15)

- Clear, professional presentation with logical flow
- Live demo works end-to-end with minimal intervention
- Team explains architecture, tradeoffs, and lessons learned
- All presenters can answer technical questions

### Meets (10-12)

- Demo mostly works and team explains core functionality
- Presentation is understandable but may lack depth in tradeoffs

### Approaches (6-9)

- Demo is partially working or heavily scripted
- Limited explanation of technical decisions

### Does Not Meet (0-5)

- Demo fails without recovery path
- Presentation lacks clarity or technical understanding

---

## 2) Agile Process and Ceremonies (15 points)

### Exceeds (13-15)

- Team demonstrates regular sprint cadence (planning, standups, review/demo, retrospective)
- Ceremony outcomes are documented and actionable
- Evidence of adaptation based on retrospective feedback

### Meets (10-12)

- Team ran most ceremonies with some documentation
- Basic sprint rhythm is visible

### Approaches (6-9)

- Ceremonies happened inconsistently or informally
- Documentation is sparse or unclear

### Does Not Meet (0-5)

- No clear evidence of Agile ceremonies
- Work appears ad hoc

### Required Evidence

- Sprint plan and sprint goals
- Standup notes (or equivalent updates)
- Sprint review/demo notes
- Retrospective notes with action items

---

## 3) GitHub Issues and Project Planning (15 points)

### Exceeds (13-15)

- Issues are well-scoped with acceptance criteria
- Labels, assignees, priorities, and milestones are used consistently
- Issue lifecycle reflects real project progress

### Meets (10-12)

- Issues exist for most planned work
- Some use of labels/assignees/milestones

### Approaches (6-9)

- Issues exist but are vague or incomplete
- Limited traceability from issue to delivered work

### Does Not Meet (0-5)

- Minimal or no issue tracking

### Required Evidence

- Representative issue list
- Example of issue with acceptance criteria
- Closed issues tied to delivered features

---

## 4) Pull Requests and Code Review Workflow (15 points)

### Exceeds (13-15)

- All major changes go through PRs
- PRs are focused, descriptive, and linked to issues
- Meaningful peer review comments and addressed feedback
- Branch protection/review expectations are followed

### Meets (10-12)

- Most changes go through PRs
- Basic review process is visible

### Approaches (6-9)

- PRs are present but inconsistent, oversized, or poorly described
- Limited review quality

### Does Not Meet (0-5)

- Direct commits to main branch dominate
- Little/no review evidence

### Required Evidence

- Multiple PR examples with review discussion
- PR templates or conventions used by team
- Issue links in PRs

---

## 5) Automated Testing Strategy and Results (20 points)

### Exceeds (17-20)

- Balanced test strategy (unit + integration, and optionally end-to-end)
- Tests are deterministic and meaningful
- Team explains test coverage areas and known gaps
- Presentation includes passing test run evidence

### Meets (13-16)

- Automated tests cover core functionality
- Team can run tests and explain basic strategy

### Approaches (8-12)

- Limited tests or mostly happy-path coverage
- Gaps in reliability or reproducibility

### Does Not Meet (0-7)

- Minimal automated tests or failing test suite

### Required Evidence

- Test suite execution output
- Examples of unit and integration tests
- Explanation of what is not yet tested

---

## 6) CI Pipeline Quality (10 points)

### Exceeds (9-10)

- CI runs on PRs and main branch
- CI includes lint/build/tests and clear failure reporting
- Team demonstrates at least one failed run and recovery

### Meets (7-8)

- CI runs automatically with at least build/tests
- Basic status visibility in GitHub

### Approaches (4-6)

- CI exists but is incomplete or inconsistently triggered

### Does Not Meet (0-3)

- No functioning CI pipeline

### Required Evidence

- Workflow configuration file
- Recent successful run(s)
- Pipeline status badge or checks on PR

---

## 7) Kubernetes Deployment and Operations (10 points)

### Exceeds (9-10)

- App is deployed to Kubernetes with reproducible manifests
- Team explains resources used (Deployment, Service, Ingress, ConfigMap/Secret, etc.)
- Deployment updates are demonstrated safely (rollout status, restart, rollback awareness)
- Team demonstrates deployment on their own local cluster during presentation

### Meets (7-8)

- App is deployed and accessible in Kubernetes
- Team can explain basic deployment components
- Team confirms cluster is local to the student environment

### Approaches (4-6)

- Deployment partially works or requires manual fixes
- Limited operational understanding
- Local-cluster ownership is unclear or only partially demonstrated

### Does Not Meet (0-3)

- No working Kubernetes deployment demonstration
- Kubernetes demo is not on a student-local cluster

### Required Evidence

- Kubernetes manifests in repo
- Live `kubectl get` output during presentation
- App accessible via cluster exposure method
- `kubectl config current-context` shown live to verify local cluster context

---

## Academic/Teamwork Expectations

- All team members must contribute and present.
- Work should reflect professional collaboration and attribution.
- Be prepared to explain who owned each subsystem and how handoffs were managed.

## Suggested Presentation Structure (10-12 minutes)

1. Problem statement and goals
2. Architecture overview
3. Agile process and team workflow
4. GitHub issues/PR process evidence
5. Automated testing and CI demonstration
6. Kubernetes deployment demonstration
7. Lessons learned and next steps
