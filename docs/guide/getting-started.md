# Getting Started

How to get a local instance of this Ghostfolio fork running.

## Prerequisites

- Node.js and npm (see `engines` in [package.json](../../package.json))
- Docker (for PostgreSQL and Redis, or for running the full application)
- A `.env` file in the repository root (copy it from `.env.dev` and adjust the values)

## Run locally

```shell
npm run database:setup
npm run start:server
npm run start:client
```

- `database:setup` applies the Prisma schema and seeds the base data.
- `start:server` starts the NestJS API.
- `start:client` starts the Angular client.

The client is served on `http://localhost:4200` and talks to the API on `http://localhost:3333`.

For deeper development topics (migrations, tests, code style), see [DEVELOPMENT.md](../../DEVELOPMENT.md).

## Next steps

- Deploy with Docker: [deployment.md](deployment.md)
- Configure the investment features (Capital Pool, DCA, Rebalancing, Signals):
  [investment-features.md](investment-features.md)
- Day-to-day operations and troubleshooting: [operations.md](operations.md)
