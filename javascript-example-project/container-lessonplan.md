# Lesson Plan: Containerization Fundamentals with Docker

This lesson plan is designed for an undergraduate course in Software Engineering or DevOps. It covers the conceptual "Why," the technical "How," and multi-container orchestration using the javascript-example-project.

---

## Part 1: The Fundamentals (The "Why")

### 1.1 The Problem: "It Works on My Machine"

Traditional development often fails due to environment drift. Differences in OS versions, missing libraries, or conflicting settings create bugs that are nearly impossible to reproduce across different machines.

### 1.2 What is a Container?

A container is a lightweight, standalone, executable package that includes everything needed to run an application: code, runtime, system tools, and libraries.

### 1.3 Containers vs. Virtual Machines (VMs)

| Feature | Virtual Machines (VMs) | Containers (Docker) |
| --- | --- | --- |
| OS | Includes a full guest OS | Shares the host OS kernel |
| Size | Large (Gigabytes) | Small (Megabytes) |
| Speed | Slow (Minutes to boot) | Fast (Seconds to start) |
| Efficiency | High overhead | Low overhead |

---

## Part 2: The Docker Lifecycle

To dockerize an application, we follow a three-step workflow: Build, Ship, and Run.

- Dockerfile (The Recipe): A text file with instructions on how to build the environment.
- Image (The Cake): A read-only snapshot created from the Dockerfile.
- Container (The Eating): A running instance of an image.

---

## Part 3: Manual Multi-Container Networking (The "How")

For learning purposes, you can orchestrate multiple containers manually using Docker networks. This demonstrates the underlying concepts that compose automates.

### 3.1 The Problem: Containers Can't Find Each Other

**Step 1: Build the app image**

```bash
docker build -t my-node-app .
```

**Step 2: Try running the app alone (This will FAIL)**

```bash
docker run -d --name my-app -p 3000:3000 my-node-app
```

The container will start but immediately crash because it tries to connect to `db` (which doesn't exist):

```
Error: getaddrinfo ENOTFOUND db
```

### 3.2 Debugging: Check the Container Logs

Before setting up the database, let's see what went wrong:

```bash
# View the logs of the failed container
docker logs my-app
```

You'll see the `ENOTFOUND db` error, confirming the app is looking for a service named `db` that isn't available yet.

**Clean up the failed container:**

```bash
docker stop my-app
docker rm my-app
```

### 3.3 The Solution: Create a Docker Network

Containers need to be on the same **Docker network** to communicate by hostname.

**Create a network:**

```bash
docker network create my-app-network
```

**Step 3: Run Postgres on the network**

```bash
docker run -d \
  --name postgres-db \
  --network my-app-network \
  -e POSTGRES_USER=example \
  -e POSTGRES_PASSWORD=example \
  -e POSTGRES_DB=exampledb \
  -v postgres-data:/var/lib/postgresql/data \
  postgres:15-alpine
```

**Step 4: Run the Node.js app on the same network**

```bash
docker run -d \
  --name my-app \
  --network my-app-network \
  -p 3000:3000 \
  -e POSTGRES_HOST=postgres-db \
  -e POSTGRES_USER=example \
  -e POSTGRES_PASSWORD=example \
  -e POSTGRES_DB=exampledb \
  my-node-app
```

### 3.4 Verify It Works

**Check both containers are running:**

```bash
docker ps
```

**View the app logs (should succeed now):**

```bash
docker logs my-app
```

**Test the app:**

```bash
curl http://localhost:3000
```

### 3.5 Cleanup

When you're done:

```bash
docker stop my-app postgres-db
docker rm my-app postgres-db
docker network rm my-app-network
docker volume rm postgres-data
```

---

## Part 4: Multi-Container Orchestration with Docker Compose (Automated)

### 4.1 The docker-compose.yml Logic

Compose manages the web service and the db service together.

```yaml
version: '3.8'
services:
  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: example
      POSTGRES_PASSWORD: example
    volumes:
      - db-data:/var/lib/postgresql/data
  web:
    build: .
    ports:
      - "3000:3000"
    environment:
      - POSTGRES_HOST=db
    depends_on:
      - db
```

### 4.2 The "Magic" Compose Commands

Now compare this to Part 3. With one command, Compose handles:
- Creating a network
- Running both services
- Setting environment variables
- Managing dependencies

```bash
# Start the full stack automatically
docker compose up -d
```

```bash
# Check status
docker compose ps
```

```bash
# Shut down everything
docker compose down
```

### 4.3 Why Compose Matters

Compare Part 3 (manual, 11 commands) with Part 4 (Compose, 1 command). You now understand what Compose automates:

- **Network creation:** Compose creates an isolated network for all services
- **Service discovery:** Services find each other by name automatically
- **Environment variables:** Defined once in the YAML
- **Dependency management:** `depends_on` ensures proper startup order
- **Cleanup:** One `docker compose down` stops and removes everything

---

## Summary: From Manual to Automated

**Part 3 (Manual approach):** Understand the underlying concepts—create networks, launch containers, set environment variables, debug failures.

**Part 4 (Docker Compose):** Declare your desired state once, and Compose automates the rest.

This progression is key to understanding why containerization tools exist and how to troubleshoot when something goes wrong.
