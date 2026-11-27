# Tally

Tally finds every subscription you pay for, from your Gmail receipts and your M-Pesa or bank statements, and emails you before each renewal.

For each subscription it shows what you pay, whether it is weekly, monthly or yearly, when it next renews, and your yearly total across everything.

## How it works

1. **Sign in with Google** with read-only Gmail access (`gmail.readonly`).
2. **Scan** the last 18 months of mail for receipts, invoices, renewal notices and known subscription senders (`src/lib/services.ts`).
3. **Extract** the service, amount, currency, plan, charge date, billing cycle and a confidence score from each email with Claude, as structured JSON (`src/lib/extract.ts`).
4. **Infer the pattern** (`src/lib/cycles.ts`): group charges by service, take the cycle from the gaps between charges, set next renewal to last charge plus one cycle, and mark a service "possibly cancelled" when an expected charge is overdue.
5. **Review**: confirm, edit or dismiss what was found, and add anything missing by hand.
6. **M-Pesa statement**: upload the PDF. Tally finds paybills and tills you pay on a regular schedule with similar amounts (`src/lib/mpesa.ts`) and merges them with the email results. The same payment seen in both places is counted once.
7. **Bank statement**: upload the same way. Tally tells the two apart on its own. Bank layouts vary, so with `ANTHROPIC_API_KEY` set Claude lists the payments out (the statement text is sent to the Claude API). Without a key, a rule-based reader works out each debit from the running balance (`src/lib/bank.ts`). Both feed the same recurring detection (`src/lib/recurring.ts`).
7. **Reminders**: a daily Vercel Cron job (`/api/cron/reminders`) emails you a few days before each renewal, through Brevo.

## Demo mode

You can try everything without any credentials. In demo mode the app reads a built-in inbox (`src/fixtures/emails.ts`) and generated sample M-Pesa and bank statements (`src/fixtures/mpesa-statement.ts`, `src/fixtures/bank-statement.ts`). Fixture dates are relative to today, so the demo always looks current.

Demo mode is on when `DEMO_MODE=true`, or automatically when no Google client is configured. Without `ANTHROPIC_API_KEY`, emails go through a small rule-based extractor instead of Claude. Without `BREVO_API_KEY`, reminders are written to the server log instead of sent.

A sample statement PDF is also in `fixtures/sample-mpesa-statement.pdf` if you want to test the upload form. Regenerate it with `pnpm mpesa:sample`.

## Run it locally

You need Node 20 or later, pnpm, and Postgres.

```bash
pnpm install
cp .env.example .env          # then fill in DATABASE_URL and AUTH_SECRET at least
pnpm db:migrate               # creates the tables
pnpm dev                      # http://localhost:3000
```

For a local database:

```bash
createuser -s tally 2>/dev/null; psql -c "alter user tally with password 'tally';"
createdb -O tally tally
# DATABASE_URL="postgresql://tally:tally@localhost:5432/tally?schema=public"
```

Generate `AUTH_SECRET` with `openssl rand -base64 32`.

Checks:

```bash
pnpm test     # unit tests for cycle inference, M-Pesa and bank statement parsing, and extraction
pnpm lint
pnpm e2e      # drives the demo flow in a browser; needs `pnpm dev` running
```

## Set up Google sign-in (testing mode)

Gmail read access is a *restricted* scope. While the OAuth app stays in **testing mode** you can use it with up to 100 test users and without Google's verification review. Tokens for test users expire after 7 days, so you may need to sign in again each week.

1. Go to the [Google Cloud console](https://console.cloud.google.com/) and create a project (for example `tally`).
2. **APIs & Services > Library**: search for **Gmail API** and click **Enable**.
3. **Google Auth Platform > Branding** (older consoles: **OAuth consent screen**):
   - App name: Tally. User support email and developer contact: your email.
   - Audience / user type: **External**.
   - Leave the publishing status as **Testing**. Do not publish it.
4. **Audience > Test users**: click **Add users** and add your own Gmail address (and anyone else who should try it, up to 100).
5. **Data Access** (or **Scopes**): add `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile` and `https://www.googleapis.com/auth/gmail.readonly`.
6. **Clients > Create client** (or **Credentials > Create credentials > OAuth client ID**):
   - Application type: **Web application**.
   - Authorized JavaScript origins:
     - `http://localhost:3000`
     - `https://YOUR-APP.vercel.app` (when deployed)
   - Authorized redirect URIs:
     - `http://localhost:3000/api/auth/callback/google`
     - `https://YOUR-APP.vercel.app/api/auth/callback/google`
7. Copy the **Client ID** and **Client secret** into `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`.

When you sign in, Google warns that the app is unverified. Click **Continue**: that is expected in testing mode.

## Environment variables

| Variable | Required | What it is |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string used by the app. On Supabase use the pooled "Transaction pooler" string (port 6543) with `?pgbouncer=true`. |
| `DIRECT_URL` | Supabase only | Direct connection (port 5432). Used by `prisma migrate`. |
| `AUTH_SECRET` | yes | Random string that signs sessions. `openssl rand -base64 32`. |
| `AUTH_URL` | production | Public URL of the app, e.g. `https://tally.vercel.app`. |
| `AUTH_GOOGLE_ID` | for Gmail | Google OAuth client ID. |
| `AUTH_GOOGLE_SECRET` | for Gmail | Google OAuth client secret. |
| `DEMO_MODE` | no | `true` shows "Try the demo". Defaults to on when Google is not configured; `false` hides it. |
| `ANTHROPIC_API_KEY` | for Claude | Claude API key. Without it the rule-based extractor is used. |
| `ANTHROPIC_MODEL` | no | Model override. Default `claude-opus-5-5`. |
| `BREVO_API_KEY` | for reminders | Brevo API key (SMTP & API > API keys). Without it reminders are only logged. |
| `REMINDER_FROM_EMAIL` | for reminders | Sender address, verified in Brevo. |
| `CRON_SECRET` | yes in production | Protects `/api/cron/reminders`. Vercel Cron sends it as a bearer token when it is set in the project. |
| `APP_URL` | no | Link used in reminder emails. Defaults to `AUTH_URL`. |
| `SCAN_MONTHS` | no | How far back to scan Gmail. Default 18. |
| `SCAN_MAX_EMAILS` | no | Most new emails one scan reads. Default 1000. Emails already read are skipped, so the next scan continues further back. |
| `FX_RATES_JSON` | no | KES per unit of other currencies, e.g. `{"USD":129.5}`. Totals are shown in KES. |
| `APP_TIMEZONE` | no | Time zone for dates. Default `Africa/Nairobi`. |
| `NEXT_PUBLIC_LOGOS` | no | `off` shows initials instead of loading logos from Google's favicon service. |

Never commit `.env`. It is in `.gitignore`; only `.env.example` is tracked.

## Deploying to Vercel with Supabase

1. Create a Supabase project. From **Connect**, copy the transaction pooler string into `DATABASE_URL` (add `?pgbouncer=true`) and the direct string into `DIRECT_URL`.
2. Run `pnpm db:deploy` once with those variables set, to create the tables.
3. Import the repo into Vercel and add the environment variables above.
4. `vercel.json` schedules the reminder job daily at 05:00 UTC (08:00 in Nairobi).
5. Add the production redirect URI to your Google OAuth client.

## Notes and limits of this first version

- A Gmail scan runs inside one request, capped at 400 emails and processed four at a time. That is fine for one person; a background queue would be the next step.
- Exchange rates are static. Totals convert everything to KES.
- M-Pesa statements are often password protected. Remove the password before uploading (open it and "print to PDF"), or add password support later.
- Logos come from Google's favicon service when the domain is known, with a coloured initial as fallback.

## Later

- **Forwarding address**: each user gets a unique address and auto-forwards receipts to it, so other people can use Tally without Google's restricted-scope review.

## Project layout

```
src/
  app/                 pages (landing, dashboard, review, sources), server actions, API routes
  components/          UI pieces (logo, chart, nav, forms)
  lib/
    cycles.ts          cycle inference, next renewal, possibly cancelled
    extract.ts         Claude extraction + rule-based fallback
    gmail.ts           read-only Gmail client
    mpesa.ts           statement parsing + recurring detection
    pipeline.ts        sources -> charges -> subscriptions
    reminders.ts       daily reminder job + Brevo
  fixtures/            demo inbox and sample M-Pesa and bank statements
prisma/schema.prisma   data model
```
