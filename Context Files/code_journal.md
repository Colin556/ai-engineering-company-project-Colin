# Code Journal

## 2026-09-29 — AUTH-02: Frontend authentication flows and protected views

Branch: `feature/auth-frontend`

### Goal
Close the loop on AUTH-01: the API now returns 401 on protected routes, so the Next.js apps (backoffice and talent-pipeline-tracker) need login/registration, account management, route protection, and a full JWT token lifecycle. The public website (Milestone 1) stays untouched.

### What was done

**Route structure (both apps)**
- Moved all existing pages into an `app/(protected)/` route group (URLs unchanged). Its layout wraps content in `AuthGuard`.
- Added an `app/(auth)/` route group for the public `/login` and `/register` views.

**Token lifecycle — `lib/auth.ts` (both apps)**
- Token stored in `localStorage` under `brasaland_access_token`.
- `setToken` / `clearToken` dispatch a custom event so same-tab listeners react (the native `storage` event only fires in other tabs).
- `isTokenUsable` decodes the JWT `exp` claim as a client-side sanity check; the API remains the authority.
- `logout()` clears the token and redirects to `/login`.

**Route protection — `components/AuthGuard.tsx` (both apps)**
- Client guard using `useSyncExternalStore` over localStorage (no Next.js middleware, since it cannot read localStorage).
- Missing or expired token → token cleared, `router.replace("/login")`. Nothing protected renders until the check passes.

**API client**
- Backoffice `lib/api.ts`: new `authFetch` attaches `Authorization: Bearer <token>` to every call; any 401 clears the token and redirects to `/login`. `ApiError` carries field-level errors parsed from FastAPI 422 responses (409 duplicate email mapped to the `email` field).
- Added `login` (`POST /auth/login`, OAuth2 form with email as `username`), `register` (`POST /users` then login), `getMe` (`GET /auth/me`), `updateMyProfile` (`PUT /profiles/me`).
- Incident CSV export switched from a plain `<a href>` (cannot send headers) to an authenticated fetch + blob download.
- Tracker: new `lib/authApi.ts` with the same auth functions, pointed at the Brasaland API via `NEXT_PUBLIC_AUTH_API_BASE_URL` (default `http://127.0.0.1:8000`). The JWT is intentionally **not** sent to the third-party 4geeks candidates API.

**Views (both apps)**
- `/login`: email + password; on success stores token and redirects to `/`; on failure shows the API error.
- `/register`: email, password, optional name/phone/address; client-side validation plus server field-level errors; on success registers, logs in, stores token, redirects.
- `/account/profile`: shows email and role from `/auth/me`, edits name/phone/address via `PUT /profiles/me`.
- Navigation: "My profile" and "Log out" added (backoffice protected layout; tracker `AppShell`). Tracker strings added to the EN/ES i18n dictionaries.

### Verification
- `next build` passes for both apps; ESLint passes for the tracker (backoffice has no ESLint config).
- Tracker dependencies were installed with `npm ci` (they were missing).
- The end-to-end browser flow (login → protected view → logout) still needs a manual check against the running API.

### Follow-ups
- Auth helpers are duplicated per app; could move to `packages/shared` once cross-app builds are configured.
- Supplier `GET` endpoints on the API are still public; consider requiring auth now that the frontend sends the token.


10/02/26

### Incident Manager
- Added TinyDB-backed incident CRUD, filters, lifecycle transitions, field validation, generic server errors, and summary metrics under `/api/incidents`.
- Replaced the incident CSV upload page with registration, filtering, status updates with rollback, and summary views in the backoffice.
- Added an idempotent historical CSV seeder that reuses analyzer validation, maps `closed` to `resolved`, and reports invalid rows. Seeded 94 valid incidents; 6 invalid rows were skipped. Re-running skipped all 94 existing records.
- Added all 14 restaurant branch IDs in the existing `LOC-CITY-NN` format plus `central`; enriched generated CSV rows with descriptions and locations. Legacy rows without location use `central`.

### Verification
- All 29 API tests passed; the Next.js production build and TypeScript check passed.
- Backoffice ESLint remains unavailable because the project has no ESLint 9 configuration.
