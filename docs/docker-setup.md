# Docker Setup

## Overview

This project can run in Docker with:

- one `web` container for the application
- one separate `mssql` container for local development
- a mounted Docker volume for `/app/public/storage`

The app container uses a pinned Alpine-based Node image (`node:22-alpine3.22`) to keep the runtime smaller, reduce the vulnerability surface where practical, and avoid unnecessary risk from adopting a newer major runtime too early.

This setup is intended to support local development, testing, and future deployment packaging. It does not replace the multi-tenant implementation work.

## Files Added

- [Dockerfile](../Dockerfile)
- [docker-compose.yml](../docker-compose.yml)
- [.dockerignore](../.dockerignore)
- [.env.example](../.env.example)

## Security defaults — 11 November 2026

Compose runs a production-mode web container: development impersonation is always disabled in that mode, even if an old environment file enables its flag. Bucket administration is an explicit verified platform-admin operation; ordinary application startup only checks storage availability. See the [security review disposition](SECURITY-REVIEW-20261111.md) for the verified boundaries. The steps below configure local development infrastructure, not production migration or cloud authority.

## Important Notes

- SQL Server runs as a separate container, not inside the app container.
- The `web` image is Alpine-based. SQL Server is not Alpine-based because the official SQL Server container is not provided as an Alpine image.
- The application reads MSSQL connection settings from environment variables.
- Persistent uploaded files are stored in a Docker volume mounted to `/app/public/storage`.
- The current container runs the Node server directly and generates `public/env-config.js` at startup.
- Only the containers needed to run this app are included by default. Redis, RabbitMQ, PostgreSQL, and observability tools are not added because the current codebase does not require them at runtime.

## Prerequisites

- Docker Desktop running
- Docker Compose available

## Quick Start

### 1. Create the Docker env file

Copy `.env.example` to an untracked `.env.docker`. Set `MSSQL_DATABASE`, `MSSQL_USER` and a strong nonempty `MSSQL_PASSWORD` for your local SQL instance. Compose intentionally has no shared SA password fallback. Pass that file with `--env-file` so Compose interpolation and the web container use the same values. Never commit the filled file.

### 2. Build and start the containers

```bash
docker compose --env-file .env.docker --profile core up --build
```

### 3. Open the application

Use:

- `http://localhost:5174`

### 4. Stop the containers

```bash
docker compose --env-file .env.docker --profile core down
```

To also remove volumes:

```bash
docker compose --env-file .env.docker --profile core down -v
```

## Default Services

### `web`

Responsibilities:
- starts the KH Rentals server
- generates browser env config on startup
- exposes the app on port `5174`

### `mssql`

Responsibilities:
- runs SQL Server 2022 Developer edition for local use
- exposes port `1433`
- persists database files in a Docker volume

## Profiles

### `core`

Starts the minimum required stack for this project:

- `web`
- `mssql`

## Environment Variables

Key variables used by the app container:

- `PORT`
- `MSSQL_SERVER`
- `MSSQL_PORT`
- `MSSQL_DATABASE`
- `MSSQL_USER`
- `MSSQL_PASSWORD`
- `MSSQL_ENCRYPT`
- `MSSQL_TRUST_SERVER_CERTIFICATE`
- `VITE_API_ENDPOINT`
- `VITE_APP_BASE_URL`
- `VITE_USE_MSSQL_API`

Optional integration variables:

- `EVIA_SIGN_CLIENT_ID`
- `EVIA_SIGN_CLIENT_SECRET`
- `SENDGRID_API_KEY`
- `DEFAULT_FROM_EMAIL`
- `DEFAULT_FROM_NAME`

## Storage

The compose setup uses a named Docker volume for:

- `/app/public/storage`

This keeps uploaded files outside the container filesystem so they survive container recreation.

## Current Runtime Model

The current Docker setup is intentionally simple:

- app runs in one Node container
- SQL Server runs separately
- storage uses a mounted volume

This is intentionally minimal. Based on the current codebase, no additional infrastructure containers are required to boot the application.

This fits the current codebase and the sprint plan. It also keeps the app ready for future multi-service evolution if needed.

## Recommended Production Direction

For production, prefer:

- app in a container
- SQL Server as an external managed database
- mounted or managed persistent storage
- environment variables injected by the hosting platform

## Troubleshooting

### SQL Server takes time to start
If the app starts before SQL Server is fully ready, wait a bit and retry. The app already handles missing MSSQL configuration more safely than before, but initial DB startup can still take some time.

### Port conflicts
If `5174` or `1433` is already in use, update the compose port mapping.

### Login or API issues
Check container logs:

```bash
docker compose --env-file .env.docker logs web
docker compose --env-file .env.docker logs mssql
```

### Rebuild after dependency changes
If `package.json` changes, rebuild:

```bash
docker compose --env-file .env.docker --profile core up --build
```
