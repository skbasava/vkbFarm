# VKB Farm Manager

VKB Farm Manager is a mobile-first application for tracking shared farm spending,
contributions, settlements, plantation inventory, harvests, revenue, and cash flow.

## Stack

React and Vite provide the client application. A Hono API runs in a Cloudflare
Worker, with D1 for relational data and R2 for receipt files.

## Prerequisites

- Node.js 20 or newer
- npm
- A Cloudflare account is required only for remote deployment

## Run locally

```bash
npm install
npm run dev
```

The local D1 identifier in `wrangler.jsonc` is a non-secret placeholder that is
valid for local development. Before remote deployment, create the D1 database and
R2 bucket, then replace the `database_id` in both the root and `production`
environment binding with the created D1 database ID.

Later implementation slices add the complete migration, seeding, and production
deployment instructions.

## Production and preview security

Cloudflare Access is mandatory for this application in production. Before deploying,
create or update a Cloudflare Access application and policy that covers **every**
production hostname and every preview hostname that serves VKB Farm Manager. This
includes the initial `workers.dev` or custom production hostname and any branch or
preview hostnames enabled for the Worker. Do not leave an alternate hostname or
direct route outside the Access application.

The Worker treats `Cf-Access-Authenticated-User-Email` as an identity only on
these Access-protected hostnames. It looks up the matching active person and role
in D1. With `ENVIRONMENT=production`, a missing or unknown identity is rejected
with HTTP 401; it never falls back to the local development user. The automated
Worker identity test verifies this fail-closed behavior, but Cloudflare Access
policy coverage is an account-level deployment requirement that Wrangler cannot
create or validate from this repository.
