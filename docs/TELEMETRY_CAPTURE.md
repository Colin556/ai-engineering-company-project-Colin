# Brasaland Frontend Telemetry Capture

## Contract

The project owner approved [TELEMETRY_PLAN.md](TELEMETRY_PLAN.md). The unchanged
[event-schemas.json](event-schemas.json) is the single authoritative registry.
The six mandatory briefing event names, canonical `product_id`/`product_category`
properties, and local `COP`/`USD` dimensions are preserved. `meat`, `produce`, and
`litre` are the approved schema codes, rather than the briefing's prose synonyms.
There is no duplicate registry under a new documentation directory.

## Configuration

Add these non-secret values to the backoffice's local environment file:

```dotenv
NEXT_PUBLIC_TELEMETRY_ENDPOINT=http://localhost:8000/telemetry/events
NEXT_PUBLIC_RELEASE_ID=development
```

The editor excludes the existing local environment file; it was not modified.
A tracked [frontend example](../uis/backoffice/.env.example) contains the public
configuration. Restart the dev server or rebuild after changing public values.
An unset telemetry endpoint disables capture without affecting the application.

Configure `TELEMETRY_ENDPOINT=http://localhost:8000/telemetry/events` in the backend.
The stub reads it at startup; it does not redirect or persist events. Also set
`TELEMETRY_HMAC_KEY` to an independent, secret random key in the backend only.
Generate it locally with `openssl rand -hex 32`; never put it in a `NEXT_PUBLIC_*`
variable. Without this key, tokens have no telemetry pseudonym and capture uses
null actor/session fields. Existing tokens must be replaced by signing in again.
Restrict access and agree key rotation/retention before production use.

Docker builds include the registry from the repository root. Compose supplies
`NEXT_PUBLIC_TELEMETRY_ENDPOINT` as both a build argument and a development value;
its same-origin default is `/backend/telemetry/events`. The existing proxy forwards
this to the receiver. Use HTTPS/same-origin routing in deployed environments.

## Receiver and Transport

`POST /telemetry/events` accepts `{ "events": [...] }`, validates the standard
envelope and each event against the registry, logs only the count and event types,
and responds `200 { "received": N }`. Invalid batches return 422 without echoing
rejected values. The router has no database dependency or persistence operation.
The maximum accepted batch is 1,000 events.

The only public capture API is:

```ts
track(eventType: string, properties: Record<string, unknown>): void
```

The service adds UUID event/correlation IDs, capture-time UTC timestamps, version
1, and a tab-local session UUID associated with the authenticated token's HMAC
pseudonym. A fresh login rotates the session; refreshes retain it. Submitted login
identifiers, credentials, raw auth subjects, names, notes, and error messages are
never collected. Authentication hooks normalize network failures to the approved
`provider_unavailable` code, not an unapproved `network_error` enum. Expiry uses
the separate `auth_session_expired` event.

Events are copied into a bounded in-memory queue. Delivery drains chunks of up to
20 events on a ten-second interval or the size trigger. Each batch gets one initial
attempt and at most three retries after 1, 2, and 4 seconds. HTTP requests have a
five-second timeout. Non-retryable 4xx responses discard the batch; 429, 5xx, and
network failures retry. Queue capacity is 1,000; overflow drops the oldest queued
event. Telemetry failure never changes an application's successful outcome.

Hidden-tab `visibilitychange` and `pagehide` flush pending and in-flight events
with `sendBeacon`. Bodies remain JSON, but use `text/plain;charset=UTF-8` to avoid
a cross-origin unload preflight. The receiver validates these bodies identically.
Beacon chunks stay below 48 KB. If the browser refuses a beacon, events remain
queued for normal delivery. A beacon may duplicate an in-flight request, retaining
the same event IDs; Phase 3 must deduplicate by `eventId`. No unload technique
guarantees delivery after an OS/process crash or extended offline period.

## Coverage

| Approved event | Capture point |
| --- | --- |
| `inbound_order_created` | Successful committed inbound response, with supplier ID and costs |
| `outbound_order_created` | Successful committed consumption response |
| `stock_waste_registered` | Successful committed classified waste response, with approved cost |
| `stock_threshold_triggered` | Committed exit crossing its configured location minimum |
| `direct_stock_edit_rejected` | Actual numeric paste into the order-controlled stock field, rejected by the API |
| `ingredient_price_variance_detected` | Committed inbound price differing beyond configured history threshold |
| `auth_login_succeeded` | Central login helper after token installation |
| `auth_login_failed` | Central login helper, normalized reason only |
| `auth_session_expired` | Shared 401 handling and protected-layout expiry timer |
| `navigation_section_viewed` | Root observer covering all seven allowlisted sections |
| `navigation_flow_abandoned` | Edited inbound/outbound form left before successful completion |
| `api_request_completed` | Shared request wrappers, server timing, 5% deterministic success sampling and all slow responses |
| `api_request_failed` | Shared request wrappers, all HTTP failures with server timing |
| `frontend_error_captured` | Early uncaught error/rejection listeners and normalized API network failures |
| `web_vital_recorded` | Next.js `useReportWebVitals`: LCP, INP, CLS, FCP, TTFB, route and device class |
| `inventory_validation_failed` | Form and central API rejection paths, field/rule codes only |
| `supplier_record_updated` | Successful rate/status changes, ID and changed field names only |
| `inventory_product_created` | Deferred: API exists, but there is no backoffice product-creation workflow |
| `incident_record_created` | Deferred: current incident source has no approved severity or stable location dimensions |
| `background_job_failed` | Deferred: no browser-owned internal-job execution source |

The broader plan's unregistered opportunities are a backlog, not permission to
introduce new event names. Unknown names and properties are rejected at capture.
Same-section views are deduplicated for 30 seconds; repeated identical validation
failures are suppressed for five minutes. Validation suppression is not a persisted
aggregate count; aggregate schema support remains future work.

## Inventory Source Deployment

Before deploying to existing PostgreSQL tables, apply
[001_telemetry_sources.sql](../services/api/migrations/001_telemetry_sources.sql)
with the normal database migration process. It adds nullable supplier/cost/cause
columns and per-location settings; it does not backfill or change order quantities.
Fresh development databases are initialized by SQLModel. Existing SQLite databases
need equivalent column additions or a fresh disposable database.

The inbound UI selects an active supplier in the ingredient's country and collects
unit cost in the location currency. Waste requires one of `expired`, `kitchen_error`,
or `theft_suspected`, plus an operator-entered approved cost basis. The receiver
does not infer cost from today's supplier rate or from inventory quantities.

Managers/admins configure controls in the inventory product's Controls dialog.
The server enforces that permission. Settings store the minimum quantity, price
variance percentage, history days, and minimum purchase count. Defaults when saved
are 10%, 30 days, and three prior purchases. No minimum is invented for unconfigured
locations. History compares the same product/supplier/unit/currency, averages prior
non-null costs within the configured window, and ignores a zero reference. Both
positive and negative changes exceeding the absolute threshold are captured.

Global stock display remains available for compatibility. Captured consumption
and classified waste enforce location stock. Legacy waste without cost/cause remains
readable and accepts the older global invariant, but emits no incomplete waste event.
Legacy inbound calls lacking both supplier ID and unit cost emit no incomplete inbound
event. This compatibility path is not end-to-end mandatory coverage for external clients.

The rejecting `/inventory/products/{id}/stock` route cannot mutate stock. Its
`quantity` is the attempted absolute target. Direct calls bypassing the instrumented
backoffice are not captured by this frontend-only system. Durable capture for API-only
producers and orders committed before browser/network failure requires Phase 3's outbox.

## Verification

Focused queue, client-boundary, and receiver tests cover schema allowlists, batching,
retry IDs/timestamps, beacon fallback, privacy, correlation, and confirmed outcomes.
Inventory tests validate all six mandatory drafts against the actual registry.
The production backoffice build verifies early instrumentation and schema bundling.

The [browser verifier](../scripts/verify_frontend_telemetry.cjs) runs only with
`TELEMETRY_VERIFY_ISOLATED=1` against the disposable servers on localhost ports
8000 and 3001. It requires Playwright/Chromium and their Linux dependencies, and a
manager fixture `capture-verification@example.com` / `VerificationPass42!` in that
isolated database. Never create this fixture in a real deployment.

```sh
TELEMETRY_VERIFY_ISOLATED=1 NODE_PATH=/tmp/brasaland-telemetry-browser/node_modules \
  node scripts/verify_frontend_telemetry.cjs
```

The verifier checks browser requests against the registry, receiver HTTP 200/counts,
mandatory events from real forms, normalized uncaught failures, route coverage,
Web Vitals, hidden-tab beacon delivery, stock immutability, and desktop/mobile
screenshots. Chromium can omit Blob beacon bodies from DevTools; the verifier also
records these bodies at the browser's beacon boundary without changing production code.

No commit, pull request, or merge is performed automatically. Merge only after the
feature PR is actually approved; telemetry plan approval is not PR approval.

### Verified Results

- Backend: 125 passing tests; two isolated PostgreSQL integration tests skipped
  because `INVENTORY_TEST_DATABASE_URL` was not configured.
- Frontend: 30 passing tests; Next.js production build succeeds.
- Chromium: 51 validated events in seven observed batches; seven HTTP 200
  receiver responses and five live-document `received` count checks.
- Browser-observed events include all six mandatory types, successful/failed login,
  navigation, API success/failure, uncaught errors, and Web Vitals.
- Hidden-tab beacon POST and unchanged stock after the rejected edit were verified.
- Screenshots inspected at desktop 1365x900 and mobile 390x844; the new controls
  dialog stays within the mobile viewport. Screenshots are temporary verification
  artifacts at `/tmp/telemetry-desktop.png` and `/tmp/telemetry-mobile.png`.
- Compose configuration validates. Actual container image builds and the existing
  production database migration were not run.