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


10/02/26 AM

### Incident Manager
- Added TinyDB-backed incident CRUD, filters, lifecycle transitions, field validation, generic server errors, and summary metrics under `/api/incidents`.
- Replaced the incident CSV upload page with registration, filtering, status updates with rollback, and summary views in the backoffice.
- Added an idempotent historical CSV seeder that reuses analyzer validation, maps `closed` to `resolved`, and reports invalid rows. Seeded 94 valid incidents; 6 invalid rows were skipped. Re-running skipped all 94 existing records.
- Added all 14 restaurant branch IDs in the existing `LOC-CITY-NN` format plus `central`; enriched generated CSV rows with descriptions and locations. Legacy rows without location use `central`.

### Verification
- All 29 API tests passed; the Next.js production build and TypeScript check passed.
- Backoffice ESLint remains unavailable because the project has no ESLint 9 configuration.

10/02/26 PM

### Error Handling Audit
- Completed a read-only, repository-wide source scan covering both Next.js apps, the corporate website, FastAPI, Python scripts, and executable skill examples. Reviewed error-bearing operations and their callers; no application code was changed.
- Produced a severity-ranked audit report with file locations, error-handling categories, and suggested fixes. No CRITICAL findings were confirmed.
- Identified risks around sensitive validation responses and logs, partial account writes, reset-token consumption before password persistence, raw API errors reaching users, unhandled browser storage failures, unchecked response shapes, and missing custom error boundaries.
- Documented frontend state issues, including stale candidate data after route changes, overlapping requests, missing options-loading feedback, and incomplete mutation feedback. Existing navigation and resubmittable forms were counted as valid recovery actions.
- Reviewed script and CSV handling for silent score failures, malformed input, unhandled prompts and file writes, misleading success exits, and personal data printed by the pandas example. Also flagged website signup confirmation that claims registration and email delivery without submitting data.

### Verification
- In-memory CSV probes confirmed that malformed satisfaction scores are silently dropped, `NaN` is accepted, and unterminated quoted fields are parsed permissively.
- A seeder probe using synthetic rows and a stubbed in-memory database confirmed exit code 0 for both empty input and entirely invalid input.
- An unattended analyzer run using synthetic standard input confirmed an unhandled `EOFError` at the export prompt; the analyzer process exited with code 1.
- Probes avoided real databases and secrets. The repository test suite was not run because its fixtures truncate configured database tables.
- FastAPI dependencies were unavailable in the default interpreter, and no root Pipenv environment existed. Default request-validation exposure remains a static finding, not a runtime-verified result.
- No scope-based overly broad catch was confirmed. Uncaught exceptions that already terminate a script nonzero were not incorrectly classified as successful exits.

### Follow-ups
- Implement the audit recommendations as narrowly scoped error-handling changes, prioritizing sensitive output, account consistency, and frontend crash recovery.
- Add focused failure-path tests for response redaction, persistence failures, malformed responses and CSV input, and script exit codes.


## 10/12/26
### Milestone 5.2: Backoffice Inventory Interface Implementation
- **Environment & Configuration:**
  - Added `NEXT_PUBLIC_INVENTORY_API_URL=http://localhost:8000` to `.env.local`.
  - Configured Next.js rewrites in `next.config.ts` mapping `/backoffice/inventory/:path*` to `/inventory/:path*`.
- **Domain Types & Centralized API Client (`lib/inventory.ts`):**
  - Added Brasaland ingredient and order types in `lib/types.ts` along with location mappings (1–14 across Colombia and Florida) in `lib/locations.ts`.
  - Implemented `lib/inventory.ts` centralizing all calls to `/inventory` endpoints (`/inventory/products`, `/inventory/orders/inbound`, `/inventory/orders/outbound`, `/inventory/orders`).
  - Added bearer token injection from auth storage; auto-clears token and redirects to `/login` on HTTP 401.
  - Implemented `InventoryApiError` extracting human-readable messages from 4xx/5xx responses, including field-level validation and business rule failures (e.g. insufficient stock).
- **Products Page (`/inventory/products`):**
  - Displays all products/ingredients with their computed `current_stock`, SKU, category, unit, and market/country (CO/US).
  - Applied color-coded stock indicators based on documented operational thresholds: Out of Stock ($\le 0$, critical red), Low Stock ($> 0$ and $\le 15$, amber warning), and Healthy ($> 15$, emerald).
  - Added quick links on every row to register inbound deliveries or outbound exits with the ingredient preselected.
  - Included country/market, category, and real-time search filters.
- **Inbound Order Form (`/inventory/orders/inbound`):**
  - Form submitting supplier deliveries to `POST /inventory/orders/inbound`.
  - Ingredient selector listing ingredients by name/SKU/market rather than raw IDs.
  - Clears form and displays confirmation summary upon success; surfaces visible API error alerts on 400/500 failures.
- **Outbound Order Form (`/inventory/orders/outbound`):**
  - Form submitting kitchen consumption and waste exits to `POST /inventory/orders/outbound`.
  - Reactively fetches and displays available stock when an ingredient is selected before quantity entry.
  - Client-side UX guard warns the user if requested quantity exceeds available stock.
  - Displays HTTP 400 insufficient stock error messages inline directly near the quantity field.
- **Orders History Page (`/inventory/orders`):**
  - Read-only table displaying all deliveries and exits from `GET /inventory/orders`.
  - Displays product name, SKU, quantity, type-specific detail (supplier name or exit reason), location, timestamp, and `user_uuid`.
  - Visual distinction between inbound deliveries (emerald badges) and outbound exits (amber badges) with filtering by type, country, location, and text search.
- **Route Protection & Navigation:**
  - All four inventory routes protected by `AuthGuard` redirecting unauthenticated staff to `/login`.
  - Added `InventoryNav` subnavigation bar and integrated links into the backoffice header and dashboard.
- **Verification:**
  - Automated tests in `__tests__/inventory.test.ts` pass (`npm test`: 18 tests passing across 3 test suites).
  - Next.js production build (`npm run build`) succeeded with 0 errors and prerendered all inventory routes.
  - Backend FastAPI inventory endpoints verified live with authenticated tokens.


  ## 10/19/26
  ### Milestone 5.3: Monorepo Containerization
  - Added root Docker Compose services for the public Vite website (port 3000), Next.js backoffice (port 3001), and FastAPI (port 8000), connected on the named `brasaland-platform` network.
  - Added UI and backend Dockerfiles, Docker ignore files, and startup scripts. The UI image installs the website and backoffice dependencies separately; development mounts source code and keeps dependencies/build output in named volumes. FastAPI runs Uvicorn with `--reload`.
  - Added root `.env.example` defaults and expanded `.gitignore` for root and nested environment files. Development signing keys are generated into persistent backend data when none is configured; secrets are not committed.
  - Routed browser API calls through `/backend`, with the frontend proxies targeting the Docker service name `backend:8000`. Kept the website on 3000 and the backoffice on 3001.
  - Added a local-development SQLite option with foreign-key enforcement; PostgreSQL configuration remains supported, and SQLite is rejected outside development.
  - Added a pinned backend requirements lock and prepared a production Compose override plus a multi-stage UI image that serves the website with Caddy and runs the backoffice with Next.js.

  ### Verification
  - `docker compose config --quiet`, startup shell syntax checks, and Docker image builds passed.
  - `docker compose up -d --wait` started both services and reported the UI and backend healthy. Vite and Next.js logged ready on ports 3000 and 3001; the API health check passed.
  - A focused SQLite check verified schema initialization, foreign-key enforcement, and PostgreSQL URL normalization. Backend inventory tests passed: 38 passed, 2 skipped.
  - Verified `.env` and `.env.production` are ignored by Git.

  ### Blockers and Follow-ups
  - Docker DNS resolved `backend` inside the UI container, but TCP connections to `backend:8000` timed out. Requests to `/backend` through both frontend proxies returned HTTP 500. Investigate Docker bridge/firewall connectivity, then rerun API proxy smoke tests through both UIs.
  - SSH to the provided VPS (`root@143.244.156.224`) was denied (`Permission denied (publickey,password)`). Production deployment was not completed; configure authorized SSH access and provision production environment variables on the VPS before deploying.
  - Production Compose configuration and image are prepared but were not validated or deployed. Validate the production build and environment on the VPS after resolving SSH access; do not place production credentials in Git.

## 10/20/26
### Session: UI and API Connectivity
- **Problems encountered:**
  - Backoffice login requests appeared on port 3001 because the browser called the same-origin `/backend` route. The Next.js proxy returned HTTP 500 because the UI container could resolve `backend` but timed out connecting to `backend:8000`.
  - Temporarily routing the browser directly to `http://localhost:8000` caused `ERR_CONNECTION_REFUSED`: in the browser, `localhost` refers to the client machine, not the Docker host running the API.
  - The public website on port 3000 showed a Codespaces 404. Local Vite checks later returned HTTP 200, and the exact forwarded URL also returned HTTP 200 with the website HTML; this appeared to be transient port-forwarding/startup behavior, with no frontend code change needed.
- **Changes made:**
  - Restored same-origin browser API requests through `/backend` so clients do not need to connect directly to port 8000.
  - Made the Next.js rewrite destination configurable with `API_INTERNAL_URL`. Development Compose sets it to `http://host.docker.internal:8000` and maps `host.docker.internal` to the Docker host gateway; production explicitly uses `http://backend:8000`.
  - Updated the backoffice README to document the browser route and internal proxy destination settings.
- **Verification:**
  - Confirmed the UI container can fetch the API through `host.docker.internal:8000` with HTTP 200.
  - Confirmed `/backend/openapi.json` through port 3001 returns HTTP 200. A credential-free empty POST to `/backend/auth/login` returned HTTP 422 from FastAPI validation, confirming the login route is reachable.
  - Backoffice Jest tests passed (18 tests), TypeScript check passed, and development and production Compose configurations resolved to their intended API destinations.
  - Confirmed port 3000 and its supplied Codespaces URL serve the Vite website with HTTP 200.

## 10/28/26
### Backend Serialization Audit
- Audited all 34 FastAPI operations and documented original classifications, final response fields, consumer needs, and relationship decisions in `docs/serialization-audit.md`.
- Added explicit response contracts, strict write schemas, slimmer list payloads, and matching frontend types. Removed email from registration responses and prevented validation errors from echoing credentials. Inventory history now uses two database queries instead of three.
- Verification: 106 backend tests passed, with 2 PostgreSQL-only tests skipped; TypeScript passed; all 18 frontend tests passed. Five endpoints were exercised through Swagger UI using browser automation and checked for exact response fields.
- Remaining verification: a human manual Swagger pass and PostgreSQL-specific tests against a disposable test database.

