# Pipeline Design — Weekly Location Cost & Waste Report

> Status: **DRAFT for approval** (Data Pipelines milestone, Part 1 of 3). Design only — no orchestration, migration, or application code has been written.
> Sources of truth: [Context Files/CONTEXT_DataPipelines.md](../Context%20Files/CONTEXT_DataPipelines.md) (business deliverable, KPIs, destination table), [Context Files/Brasaland_BRIEFING.md](../Context%20Files/Brasaland_BRIEFING.md) (mandatory telemetry metrics), [docs/event-schemas.json](event-schemas.json) (event contract).

---

## 0. Draft answers (written before the design)

These answers drive every decision in sections 1–5. Each one is grounded in how the Brasaland monorepo works today.

**How Brasaland inventory events reach `telemetry_events` today:** `POST /inventory/orders/inbound` and `POST /inventory/orders/outbound` build event *drafts* on the server. The drafts are returned in the response body (`telemetry_events`). The backoffice browser then emits them with `track()` ([uis/backoffice/lib/services/telemetry.ts](../uis/backoffice/lib/services/telemetry.ts)). The browser batches them to `POST /telemetry/events`, which stores each one as a row in `telemetry_events`. So every business event passes through a browser tab before it is stored. Several answers below follow from that.

### Idempotency

**Duplicates at the source.** There are two layers, each with its own key:

1. **Transport duplicates** (the same event delivered twice by a retry or by beacon + fetch). The key is the envelope field `eventId`, stored as `telemetry_events.event_id`, which is `UNIQUE`. The browser reuses the same `eventId` across retries, so the database rejects the second copy. *Known defect (fix proposed in §6):* the receiver uses `add_all` + `commit`. A duplicate `event_id` therefore raises an integrity error, and the whole batch returns HTTP 500 instead of "already stored".
2. **Business duplicates** (the same order emitted under two different `eventId`s, e.g. the drafts are replayed after a page reload). These are handled in the pipeline's **transform** layer with a natural key. Earlier layers can't see business identity.
   - `inbound_order_created`, `stock_waste_registered`: `(event_type, tags.order_id)`. `order_id` is the `ingrediententry.id` / `ingredientexit.id` the server attaches to the draft.
   - `stock_threshold_triggered`, `ingredient_price_variance_detected`: these carry no `order_id`. The key is `(event_type, request_id, tags.location_id, tags.product_id)`. One order request emits at most one of each per product and location. If `request_id` is not a UUID (fallback `"uncorrelated"`), fall back to `event_id`.
   - Keep the row with the latest `ingestion_timestamp`, breaking ties by `event_id`. Record the number dropped as `duplicates_dropped` in the run log.

**Re-run after failure.** The load stage is a **single PostgreSQL transaction**. It contains:
- the upsert of every location-week row,
- the revision rows,
- the watermark advance,
- the `pipeline_runs` status change.

If the process dies mid-load, PostgreSQL rolls the whole transaction back, so no partial state is visible. The re-run starts from the same, un-advanced watermark. It **recomputes whole ISO weeks** from the immutable source, so the inputs are a superset of the failed run's and the output is deterministic. `INSERT … ON CONFLICT (location_id, week_start) DO UPDATE` on the briefing's `unique (location_id, week_start)` guarantees one row per key even if the load is later split into batches. The outcome is identical to a clean run.

**Late events.** The pipeline never applies increments (`total += late_event`). Instead it recomputes **every week touched by newly ingested events**:

1. Find the weeks whose `timestamp` falls in the window of events ingested since the last committed watermark (`ingestion_timestamp`), with a lookback overlap.
2. Recompute those weeks from scratch, then upsert.

If a published value changes:
- the old and new values are written to `reporting.weekly_location_performance_revisions`, together with the `run_id`,
- the row's `revision` counter is incremented.

Numbers can't inflate, because recomputation is a pure function of the source. The audit trail is kept, because every change records who changed it (which run), when, and from what to what.

### Observability

**Silence vs. true absence.** Four separate signals:
- **Every run writes a row to `reporting.pipeline_runs`, even when nothing changed.** A missing run is visible as a gap in `started_at`. `GET /reporting/pipeline-runs/latest` exposes the age of the last completed run.
- **Every computed week gets dense rows for all 14 locations, with explicit zeros, plus `source_event_count`.** *No row* means "never computed". *Row with zeros and `source_event_count = 0`* means "computed, nothing captured".
- **Reconciliation against the system of record (`ingrediententry`, `ingredientexit`).** Domain rows present but zero events means a **capture failure**. Zero domain rows and zero events means **true zero activity**.
- **App liveness context.** Technical events from the same week (e.g. `navigation_section_viewed`, `api_request_completed`) show whether anyone used the backoffice at all.

**Collection traceability.** The chain is:

```
event_id → telemetry_events (ingestion_timestamp, request_id, tags.order_id)
  → pipeline_runs (run_id, watermark_from/to, weeks_recomputed)
  → weekly_location_performance (last_run_id, source_event_count, revision)
  → weekly_location_performance_revisions
```

- `request_id` links to the API's `X-Request-ID` timing logs.
- `order_id` links to the domain order row.

Anomalies to detect:
- **Gaps:** no inventory events for a location during its business hours on a day with domain orders.
- **Bursts:** many events sharing one `ingestion_timestamp` second but with spread `timestamp`s, i.e. a delayed flush.
- **Interval drift:** p95 of `ingestion_timestamp − timestamp` trending up. Also count events whose client `timestamp` is ahead of server ingestion (clock skew).

**Growth vs. data loss.** Volume alone can't tell these apart. Use ratios:
- `events / domain rows` per location-week should be ≈ 1.0. Below 1 means loss; above 1 before dedup means duplication.
- `duplicates_dropped` and receiver-rejected counts per run.
- `total_cost` from events vs. `Σ quantity × unit_cost` from domain rows.

Growth means domain rows and events rise together with coverage stable. Loss means coverage falls. These go into `pipeline_runs.quality_checks`. Coverage below the threshold sets status `completed_with_warnings`, which the KPI endpoint surfaces.

### Recoverability

**Database outage.**
- The checkpoint is the **committed watermark** (`reporting.pipeline_state.last_ingested_at`), advanced only inside the load transaction.
- Each run also persists its own fixed `watermark_to` (captured at run start) in `pipeline_runs` *before* extracting, so a retry reads exactly the same bounded input.
- Transient connection errors use Prefect task retries (3 attempts, exponential backoff). Extract results are cached by Prefect, keyed by `(watermark_from, watermark_to, weeks)`, so a failed load does not re-query the source.
- If retries run out, the run is marked `failed` and the watermark is untouched. The next run resumes from the last committed watermark. The data volume (14 locations × a few weeks) is small, so recomputing is cheaper and safer than stage-level partial checkpoints.

**Frontend buffer.**
- Today the browser keeps an **in-memory** queue only (max 1000 events, 10 s / 20-event flush, `sendBeacon` on hide). Closing or crashing the tab before a flush loses the events.
- Persisting that buffer offline (IndexedDB) does **not** make sense for business events. Risks:
  - duplicate replay across tabs and devices,
  - stale `schemaVersion` replayed after deploys,
  - pseudonymous identity at rest on shared kitchen devices,
  - unbounded lateness, which forces published weeks to be revised,
  - client clock skew.
- The layer that owns business events should be the **backend**: a transactional outbox written in the same transaction as `ingrediententry` / `ingredientexit` (§6, needs approval). The browser buffer stays best-effort for technical/UX events. Until the outbox exists, the reconciliation check measures how much is lost.

**Transmission retry.**
- Retries must resend the **same `eventId`**; the client already does this.
- The server must make storage idempotent: `INSERT … ON CONFLICT (event_id) DO NOTHING`, returning `200` with `{received, stored, duplicates, rejected}`.

Response contract:

| Response | Meaning | Client action |
|---|---|---|
| `200` with `duplicates > 0` | Already stored | Success, do not retry |
| `200` | Stored (partial rejects are per-event and final) | Done |
| `422` | Payload invalid | Do not retry |
| `429`, `5xx`, network/timeout | Not stored | Retry with backoff, same `eventId`s |

This matches the client's current retry rules. Only the server's duplicate handling must change.

### Cross-cutting

**Concurrent runs (cron + manual trigger).** Three guards, from outermost to innermost:

1. **Prefect deployment concurrency limit = 1**, so a second flow run waits in `Scheduled`/`AwaitingConcurrencySlot`.
2. **`POST /reporting/pipeline-runs` checks `pipeline_runs` for a `running` row** and returns `409` with the active `run_id` instead of queuing a duplicate.
3. **Database guard:** a partial unique index `on pipeline_runs (pipeline_name) where status = 'running'`, plus `pg_try_advisory_xact_lock(hashtext('weekly_location_performance'))` taken at the start of the load transaction. A run that can't get the lock ends as `skipped_concurrent` and is logged, not failed.

If two runs still overlap (e.g. a stale `running` row after a crash), recompute + upsert from the same immutable source produces the same values. The watermark advances with `GREATEST(current, new)` and never moves backwards. Recovery: a run in `running` longer than its timeout (30 min) is marked `crashed` by the next run's start task.

---

## 1. Current state (Phase 1)

### 1.1 Telemetry captured

The contract is [docs/event-schemas.json](event-schemas.json) (envelope: `eventId`, `timestamp`, `sessionId`, `userId`, `event_type`, `schemaVersion`, `requestId`, `properties`). It covers 17 instrumented events, including all six mandatory Brasaland metrics:

| event_type | Emitted by | Business properties relevant to this pipeline |
|---|---|---|
| `inbound_order_created` | `POST /inventory/orders/inbound` (only when `supplier_id` + `unit_cost` are supplied) | `location_id` (int 1–14), `country`, `currency`, `product_id`, `product_category`, `quantity`, `unit`, `supplier_id`, `unit_cost`, **`total_cost`**, `order_id` |
| `outbound_order_created` | `POST /inventory/orders/outbound`, `reason = consumption` | `location_id`, `country`, `currency`, `quantity`, `order_id` (no cost — context only) |
| `stock_waste_registered` | outbound with `waste_cause` ∈ `expired`, `kitchen_error`, `theft_suspected` | `location_id`, `country`, `currency`, `reason`, `unit_cost`, **`total_cost`**, `order_id` |
| `stock_threshold_triggered` | outbound that crosses a location's `minimum_quantity` | `location_id`, `country`, `product_id`, `quantity` (after), `minimum_quantity` |
| `ingredient_price_variance_detected` | inbound whose `unit_cost` deviates more than `threshold_percent` from history | `location_id`, `country`, `supplier_id`, `unit_cost`, `reference_unit_cost`, `variance_percent` |
| `direct_stock_edit_rejected` | `PATCH /inventory/products/{id}/stock` | not used by this deliverable |

**Schema check (briefing §3):** `inbound_order_created` and `stock_waste_registered` already **require** `unit_cost` and `total_cost`. No telemetry schema extension is needed.

Domain conventions this design reuses:
- `country = "CO"` for `location_id` 1–10 and `"US"` for 11–14.
- `currency` is `COP` / `USD` to match.

### 1.2 Where it is stored

- `public.telemetry_events` on Supabase PostgreSQL ([services/api/migrations/001_create_telemetry_events.sql](../services/api/migrations/001_create_telemetry_events.sql)). The table is append-only, with:
  - `event_id UUID UNIQUE`,
  - `event_type`,
  - `"timestamp" TIMESTAMPTZ` (client occurrence time),
  - `ingestion_timestamp` (server arrival),
  - `request_id`,
  - `schema_version`,
  - `tags JSONB` (the event `properties`).
- Indexes exist on `(event_type, "timestamp")`, `event_id`, `request_id`, and GIN on `tags`.
- The system of record for orders is `ingrediententry` / `ingredientexit` (`location_id`, `quantity`, `unit_cost`, `supplier_id`, `waste_cause`, `created_at`).

### 1.3 What the technical report answers today

`GET /telemetry/report` ([services/api/telemetry/analysis.py](../services/api/telemetry/analysis.py)) is authenticated, uses a ≤ 92-day window, and has a 60 s in-memory cache. It answers engineering questions only:
- `events_per_day`
- `event_type_distribution`
- `error_rate_by_type` (API error codes)
- `api_latency_by_route`
- `auth_failure_rate`

**This path is unchanged by this design.**

### 1.4 The gap

Mariana and Felipe's question from the briefing is: *"Every Monday, how did each of the 14 locations do on purchase cost, waste cost, waste ratio, stockouts, and price alerts — COP and USD side by side?"* The technical report can't answer it because:

- **It never reads `tags`' business fields.** There is no `location_id`, `currency`, or `total_cost` aggregation.
- **Its grain is daily and event-type based, not per location per ISO week.**
- **It is computed on request and kept only in a 60 s in-memory cache.** No published week is persisted, nobody is accountable for a number, and there is no revision history.
- **It has no data-quality guarantees.** There is no business dedup, no late-event handling, and no reconciliation against the order tables. That is acceptable for a health radar, but not for a CEO report.

A dedicated pipeline with its own persisted destination is required.

---

## 2. Pipeline design (Phase 2)

### 2.1 Purpose

> **Produce `reporting.weekly_location_performance`, the persisted per-location, per-ISO-week rollup behind Mariana and Felipe's Monday "Weekly Location Cost & Waste Report".** It computes the five briefing KPIs:
> - Purchase Cost per Location
> - Waste Cost per Location
> - Waste Ratio
> - Stockout Frequency
> - Price Alert Frequency
>
> in each location's own currency, from the mandatory metrics `inbound_order_created`, `stock_waste_registered`, `stock_threshold_triggered` and `ingredient_price_variance_detected`.

`outbound_order_created` is extracted **only** as a volume control for anomaly checks. It never feeds a KPI. `direct_stock_edit_rejected` is out of scope for v1.

### 2.2 Extraction format and freshness

| Source | Access | Format on arrival | Update pattern |
|---|---|---|---|
| `public.telemetry_events` | SQL, read-only role | Rows: `event_id uuid`, `event_type text`, `timestamp timestamptz`, `ingestion_timestamp timestamptz`, `request_id text`, `schema_version int`, `tags jsonb` (decoded to dict; `total_cost`/`unit_cost` are JSON numbers, converted to `Decimal(str(x))`) | Append-only, near-real-time. Browser batches arrive every ≤ 10 s, or on tab hide via beacon. Late arrivals are possible (retries, background tabs). |
| `public.ingrediententry`, `public.ingredientexit` | SQL, read-only role | Rows with `location_id int`, `quantity numeric`, `unit_cost numeric`, `supplier_id`, `waste_cause`, `created_at` | Insert-only via order endpoints. Used **only for reconciliation**, never as a KPI source. |

Extraction queries (parameters are bound, never interpolated):

```sql
-- a) Which ISO weeks need recomputing (late-event discovery)
SELECT DISTINCT date_trunc('week', "timestamp" AT TIME ZONE 'UTC')::date AS week_start
FROM public.telemetry_events
WHERE event_type IN ('inbound_order_created','stock_waste_registered',
                     'stock_threshold_triggered','ingredient_price_variance_detected',
                     'outbound_order_created')
  AND ingestion_timestamp >  :watermark_from - interval '15 minutes'   -- lookback overlap
  AND ingestion_timestamp <= :watermark_to;

-- b) Full source rows for those weeks, frozen at watermark_to for reproducibility
SELECT event_id, event_type, "timestamp", ingestion_timestamp, request_id, schema_version, tags
FROM public.telemetry_events
WHERE event_type IN (...same list...)
  AND "timestamp" >= :min_week_start AND "timestamp" < :max_week_end
  AND ingestion_timestamp <= :watermark_to;
```

`date_trunc('week', …)` returns Monday, which matches the briefing's `week_start`. The scheduled run always includes the **previous ISO week** and the **current ISO week**, even if (a) returns nothing, so silent weeks still get dense zero rows.

### 2.3 Data flow

```
                     ┌────────────────────────────── reporting.pipeline_runs (run log, one row per run)
                     │ start_run: lock, create run row, fix watermark_to, pick weeks
                     ▼
 ┌──────────────────────────┐   ┌───────────────────────────────────┐   ┌────────────────────────────────────┐
 │ 1. EXTRACT (read-only)   │   │ 2. TRANSFORM (pure, in memory)     │   │ 3. LOAD (one PostgreSQL transaction) │
 │                          │   │                                   │   │                                    │
 │ telemetry_events         │──▶│ validate: location_id 1–14,       │──▶│ upsert weekly_location_performance │
 │  5 event types, weeks W, │   │  country/currency match location, │   │  ON CONFLICT (location_id,         │
 │  ingestion ≤ watermark_to│   │  cost present → else reject+count │   │  week_start) DO UPDATE … WHERE     │
 │                          │   │ dedup on natural keys (§0)         │   │  values IS DISTINCT FROM           │
 │ ingrediententry/exit     │   │ bucket: week_start = Monday UTC    │   │ insert revisions for changed rows  │
 │  (reconciliation counts) │   │  of event timestamp               │   │ advance pipeline_state watermark   │
 └──────────────────────────┘   │ aggregate per (location_id, week): │   │ finish run row (status, counts)    │
                                │  Σ total_cost inbound / waste,    │   └────────────────────────────────────┘
                                │  waste_ratio, counts of stockout   │                     │
                                │  and price-alert events            │                     ▼
                                │ densify: 14 locations × W weeks    │   GET /reporting/weekly-location-performance
                                │ quality checks vs domain tables    │   GET /reporting/pipeline-runs/latest
                                └───────────────────────────────────┘   POST /reporting/pipeline-runs
```

Transform rules (all row-level work is vectorised Pandas, as in the technical pipeline):

- **Week bucket** is taken from the occurrence `timestamp`, converted with `pd.to_datetime(utc=True)` before grouping. If the client clock is ahead of the server (`timestamp > ingestion_timestamp + 5 min`), `ingestion_timestamp` is used instead and `clock_skew_clamped` is counted.
- `total_purchase_cost` = Σ `tags.total_cost` of deduped `inbound_order_created`.
- `total_waste_cost` = Σ `tags.total_cost` of deduped `stock_waste_registered`.
- `waste_ratio` = `total_waste_cost / total_purchase_cost`, or `0` when purchases are 0 (briefing rule), rounded to 4 decimals.
- `stockout_events_count` = count of deduped `stock_threshold_triggered`.
- `price_alert_events_count` = count of deduped `ingredient_price_variance_detected`.
- `currency` = `COP` for locations 1–10 and `USD` for 11–14. An event whose `currency`/`country` disagrees with its `location_id` is **rejected and counted**, never converted or mixed (briefing §7).
- Money is summed as `Decimal` and stored as `numeric`. Rounding is a presentation concern only.

### 2.4 Sources that update existing records

Today every source is insert-only. `telemetry_events` is immutable by design, and the order tables have no update endpoints. "Updates" still reach this pipeline in two forms:

1. **Late or duplicate versions of the same fact** (a retry, a replayed draft, or a late flush). Handled by natural-key dedup (`order_id` / `request_id`), keeping the latest by `ingestion_timestamp`, and by recomputing the whole week.
2. **The destination itself is updated.** A published week changes when late events arrive. It is upserted on `unique (location_id, week_start)` with `IS DISTINCT FROM`, so unchanged rows are left alone and `computed_at` / `revision` only move on real changes. The prior values go to the revisions table.

If a mutable source is introduced later (e.g. order corrections that edit `ingrediententry`), the strategy stays the same with three additions:
- add `updated_at` to that table;
- discover affected weeks from `updated_at > watermark`, recomputing **both** the old and new weeks if the date moved;
- dedup by business key, keeping the latest version.

Because a week is always recomputed from the full source, an update can never be double-counted.

### 2.5 Destination tables and endpoints

New `reporting` schema only, never `telemetry_events`. The pipeline's database role has `SELECT` on the three source tables and write access only on `reporting.*`.

```sql
create schema if not exists reporting;

-- Exact name and columns from the briefing; the 3 columns marked (+) are proposed additive
-- audit columns and need approval.
create table reporting.weekly_location_performance (
  id uuid primary key default gen_random_uuid(),
  location_id text not null,                 -- Brasaland canonical id '1'..'14' (see open question 1)
  country text not null,                     -- 'CO' (1–10) | 'US' (11–14)
  week_start date not null,                  -- Monday, UTC
  total_purchase_cost numeric not null default 0,
  total_waste_cost numeric not null default 0,
  waste_ratio numeric not null default 0,
  stockout_events_count integer not null default 0,
  price_alert_events_count integer not null default 0,
  currency text not null,                    -- 'COP' | 'USD', never mixed
  computed_at timestamptz not null default now(),
  source_event_count integer not null default 0,              -- (+) silence vs. absence
  revision integer not null default 1,                        -- (+) late-event audit
  last_run_id uuid references reporting.pipeline_runs(run_id), -- (+) traceability
  unique (location_id, week_start)
);

create table reporting.weekly_location_performance_revisions (
  id bigserial primary key,
  run_id uuid not null references reporting.pipeline_runs(run_id),
  location_id text not null,
  week_start date not null,
  previous jsonb not null,     -- KPI values before the change
  current jsonb not null,      -- KPI values after the change
  changed_at timestamptz not null default now()
);

create table reporting.pipeline_state (            -- single checkpoint per pipeline
  pipeline_name text primary key,
  last_ingested_at timestamptz not null            -- committed watermark
);

-- reporting.pipeline_runs: see §3.2
```

Endpoints live in the new `services/reporting/` module. It is mounted in the same FastAPI app as an `APIRouter(prefix="/reporting")`, following the same in-container layout as the technical pipeline: `services/api/reporting/`. It is fully separate from `services/api/telemetry/` and `GET /telemetry/report`.

- `GET /reporting/weekly-location-performance?week_start=YYYY-MM-DD` — KPI query
- `GET /reporting/pipeline-runs/latest` — run status
- `POST /reporting/pipeline-runs` — manual trigger

---

## 3. Resilience and idempotency (Phase 3)

### 3.1 Idempotency strategy

| Failure point | What is persisted | Re-run behaviour |
|---|---|---|
| Before/while extracting | `pipeline_runs` row (`running`, `watermark_from`, `watermark_to`, `weeks`) | Retry reads the identical bounded input. If the run is abandoned, the next run starts from the unchanged committed watermark. |
| During transform | Nothing new (pure, in-memory) | Same as above. Deterministic: same input gives the same output. |
| During load | **Nothing** (single transaction rolled back) | The next run recomputes the same full weeks (plus any newer data) and upserts. There are no partial rows to clean up because none were committed. |
| After load commit, before the run row is marked complete | Data and watermark are committed in the same transaction as `status = completed`, so this window does not exist | — |

Guarantees:
- **Not duplicated:** `unique (location_id, week_start)` + `ON CONFLICT DO UPDATE`, and source dedup on `event_id` + natural keys.
- **Not corrupted:** whole-week recompute (never `+=`), atomic transaction, and a watermark that can only advance on commit and never moves backwards (`GREATEST`).

### 3.2 Execution log — `reporting.pipeline_runs`

| Field | Why it is needed in production |
|---|---|
| `run_id uuid` PK | Correlates the log, Prefect, revisions and `last_run_id` on KPI rows. Answers "which run produced this number?" |
| `pipeline_name text` | One table for every future pipeline (briefing: "the same pattern you'll reuse"). Also the scope of the concurrency guard. |
| `prefect_flow_run_id uuid` | Jump to Prefect logs, task states and retries for this run. |
| `trigger text` (`scheduled` / `manual` / `backfill`) + `triggered_by text` (staff user id for manual runs) | Explains unexpected runs and who is accountable for an on-demand recomputation. |
| `started_at`, `finished_at timestamptz` | Duration trends, timeout and `crashed` detection, freshness ("last completed run is 30 h old"), and proof the Monday run happened before leadership opened the report. |
| `status text` (`running` / `completed` / `completed_with_warnings` / `failed` / `crashed` / `skipped_concurrent`) | Shows the health of the run at a glance. Drives the status endpoint and alerting. The partial unique index on `running` prevents overlaps. |
| `current_stage text` / `error_stage text` | Shows where a failure happened (extract / transform / load) without reading stack traces. |
| `watermark_from`, `watermark_to timestamptz` | Exact input boundaries. A run can be reproduced and audited ("was event X included?"). |
| `weeks_recomputed date[]` | Which published weeks this run could have changed, so late-event revisions can be traced. |
| `records_extracted`, `records_rejected`, `duplicates_dropped`, `clock_skew_clamped integer` | Records processed, plus why some were not counted. A spike in rejected or duplicate counts is a capture or contract regression, not a business change. |
| `rows_upserted`, `rows_changed integer` | Rows touched vs. rows whose values actually changed. `rows_changed > 0` on an old week is a late-event revision. |
| `quality_checks jsonb` | Per location-week coverage: event counts and cost vs. `ingrediententry` / `ingredientexit`. Separates growth from data loss (§0). |
| `error_message text` | Sanitised, normalised error (class + message, no DSN or credentials) so failures can be triaged. |
| `code_version text` (git SHA), `schema_version int` | Explains output changes caused by deploys rather than data. |

---

## 4. Mapping to Prefect (Phase 4)

Location: `pipelines/data/` (Prefect 3). The ticket asked for `data/`, but that folder is blocked for tooling by the organisation content-exclusion policy, so the same layout lives under `pipelines/data/`:

| Path | Purpose |
|---|---|
| `pipelines/data/pipelines/pipeline.py` | Main entry point: flow, tasks, retries, caching, CLI |
| `pipelines/data/pipelines/store.py` | `reporting` tables, engine, run log, atomic load, KPI query (replaces the planned `queries.py` / `runs.py`) |
| `pipelines/data/process/transform.py` | Pure transformation logic (`transform_events`) |
| `pipelines/data/raw/` | Input and intermediate files (git-ignored) |
| `pipelines/data/eval/` | Validation outputs, e.g. `run_<id>.json` (git-ignored) |

**Run command** (from the repo root, with `DATABASE_URL` set or in `services/api/.env`):

```
python pipelines/data/pipelines/pipeline.py [--week-start YYYY-MM-DD] [--trigger scheduled|manual|backfill] [--triggered-by USER]
python pipelines/data/pipelines/pipeline.py --serve    # long-running scheduler
```

**Schedule:** `--serve` creates a deployment with cron `0 9 * * *` UTC and a concurrency limit of 1.

**Implemented tasks** (critical = failure stops the run; optional = called with `return_state=True`, failure is logged and the run continues):

| Task | Kind | Retries |
|---|---|---|
| `start_run`, `record_run_failure` | critical | 3 (`[10,30,90]` s) |
| `extract_events` | critical, cached 1 h | 3 (`[10,30,90]` s) |
| `transform_weekly_rollup` | critical, cached 1 h | none (pure) |
| `load_weekly_rollup` | critical | 2 (`[5,15]` s) |
| `extract_order_controls` | optional | 3 (`[10,30,90]` s) |
| `check_quality`, `write_eval_snapshot` | optional | none (local) |
| `notify_run_result` | optional | 2 (`[5,15]` s) |

**Deviations from the design below:**
- No `backfill_weekly_location_performance_flow`; use `--week-start`.
- No `on_failure` / `on_crashed` hooks: the flow records failures on the run row, and the next `start_run` marks stale runs `crashed`.
- The manual trigger uses FastAPI `BackgroundTasks` plus a DB running-row check, not `run_deployment`.
- No Prefect blocks yet: the connection comes from `DATABASE_URL`.
- Extract cache key is `(weeks, watermark_to floored to the hour)`; the transform key is a hash of weeks + `(event_id, ingestion_timestamp)`.

| Prefect concept | Name | Responsibility |
|---|---|---|
| **Flow** (main) | `weekly_location_performance_flow(week_start: date \| None = None, trigger: str = "scheduled", triggered_by: str \| None = None)` | Orchestrates one run end to end. Deployed with cron `0 9 * * *` UTC: the Monday run makes the previous week ready for Mariana (04:00 Bogotá / 05:00 Florida), and the other daily runs absorb late events. Deployment concurrency limit = 1. |
| **Flow** (optional, Part 1) | `backfill_weekly_location_performance_flow(start_week, end_week)` | Calls the main flow once per week as a subflow, in order. Used for first load and for re-computations after a fix. |
| Task | `start_run` | Mark stale `running` rows as `crashed`; insert the `pipeline_runs` row; fix `watermark_to = now() − 2 min`; resolve weeks (query 2.2a, plus current and previous week). |
| Task | `extract_events` | Query 2.2b, returns a DataFrame. `retries=3`, `retry_delay_seconds=[10, 30, 90]`, cache key = `(watermark_from, watermark_to, weeks)`. |
| Task | `extract_order_controls` | Per location-week counts and cost sums from `ingrediententry` / `ingredientexit` for reconciliation. Same retry policy. |
| Task | `transform_weekly_rollup` | Validation, dedup, week bucketing, aggregation and densification. Pure; no retries needed. |
| Task | `check_quality` | Coverage, rejects, duplicates and skew. Returns `quality_checks` and a warn/ok verdict. A warning never blocks the load. |
| Task | `load_weekly_rollup` | The single-transaction upsert + revisions + watermark + run row (§3.1). `retries=2` for connection errors (safe, because it is idempotent). |
| Hook | `on_failure` / `on_crashed` | Set `pipeline_runs.status`, `error_stage` and `error_message`, and notify. |

Relevant states:
- **Scheduled / Pending / AwaitingConcurrencySlot**: queued (a manual and a cron run overlap).
- **Running**: mirrored by `pipeline_runs.status = running`.
- **Retrying**: transient database or network error on extract/load.
- **Completed**: data committed.
- **Failed**: retries exhausted; the watermark is untouched.
- **Crashed**: worker died. The next `start_run` reconciles the stale row.
- **Cancelled**: manual stop. Safe, because the load is atomic.

**Prefect blocks and configuration:**

| Block / setting | Holds | Why a block |
|---|---|---|
| `SqlAlchemyConnector` **`supabase-reporting`** (`prefect-sqlalchemy`) | Supabase PostgreSQL connection for the dedicated `reporting_pipeline` role (`postgresql+psycopg2`, `sslmode=require`) | Credentials are never in code or flow parameters. The role is limited to SELECT on sources and write on `reporting.*`. |
| `Secret` **`supabase-reporting-password`** | The role password, referenced by the connector | Rotation without redeploying flows. |
| `Secret` / webhook block **`reporting-alerts`** | Failure notification target | Alerts on `failed`/`crashed`, or when no completed run happens within 26 h. |
| Prefect **Variables** | `wlp_lookback_minutes = 15`, `wlp_coverage_warn_threshold = 0.98`, `wlp_run_timeout_minutes = 30` | Tunable without code changes. Not secret, so not stored in blocks. |

`PREFECT_API_URL` / `PREFECT_API_KEY` for the API container (used to trigger deployments) are backend environment variables. They are not blocks, because the API is a Prefect *client*, not a flow.

---

## 5. Application integration (Phase 5, design only)

All three endpoints are authenticated with the existing `get_current_user`. They contain **no ETL logic**: each one delegates to a function in `pipelines/data/pipelines/`.

| Endpoint | Access | Calls (in `pipelines/data/pipelines/store.py`) | Behaviour |
|---|---|---|---|
| `GET /reporting/weekly-location-performance?week_start=` | Any signed-in staff | `store.fetch_week(engine, week_start)` | Reads `reporting.weekly_location_performance`. If `week_start` is omitted, uses the latest computed week. `week_start` must be a Monday (422 otherwise). Returns the briefing shape: `{"week_start", "locations": [{location_id, country, total_purchase_cost, total_waste_cost, waste_ratio, stockout_events_count, price_alert_events_count, currency}]}`. Proposed additive fields: `computed_at`, `last_run_status`, `data_quality` (`ok` / `warning`), so a non-technical reader knows when to trust the numbers. COP and USD rows are never summed. |
| `GET /reporting/pipeline-runs/latest` | Any signed-in staff | `store.get_latest_run(engine)` | Returns the latest `pipeline_runs` row: status, timings, counts, weeks recomputed, quality verdict, and a sanitised error. |
| `POST /reporting/pipeline-runs` | `admin` / `manager` roles (same rule as inventory controls) | `pipeline.weekly_location_performance_flow(trigger="manual", triggered_by=user.id)` run through FastAPI `BackgroundTasks`; `store.get_active_run()` guards concurrency | Returns `202 {run_id, status: "scheduled"}`, or `409 {active_run_id}` when a run is already `running`. The flow runs after the response is sent, never inside the request. |

Packaging note: the endpoints live in `services/api/reporting/router.py` and add `pipelines/data` to `sys.path` (env `PIPELINES_DATA_DIR`; default `<repo>/pipelines/data`). The Dockerfile copies `pipelines/data` to `/pipelines/data`. `services/api/telemetry/` and `routers/telemetry.py` are unchanged.

---

## 6. Open questions and follow-ups (need approval — not implemented)

1. **`location_id` type.** The briefing DDL uses `text` (example `"medellin-centro"`), but Brasaland's domain id is an integer 1–14 with no slug/name catalogue in the monorepo. Proposal: keep the briefing DDL and store `'1'`..`'14'`. Add a `reporting.locations` dimension (id, slug, city, country) in v2 for display names.
2. **Receiver duplicate handling (blocking for idempotency).** Change `POST /telemetry/events` to `INSERT … ON CONFLICT (event_id) DO NOTHING` and report `duplicates` in the response. Today a single duplicate turns the whole batch into an HTTP 500. This is an additive change to the capture path; the technical report is untouched.
3. **Server-side outbox for business events.** Write the inventory drafts to an outbox in the same transaction as the order, and deliver them to `telemetry_events` server-side. This removes browser tab loss from the cost KPIs.
4. **Coverage holes in the source.** Inbound orders without `supplier_id`/`unit_cost`, and legacy waste without `waste_cause`, emit **no** event. Their cost is invisible to the KPIs. The reconciliation check will quantify this; the business must decide whether cost becomes mandatory on those forms.
5. **Week boundary.** The briefing fixes Monday 00:00 **UTC**. Sunday-evening activity after 19:00 Bogotá / 20:00 Florida (EDT) therefore lands in the next week. Confirm with Felipe, or move to local-time weeks in v2.
6. **Additive columns** (`source_event_count`, `revision`, `last_run_id`) on the briefing table and the additive KPI response fields. Confirm they are acceptable.
