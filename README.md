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
