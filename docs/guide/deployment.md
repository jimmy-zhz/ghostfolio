# Deployment

Two supported ways to run the application with Docker.

## Option 1 — Pre-built image (recommended for production)

No build step is required. The pre-built image `docker.io/ghostfolio/ghostfolio:latest`
is already referenced by `docker/docker-compose.yml`.

```shell
docker compose -f docker/docker-compose.yml up -d
```

Recommended production sequence:

1. Create and fill in the `.env` file.
2. Pull and run the pre-built image with the command above.

## Option 2 — Build locally

```shell
docker compose -f docker/docker-compose.build.yml up -d --build
```

To start the services again later without rebuilding:

```shell
docker compose -f docker/docker-compose.build.yml up -d
```

## Why the build does not need `.env`

The build command in the `Dockerfile` (`npm run build:production`) only compiles the
application. It does not depend on the database password or any other runtime
configuration. Those environment variables are read when the container runs:

```yaml
# docker-compose.yml
services:
  ghostfolio:
    env_file:
      - ../.env # loaded at runtime
```

So the `.env` file must exist before you start the containers, but it is not consumed
during `--build`.
