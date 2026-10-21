# javascript-example-project

Simple Node.js app with a minimal React-like front end and cookie-based login.
It is the JavaScript twin of [`python-example-project`](../python-example-project/):
same front end, same API, same three test layers.

## Tech Stack

- Node.js 20 or newer
- Express 4.x
- cookie-parser
- pg (node-postgres)
- Minimal vanilla front-end JavaScript (no bundler required)
- Docker / Docker Compose
- Jest + supertest (unit and integration tests), Playwright (end-to-end tests)

## Project Idea

A compact example that demonstrates a minimal full-stack application: an Express server providing a tiny JSON API and cookie-based authentication, served alongside a small client-side UI that requires no build step. This is intended as a learning / prototype starter project.

## Mission Statement

Provide a minimal, easy-to-run example showing how to wire a server and client together with cookie-based auth and make it runnable locally or in a container with zero build tooling.

## How to run (local)

1. Open a terminal and change to the project folder:

   ```bash
   cd javascript-example-project
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the server:

   ```bash
   npm start
   ```

   - Server will listen on http://localhost:3000
   - For development with automatic restart use `npm run dev`.

Note: the app can be pointed at a local Postgres instance by setting the standard POSTGRES_* environment variables (see the Docker section for the defaults used in Docker Compose).

## Testing

Three layers, three folders, three commands:

| Layer | Folder | Command |
|---|---|---|
| Unit | `test/unit/` | `npm run test:unit` |
| Integration (Express app via supertest, in-memory DB) | `test/integration/` | `npm run test:integration` |
| End-to-end (real browser via Playwright, real server) | `test/e2e/` | `npm run test:e2e` |

- `npm test` runs unit + integration (fast, no browser needed).
- `npm run test:all` runs everything.
- `npm run test:coverage` shows which lines the fast tests never execute, and writes an HTML report to `coverage/index.html`.
- `npm run test:coverage:unit` and `npm run test:coverage:integration` show what each layer covers on its own.
- `npm run coverage:summary` reprints the last coverage run as a table with raw covered/total counts.
- One-time setup for E2E: `npx playwright install chromium`.

No database is needed for any tests: with `NODE_ENV=test` the app uses an in-memory fake (see `lib/db.js`).

See [TESTING_PLAYBOOK.md](TESTING_PLAYBOOK.md) for the class walkthrough: it explains what each layer proves and includes verified break/fix demos.

## Database (Postgres)

This project includes optional Postgres integration. The server uses `pg` and will create a simple `users` table on startup if it does not already exist.

Environment variables used by the app to connect to Postgres:

- POSTGRES_HOST (default: `db` in Docker Compose)
- POSTGRES_PORT (default: `5432`)
- POSTGRES_USER (default: `example`)
- POSTGRES_PASSWORD (default: `example`)
- POSTGRES_DB (default: `exampledb`)

Important: For security, do not commit real credentials to the repository. Use environment files or your platform's secret management.

## Docker - build and run

Build the image (from project root):

```bash
docker build -t javascript-example-project .
```

Run the container (simple run):

```bash
docker run --rm -p 3000:3000 \
  -e POSTGRES_HOST=db \
  -e POSTGRES_PORT=5432 \
  -e POSTGRES_USER=example \
  -e POSTGRES_PASSWORD=example \
  -e POSTGRES_DB=exampledb \
  javascript-example-project
```

Note: Running the single container image above expects a reachable Postgres instance at the host you specify. For a one-command setup that includes Postgres, use Docker Compose below.

Run with NODE_ENV set explicitly:

```bash
docker run --rm -e NODE_ENV=production -p 3000:3000 javascript-example-project
```

Development run (mount source, use nodemon inside container):

```bash
docker run --rm -it -p 3000:3000 \
  -v "$(pwd)":/usr/src/app \
  -v /usr/src/app/node_modules \
  javascript-example-project npm run dev
```

### Docker Compose

The included `docker-compose.yml` defines two services: `db` (Postgres) and `web` (this app). To build and start both services run:

```bash
docker compose up --build
```

Possible troubleshooting notes:

- The compose `depends_on` ensures start order but does not guarantee the database is ready to accept connections. If the web service logs show connection errors at startup, either restart the web service after the db is up or use a small retry/wait loop. Example restart:

  ```bash
  docker compose restart web
  ```

- To view logs for the db or web services:

  ```bash
  docker compose logs -f db
  docker compose logs -f web
  ```

- To remove and recreate the database volume (data will be lost):

  ```bash
  docker compose down -v
  ```

## Security notes

- This example stores passwords in plaintext for simplicity. For any real application, store hashed passwords (bcrypt/argon2) and never commit secrets to source control.
- Use HTTPS and secure cookie flags in production.

## Further improvements (suggestions)

- Replace plaintext passwords with hashed passwords and add a registration flow.
- Add migrations and seed scripts (e.g. using node-pg-migrate or a simple SQL script).
- Add proper session/JWT handling and logout invalidation.
- Run the integration tests against a real Postgres instance in CI.
