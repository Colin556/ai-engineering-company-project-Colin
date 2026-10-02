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
