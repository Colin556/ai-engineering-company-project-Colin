# Incident File Analyzer API (`services/api`)

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

| Route | Auth | Notes |
| --- | --- | --- |
| `POST /users` | public | Register. Optional `name`/`phone`/`address` create the linked profile. Role is always `user`. |
| `POST /auth/login` | public | OAuth2 password form; send the email as `username`. Returns a bearer token. |
| `POST /auth/login/json` | public | Same, with a JSON `{email, password}` body. |
| `GET /auth/me` | token | Email, role and linked profile. |
| `GET /users`, `GET/PUT/DELETE /users/{id}` | token | Read/update/delete restricted to the owner or an admin. Only an admin may change `role`/`is_active`. |
| `GET/PUT /profiles/me` | token | Owner-only display name and contact data. |
| `GET /suppliers`, `GET /suppliers/{id}` | public | Temporarily open so the backoffice can render the catalogue. |
| `POST /suppliers`, both `PATCH`, `DELETE /suppliers/{id}` | token | Mutations. |
| `POST /api/incidents/analyze`, `GET /api/incidents/results/export` | token | Incident data. |

Unauthenticated requests get `401`; authenticated requests for someone else's
resource get `403`.

### Manual check in `/docs`

1. `POST /users` to register.
2. `POST /auth/login` (or the **Authorize** button) with the email as `username`.
3. Paste the `access_token` into **Authorize** and call any protected route.
4. Calling the same route with no token, a malformed token, or an expired one
   returns `401`.

## Endpoints

- `POST /api/incidents/analyze` — multipart/form-data upload with a `file`
  field containing the CSV. Returns the analysis summary as JSON. Returns
  `400` for empty files, non-CSV files, or unparsable CSV content.
- `GET /api/incidents/results/export` — downloads the last analysis as
  `results.csv` (one row per metric). Returns `404` if no analysis has run
  yet in this process.

The last analysis is kept in memory only (no persistence); restarting the
server clears it.
