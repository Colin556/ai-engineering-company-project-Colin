# Caching Performance Report

Date: 2026-10-28. Scope: FastAPI repeated reads and the backoffice supplier
workflow. Changes follow measurements, not a blanket cache policy.

## Evidence Summary

| Signal | Conditions | Before | After | Evidence |
| --- | --- | --- | --- | --- |
| Incident summary median | 20,000 incidents; identical GET burst | 81.829 ms | 1.569 ms | [Before](Audit/Caching/before.json), [after](Audit/Caching/after.json) |
| Supplier directory median | 1,203 suppliers; unfiltered GET burst | 48.315 ms | 10.383 ms | Same API artifacts |
| Filtered supplier median | country=CO, category=meat | 48.455 ms | 2.622 ms | Same API artifacts |
| Supplier draft React render median | 1,203 rows; desktop, 4x CPU, five edits | 969.2 ms | 5.1 ms | [Before](Audit/Caching/frontend-before.json), [after](Audit/Caching/frontend-after.json) |
| Unchanged supplier rows rendered per edit | Same loaded view | 1,203 | 0 | Same React commit artifacts |
| Production field performance | No production telemetry/CrUX supplied | Unavailable | Pending | Local measurements are not field results |

All 16 small/large endpoint response hashes match between the final API runs.
The API schema and payload content are unchanged by caching.

## Method And Dataset

### Instrumentation

[Timing middleware](services/api/main.py) records method, route template, status,
and elapsed milliseconds using perf_counter. It logs through
`uvicorn.error.timing`, which inherits Uvicorn's configured INFO logging. The new
logger never records bodies, headers, query values, or concrete resource IDs;
unmatched paths become `<unmatched>`. The `Server-Timing: app;dur=...` header
provides a matching application-duration measurement.

The middleware measures dispatch through response construction, not streaming
body delivery or client network time. API result files separately record elapsed
TestClient request time and median Server-Timing duration. This is not a CPU
profiler or a network-throughput test.

### Realistic Local Data

[profile_caching.py](scripts/profile_caching.py) creates temporary TinyDB and
SQLite databases, overriding database environment variables before importing the
application. It never seeds, truncates, or drops a developer/production database.
The temporary database is deleted on exit; `--serve-port` retains it only while
the profiling process runs.

| Table / resource | Small dataset | Large dataset |
| --- | --- | --- |
| Incidents | 20 | 20,000 |
| Suppliers | 9 | 1,203 |
| Ingredients | 6 | 600 |
| Inbound + outbound orders | 60 | 12,000 |
| Users and their linked profiles | 10 each | 10 each |

Supplier counts include the three built-in seed suppliers. Synthetic data varies
names, categories, countries, prices, statuses, branch/location codes, dates,
quantities, suppliers, and exit reasons. Product foreign keys and creator UUIDs
reference seeded records. Inbound quantities exceed exits, so stock remains
valid. Password hashing remains unchanged; only synthetic local credentials are
used. Branch-origin incidents reference actual restaurant branches.

### Repeatable Requests

Eight read patterns were measured on both datasets. Each pattern has one cold
request followed by 15 identical requests. The final reference runs use the same
code and deterministic dataset, with `RESPONSE_CACHE_ENABLED=0` versus enabled.
Caches are cleared between dataset stages. Each run produces 256 timing lines:
[uncached log](Audit/Caching/before.log), [cached log](Audit/Caching/after.log).

This establishes repeat-query behavior synthetically; it does not establish real
production request frequency. The harness deliberately bursts identical public
filter combinations and reports nearest-rank p95, min/max, payload bytes, and
SHA-256 hashes. With only 15 repeated observations, p95 is the slowest sample and
should not be treated as a stable production tail-latency estimate.

Measurements used the existing local Python environment, FastAPI TestClient,
SQLite/TinyDB, and an Ubuntu dev container. No external network or PostgreSQL
latency is represented. The container was not CPU-isolated; small differences
and isolated tails are noisy. Headline comparisons use repeated medians.

## Ranked Backend Findings

Sorted by large-dataset uncached median; frequency is 16 identical requests per
pattern per dataset, including the cold request. Supplier patterns share one
route but use separate canonical cache keys.

| Read pattern | Small uncached median | Large uncached median | Large cached-run median | Decision |
| --- | --- | --- | --- | --- |
| GET /users | 3.167 ms | 134.570 ms | 131.657 ms | Do not cache account data |
| GET /api/incidents?status=open&category=technical | 5.105 ms | 122.964 ms | 119.952 ms | Defer; large payload and many filter combinations |
| GET /inventory/orders?country=CO&location_id=2 | 4.946 ms | 111.964 ms | 109.705 ms | Defer; mutable history and large responses |
| GET /inventory/products?country=CO | 5.323 ms | 105.860 ms | 112.474 ms | Do not cache computed stock |
| GET /api/incidents/summary | 2.126 ms | 81.829 ms | 1.569 ms | Cache compact aggregation |
| GET /suppliers?country=CO&category=meat | 2.348 ms | 48.455 ms | 2.622 ms | Cache canonical filtered projection |
| GET /suppliers | 1.959 ms | 48.315 ms | 10.383 ms | Cache bounded directory projection |
| GET /api/incidents/options | 1.835 ms | 1.550 ms | 1.528 ms | Too cheap; leave uncached |

Uncached routes remain uncached in the second run. Their changes are not
attributed to the implementation. In particular, inventory products did not
improve. Tiny datasets offer little consistent cache benefit: unfiltered
suppliers changed from 1.959 to 2.007 ms, within local noise/overhead.

TinyDB stores these resources in one JSON file: scanning a small table can still
read/decode the much larger document containing incidents. This explains why
account and supplier reads grow with the incident dataset. Caching selected
public projections avoids repeated reads; it does not repair this storage
architecture or justify caching authorization-sensitive records.

## Implemented Cache Policy

[response_cache.py](services/api/response_cache.py) implements a bounded
worker-local TTL cache using the standard library, with no new dependencies.
Only validated public response projections are stored, never ORM objects,
credentials, access/reset tokens, or request/response transport objects.

| Cached value | Key | Fixed TTL | Capacity | Invalidation |
| --- | --- | --- | --- | --- |
| Incident summary | Constant summary key | 15 seconds | 1 entry, 16 KiB encoded payload | Incident creation and both status-update routes |
| Supplier list projection | Validated (country, category) enum tuple, including None | 30 seconds | 24 LRU entries, 1 MiB total encoded payload | Supplier create, rate/status patch, delete, and seed insertion |

The supplier key has 21 possible combinations today: three country choices
including no filter, multiplied by seven category choices including no filter.
Query-string order and unrelated parameters do not create extra entries. Invalid
enum values are rejected before reaching the cache. No authenticated/private
route uses a shared key.

### Freshness Versus Speed

- Summary counts tolerate up to 15 seconds of cross-worker/external-write lag.
  Same-worker API writes invalidate immediately, preserving interactive updates.
- Supplier directory data is an operational browse/edit view, not a payment or
  stock ledger. Up to 30 seconds of external/cross-worker lag is accepted here;
  same-worker API edits immediately invalidate every filter projection. If rate
  data becomes transactional pricing, do not use this browse cache as authority.
- TTL starts after a load completes and is not extended by hits. Expired values
  are removed before lookup; no stale-on-error behavior is implemented.
- Stock checks, inventory writes, authentication, user/profile reads, password
  flows, and analysis uploads/exports remain uncached. Authorization is still
  evaluated for every protected request.

### Computation Versus Storage

The summary scans 20,000 incidents but returns 567 bytes. Its measured median
fell 98.1%; this is the clearest cost/storage win. The supplier list stores about
155 KiB in the measured unfiltered case; the filtered case returns about 17 KiB.
Warm medians improved 78.5% and 94.6%, respectively, while retaining normal
response-model filtering and serialization.

Encoded-byte budgets approximate payload storage, not total Python RSS:
Pydantic objects, keys, and defensive copies add overhead. Entry counts are also
bounded. Oversized values are returned normally but not retained. LRU eviction
limits accumulated filter variants; expiry is independent of eviction. Returning
defensive copies prevents a caller from corrupting subsequent responses.

Cold misses are not free: unfiltered suppliers measured 51.476 ms uncached versus
77.875 ms for the cached implementation's first request, including size
calculation and copying. The benefit depends on repeated reads between writes
and expirations; write-heavy or unique-query traffic may not benefit.

### Concurrency And Deployment

Cold loads, insertions, and invalidations share the existing reentrant database
lock. Concurrent requests for a cold key share one load, and a writer cannot
invalidate a key only for an older in-flight load to repopulate it afterward.
Exceptions are never cached. The lock also serializes cold cache work with other
TinyDB access; it is a deliberate single-worker tradeoff, not a scaling solution.

Each worker has its own cache and budget. A write in worker A does not invalidate
worker B; TTL bounds the remaining lag. Out-of-band seed jobs likewise rely on
TTL in already running workers. No distributed invalidation is claimed. Move to
Redis/shared versioned invalidation when cross-worker immediate consistency is
required, after addressing TinyDB's own multi-process storage limitations.

Set `RESPONSE_CACHE_ENABLED=0` before startup for rollback or reference profiling.
The flag disables cache reads and fills; write-side invalidation remains safe.
No browser/CDN caching policy was added, so server invalidation is not undermined
by a newly introduced downstream stale response.

## Frontend Decision

The [supplier page](uis/backoffice/app/%28protected%29/suppliers/page.tsx) kept
registration draft state alongside the entire directory. The
[browser probe](scripts/profile_frontend_caching.cjs) installs a React DevTools
commit hook before React loads and records actualDuration plus SupplierRow
render starts during five distinct name edits. It fails if profiling data is
missing. This measures real React commits, not a standalone timing of a copied
array operation.

Conditions: authenticated `/suppliers`, Chromium 156.0.8078.4, development React,
1440x1000 viewport, CDP 4x CPU throttling, unthrottled loopback network, table
already loaded, 1,203 rows. Cold navigation/compilation is deliberately excluded.

Every baseline edit rendered all 1,203 unchanged rows. Registration state now
lives in `SupplierRegistrationForm`; typing only updates that component.
Median render duration fell from 969.2 to 5.1 ms, and row renders fell to zero.
The broader Playwright edit-plus-two-animation-frames median fell from 1,761.1
to 278.0 ms; that includes automation, scheduling, and paint waits and **is not
INP**. Both runs made zero API requests during draft editing.

### Why Not useMemo Or Lazy Loading?

No expensive stable derived value was identified in this measured interaction;
the cost was rendering unaffected rows because state ownership was too broad.
State isolation removes that work without dependency arrays, callback memoization,
or a redundant client data cache. No useMemo was added speculatively.

The measured form is lightweight and immediately available; no expensive optional
chart, modal, or library was identified on this path. Lazy loading would not fix
the measured re-render cause and would defer a currently visible form. No new
lazy boundary was added. This report does not claim cold-bundle/LCP improvements;
profile a genuine optional heavy feature before applying lazy loading there.

## Verification

- Backend: **113 passed, 2 skipped**. PostgreSQL-only concurrency/constraint checks
  remain skipped without a disposable INVENTORY_TEST_DATABASE_URL.
- Frontend: TypeScript passed; **3 Jest suites, 18 tests passed**.
- Cache tests cover fixed TTL expiry, defensive copies, disabled operation,
  capacity/oversize behavior, exceptions, shared cold loads, invalidation ordering,
  canonical filter keys, and all affected API mutation paths.
- Every small/large endpoint response SHA-256 matches between the final API
  reference runs. API contracts and sensitive-field filtering remain intact.
- Browser checks confirmed supplier creation adds the matching row and clears
  the draft; inline rate saving and status toggling still work. The optimized
  profiling probe asserts zero unchanged supplier-row renders.
- Editor diagnostics found no errors in the changed implementation files.

## Reproduce

From the repository root, using the existing backend environment:

```bash
RESPONSE_CACHE_ENABLED=0 services/api/.venv/bin/python scripts/profile_caching.py --requests 15 --output /tmp/cache-before.json
services/api/.venv/bin/python scripts/profile_caching.py --requests 15 --output /tmp/cache-after.json
services/api/.venv/bin/python -m pytest services/api/tests -q
```

For browser profiling, keep the generated large dataset running:

```bash
services/api/.venv/bin/python scripts/profile_caching.py --requests 3 --output /tmp/cache-browser.json --serve-port 8001
```

In another terminal, start the UI against that disposable API without editing
local environment files:

```bash
cd uis/backoffice
API_INTERNAL_URL=http://127.0.0.1:8001 NEXT_PUBLIC_API_BASE_URL=/backend NEXT_PUBLIC_INVENTORY_API_URL=/backend npm run dev -- --hostname 0.0.0.0 --port 3001
```

The browser probe requires Playwright plus its Chromium runtime/libraries. During
this session those were installed/extracted under `/tmp/serialization-browser`
without modifying system packages or project dependencies. From the repo root:

```bash
EXPECT_ISOLATED_FORM=1 PLAYWRIGHT_MODULE=/tmp/serialization-browser/node_modules/playwright LD_LIBRARY_PATH=/tmp/serialization-browser/libs/usr/lib/x86_64-linux-gnu node scripts/profile_frontend_caching.cjs /tmp/frontend-cache-after.json
```

Use the development/profiling build: a normal production build may omit React
duration fields. Synthetic login is `profile-0@example.com` / `LocalProfile123!`
only on the disposable API. Use `http://localhost:3001`, not 127.0.0.1, to avoid
Next.js development-origin asset restrictions. Change ports if already occupied.

## Remaining Work

Production telemetry is required to validate real query repetition, hit ratios,
write frequency, memory use, and latency under concurrency. The timings above do
not establish throughput or a production service-level objective. At a hypothetical
200 unchanged summary reads/minute per worker, a 15-second TTL allows roughly
four cold fills plus hits, rather than 200 scans; writes and eviction reduce this
benefit. This is a workload estimate, not observed production traffic.

Pagination and database-level query improvements remain higher priorities for
the large incident/history responses. Account latency needs storage isolation or
a relational migration, not caching credentials or authorization state. A
production-mode frontend profile and real-user responsiveness measurements remain
necessary before making user-experience guarantees from development timings.