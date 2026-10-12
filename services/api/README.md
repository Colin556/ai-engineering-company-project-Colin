# Brasaland Backoffice API (`services/api`)

FastAPI backend exposing the incident analysis logic used by
`scripts/analyze.py`. See [scripts/INCIDENT_ANALYZER.md](../../scripts/INCIDENT_ANALYZER.md)
for the CSV schema and validation rules.

## Run locally

```bash
cd services/api
pip install -r requirements.txt
cp .env.example .env   # then set SECRET_KEY to a long random value
uvicorn main:app --reload --port 8000
```

The app refuses to start without `SECRET_KEY`. Generate one with:
`python -c "import secrets; print(secrets.token_urlsafe(48))"`.

## Authentication

Stateless JWT only — no sessions, no cookies. Users and profiles are stored in
TinyDB and must never be mirrored into Supabase/SQLModel; PostgreSQL tables
reference the TinyDB user id as `user_uuid`.

Environment variables (`.env`): `SECRET_KEY`, `ALGORITHM` (default `HS256`),
`ACCESS_TOKEN_EXPIRE_MINUTES` (default `30`).

### Password reset email (Resend)

Reset emails are sent through [Resend](https://resend.com). Set these in
`services/api/.env` (never commit real values):

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `RESEND_API_KEY` | yes, to send email | — | Resend API key (create one at resend.com → API Keys). If empty, the API still answers `200` but logs a warning and sends nothing. |
| `EMAIL_FROM` | no | `Brasaland <onboarding@resend.dev>` | Sender. The onboarding sender needs no domain but only delivers to the email on your Resend account. |
| `FRONTEND_BASE_URL` | no | `http://localhost:3000` | Backoffice URL used to build `<FRONTEND_BASE_URL>/reset-password?token=...`. |
| `PASSWORD_RESET_TOKEN_EXPIRE_MINUTES` | no | `30` | Reset link lifetime, clamped to 15–60. |

Reset tokens are signed JWTs (`type=password_reset`, unique `jti`, `exp`). Only a
SHA-256 hash of the `jti` is stored in the TinyDB `password_reset_tokens` table;
the row is deleted on use, when a newer link is requested, or when the password
is changed, so each link works once. Reset tokens are rejected as session tokens.

| Route | Auth | Notes |
| --- | --- | --- |
| `POST /users` | public | Register. Optional `name`/`phone`/`address` create the linked profile. Role is always `user`. |
| `POST /auth/login` | public | OAuth2 password form; send the email as `username`. Returns a bearer token. |
| `POST /auth/login/json` | public | Same, with a JSON `{email, password}` body. |
| `GET /auth/me` | token | Email, role and linked profile. |
| `POST /auth/forgot-password` | public | `{email}`. Always `200` with the same message; emails a reset link only if the account exists. |
| `POST /auth/reset-password` | public | `{token, new_password}`. `400` for invalid, expired or already-used tokens. |
| `POST /auth/change-password` | token | `{current_password, new_password}`. `400` if the current password is wrong. |
| `GET /users`, `GET/PUT/DELETE /users/{id}` | token | Read/update/delete restricted to the owner or an admin. Only an admin may change `role`/`is_active`. |
| `GET/PUT /profiles/me` | token | Owner-only display name and contact data. |
| `GET /suppliers`, `GET /suppliers/{id}` | public | Temporarily open so the backoffice can render the catalogue. |
| `POST /suppliers`, both `PATCH`, `DELETE /suppliers/{id}` | token | Mutations. |
| `POST /api/incidents/analyze`, `GET /api/incidents/results/export` | token | Incident data. |

Unauthenticated requests get `401`; authenticated requests for someone else's
resource get `403`. Unexpected server errors return a generic message without
exposing a traceback.

### Incident manager

Incident records are stored in TinyDB alongside the backoffice data. Writes
require authentication; reads support the authenticated backoffice and return
empty results and zero-valued summaries when no incidents exist.

| Route | Notes |
| --- | --- |
| `POST /api/incidents` | Create an incident; invalid fields return `400` with `{field, message}`. |
| `GET /api/incidents` | List; optional `status`, `origin`, `branch`, and `category` filters. |
| `GET /api/incidents/{id}` | Incident detail; `404` when missing. |
| `GET /api/incidents/{id}/status?status=...` | Transition status according to the lifecycle. `PATCH` is also supported for the backoffice. |
| `GET /api/incidents/summary` | Totals by status, category, origin, and branch. |
| `GET /api/incidents/options` | Allowed form values and Brasaland branch IDs/labels. |

Seed the historical CSV once or rerun safely; records are deduplicated by the
CSV `incident_id`:

```bash
python scripts/seed_incidents.py
python scripts/seed_incidents.py path/to/incidents.csv
```

The seeder reuses analyzer validation. It maps `closed` to `resolved`, keeps
the analyzer category values, uses `description` for the title and description,
maps `location` to a `LOC-CITY-NN` branch, and sets missing legacy locations to
`central`. Historical rows without descriptions get a category-based generic
description. Invalid rows are reported and not inserted.

### Manual check in `/docs`

1. `POST /users` to register.
2. `POST /auth/login` (or the **Authorize** button) with the email as `username`.
3. Paste the `access_token` into **Authorize** and call any protected route.
4. Calling the same route with no token, a malformed token, or an expired one
   returns `401`.

## Analyzer compatibility endpoints

- `POST /api/incidents/analyze` — multipart/form-data upload with a `file`
  field containing the CSV. Returns the analysis summary as JSON. Returns
  `400` for empty files, non-CSV files, or unparsable CSV content.
- `GET /api/incidents/results/export` — downloads the last analysis as
  `results.csv` (one row per metric). Returns `404` if no analysis has run
  yet in this process.

The last analysis is kept in memory only (no persistence); restarting the
server clears it.

## Inventory (Milestone 5)

This extends the same FastAPI service, following
`Context Files/CONTEXT_BackEndDev.md` and `Context Files/CONTEXT05.md`.
Users, passwords, profiles, and authentication stay in the existing TinyDB
client in `core.py`. `database.py` initializes that client and a separate
SQLModel engine for Supabase. Each inventory request gets its own session;
there is no global session and no relational user table.

### Supabase setup

```bash
cd services/api
uv sync
```

In Supabase, open **Connect**, choose **Transaction pooler**, select **URI**,
and add the provided PostgreSQL URI as `DATABASE_URL` in your existing `.env`.
Keep all existing TinyDB/authentication settings unchanged. URL-encode any
reserved characters in the database password; never commit the URI. The
engine requires TLS and uses a 10-second connection timeout. Do not use a
Supabase REST URL or service-role API key as the database URI.

```dotenv
DATABASE_URL=postgresql://postgres.PROJECT_REF:URL_ENCODED_PASSWORD@POOLER_HOST:6543/postgres
```

Application startup calls `SQLModel.metadata.create_all(engine)` and fails
if the PostgreSQL connection is missing or unavailable. This initializes
new tables, not migrations for previously created tables.

```bash
uv run uvicorn main:app --reload --port 8000
```

### Routes and guarantees

All inventory routes require the existing TinyDB bearer token. The company
context does not specify public inventory reads, so these operational records
are authenticated by default.

| Route | Behavior |
| --- | --- |
| `GET /inventory/products` | Ingredients with computed stock; optional `country=CO` or `US`. |
| `POST /inventory/products` | Create an ingredient with zero stock; duplicate SKU returns `409`. |
| `GET /inventory/products/{id}` | Ingredient and computed stock; missing ID returns `404`. |
| `POST /inventory/orders/inbound` | Delivery: `ingredient_id`, `quantity`, `supplier_name`, `location_id`. |
| `POST /inventory/orders/outbound` | Exit: `ingredient_id`, `quantity`, `reason`, `location_id`. |
| `GET /inventory/orders` | Entries and exits with `order_type`, nested `ingredient` data, and `user_uuid`; optional country/location filters. |

`models.py` contains only SQLModel inventory tables; `schemas.py` contains
the separate Pydantic schemas for inventory and the existing accounts/data.
Ingredients have unique SKUs and database-level foreign keys from both order
tables. `country`, `unit`, `category`, and exit `reason` use PostgreSQL enums.
Locations are integers 1-14, not foreign keys; no country/location mapping is
enforced because none is specified in the milestone context.

Stock is **per ingredient across all locations**, exactly as specified by the
context formula, not per location. It is never a stored or editable column.
Product requests cannot include stock; order requests cannot include a user
UUID or timestamp. The API supplies the authenticated TinyDB user UUID and
creation time. There are no update/delete routes for ingredients or orders.
Invalid fields return `422`. Quantities must be positive and finite, with up
to six decimal places and 18 total digits; storage uses PostgreSQL NUMERIC
and responses expose the specified numeric values.

Both order writers lock the ingredient row with `SELECT ... FOR UPDATE` until
commit. The outbound check uses the latest committed net stock under
explicit READ COMMITTED isolation; an oversized exit returns
`400` with the exact context error and is never inserted. Operations must
write orders through this API, not insert/edit history directly in Supabase.
Ingredient listing uses one aggregate query. Order listing uses three queries
regardless of the number of orders, loading ingredient data through joins
instead of lazy relationship access.

### Demo seed

Register/login with the existing auth routes and take the user's `id` from
`GET /auth/me`. Then run:

```bash
uv run seed-inventory --user-uuid EXISTING_TINYDB_USER_UUID
```

The seeder checks that the user exists and is active, creates all six specified
ingredients, four deliveries, and three exits (including waste), and commits
them together. Rerunning skips matching demo records without duplicating them
or overwriting existing order history. It refuses mismatched existing demo
ingredients or an exit that would overdraw current stock.

| SKU | Inbound | Outbound | Seeded stock |
| --- | --- | --- | --- |
| BRS-BEEF-001 | 80 | 10 | 70 |
| BRS-PORK-001 | 40 | 5 | 35 |
| BRS-SAUCE-001 | 20 | 2 | 18 |
| BRS-SAUCE-002 | 0 | 0 | 0 |
| BRS-PROD-001 | 0 | 0 | 0 |
| BRS-PKG-001 | 0 | 0 | 0 |

### Verification

```bash
uv run pytest tests/test_inventory.py -q
uv run pytest -q
```

Inventory tests use an isolated SQLite database with foreign keys enabled
and never access the developer's Supabase database. They exercise startup,
all endpoints, stock arithmetic, rejected exits, validation, attribution,
foreign keys, seed idempotency, filters, and fixed query counts. SQLite does
not implement PostgreSQL row locks. Two optional tests check simultaneous
exits and PostgreSQL foreign-key/enum enforcement. Run them against a disposable
database named `brasaland_inventory_test` only (the tests drop its inventory
tables afterward):

```bash
INVENTORY_TEST_DATABASE_URL=postgresql://USER:PASSWORD@localhost:PORT/brasaland_inventory_test \
  uv run pytest tests/test_inventory.py -k postgres -q
```

Never point the test variable at a development or production database. These
checks are skipped when the isolated test URI is not supplied. They do not
replace checking the actual Supabase connection before the demo.
