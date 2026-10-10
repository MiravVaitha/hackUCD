# ProofShield AI

Order evidence, customer complaint resolution and chargeback defence for small merchants.
Built for hackUCD as a working demo.

ProofShield keeps one tamper-evident record per order, filled in from checkout through
packing and delivery, and uses it at two moments:

1. **Resolve** — when a customer complains to the merchant, before any bank is involved.
2. **Defend** — when a chargeback is filed and evidence has to go to the bank.

The demo runs on a fictional store, Voltbox, with payments in Stripe test mode.

## Run it locally

Requirements: Node 20 or newer and pnpm. No Docker and no database install are needed;
`pnpm dev` starts an embedded Postgres whose data lives in `.data/`.

```bash
pnpm install
cp .env.example .env.local   # then fill in the values
pnpm dev                     # http://localhost:3000
```

`pnpm dev` applies database migrations and creates the demo merchant, its catalogue and
three logins (`owner@`, `support@` and `packer@voltbox.demo`) that share `DEMO_PASSWORD`.

## Environment variables

See `.env.example`. Secrets live in `.env.local`, which is git-ignored.

| Variable | Needed for |
|---|---|
| `STRIPE_SECRET_KEY` | Checkout, refunds and dispute responses (use a sandbox key) |
| `STRIPE_WEBHOOK_SECRET` | Verifying events sent to `/api/webhooks/stripe` |
| `OPENROUTER_API_KEY` | AI investigations and rebuttal drafts |
| `DEMO_PASSWORD` | The shared password for the demo logins |
| `DATABASE_URL` | Hosted Postgres. Leave unset locally |

`/api/health` reports which of these are missing, by name only.

## Deploy

The app is a single Next.js project and deploys to Vercel as-is. `vercel-build` applies
migrations and bootstraps the demo merchant before building.

1. Import the repository in Vercel.
2. Add a Postgres database from the Storage tab (Neon, Frankfurt), connected to the project.
3. Add the environment variables above.
4. In the Stripe sandbox, add a webhook endpoint for `https://<your-domain>/api/webhooks/stripe`
   and put its signing secret in `STRIPE_WEBHOOK_SECRET`.

## Checks

```bash
pnpm typecheck
pnpm lint
pnpm test                  # unit and database tests (needs the local database running)
pnpm exec playwright test  # end-to-end tests against the dev server
pnpm build
```

## Layout

```
src/app            Routes: landing, demo store, merchant app, packing station, API
src/db             Drizzle schema and database client
src/lib/ledger     Append-only hash-chained evidence ledger
src/lib/evidence   Evidence file storage
src/lib/auth       Passwords, sessions and access guards
drizzle            SQL migrations, including the append-only triggers
scripts            Local database, migrations and bootstrap
tests              Unit, database and end-to-end tests
```

## Limits worth knowing

- Records are tamper-evident, not tamper-proof.
- Packing scans and photos show what the merchant recorded. They do not prove what a
  customer received.
- Nothing here guarantees a dispute outcome.
- All customer data in the demo is fictional. Do not enter real personal data.
