# Brasaland Telemetry Plan

**Status:** proposal only; no instrumentation or application changes are included.  
**Scope:** the production backoffice and FastAPI inventory API, plus internal jobs that read or change their data.  
**Schema registry:** [event-schemas.json](event-schemas.json)

## 1. Purpose and design constraints

Brasaland operates 14 restaurant locations across Colombia and Florida. Telemetry should let Operations investigate inventory movement and control breaches; help Purchasing compare suppliers; and provide reliable, future-ready inputs for location, country, and ISO-week reporting. It should also reveal authentication friction, backoffice usage, and technical failures that are currently invisible.

The six events in the briefing are the mandatory floor. Their names and required dimensions are preserved exactly. The API's implementation names are `Ingredient`, `IngredientEntry`, and `IngredientExit`; telemetry uses the briefing's canonical `product_id`, `product_category`, `inbound_order_created`, and `outbound_order_created` vocabulary. `location_id` remains the integer location ID (1-14); `country` is `CO` or `US`. Store monetary values only in each location's local currency (`COP` or `USD`); never convert at capture time. UI language is a separate concern and must not be inferred from country.

Every proposal below completes the test: “We capture [event type] because we need to know [hypothesis], which allows us to make [decision].” Events without a defensible decision are excluded in section 7.

## 2. Event envelope and data rules

Every event uses the shared envelope in `event-schemas.json`:

| Field | Contract |
| --- | --- |
| `eventId` | Unique UUID per emitted event; retries preserve this ID. |
| `timestamp` | UTC ISO 8601 timestamp with timezone, at the occurrence time (not ingestion time). |
| `sessionId` | Random session identifier; `null` for system events or when no session exists. |
| `userId` | Pseudonymous actor identifier; `null` for unauthenticated or system activity. Never emit a name, email, raw auth ID, or `user_uuid`. |
| `event_type` | Stable, lower-case `entity_action` taxonomy. The six mandatory briefing names are retained verbatim. |
| `schemaVersion` | Integer version, initially `1`; changes are additive where possible and breaking changes get a new version. |
| `requestId` | Correlation ID propagated from browser through API and logs; generated at ingress if absent. |
| `properties` | Event-specific allowlisted payload only. Unknown keys are rejected, not silently forwarded. |

Although pseudonymous identifiers are not anonymous, they reduce exposure. Derive `userId` using a keyed HMAC over the auth subject; keep the key outside the event store, rotate it under an explicit retention/migration policy, and restrict access. Do not put actor identifiers in event `properties`. `sessionId` is random and short-lived. `requestId` is diagnostic metadata, not an identity. For unauthenticated login events, both `userId` and `sessionId` may be `null`.

The schema registry carries a property description, JSON type, requiredness, privacy annotation, and (where relevant) delivery mode for each event. Each `properties` object has `additionalProperties: false`. Schema annotations `x-*` document catalog metadata without weakening JSON Schema validation.

### Inventory payload conventions

All six mandatory inventory events include the briefing's required properties: `location_id`, `country`, `product_id`, `product_category`, `quantity`, `unit`, and `currency`. Use the ingredient's unit and location's local currency. `outbound_order_created` additionally has `reason: "consumption"`; `stock_waste_registered` has `reason` in `expired | kitchen_error | theft_suspected`. Never include employee names, customer data, free-text notes, or supplier names. Use `supplier_id` for the inbound supplier dimension.

For durable purchasing and waste-cost reporting, `inbound_order_created` and `stock_waste_registered` also include `unit_cost` and `total_cost` in local currency; inbound also includes `supplier_id`. These fields extend, rather than replace, the briefing's minimum. `ingredient_price_variance_detected` carries current and reference unit costs and the percentage delta. Do not aggregate COP and USD together.

**Known source gaps to resolve before implementation:** the current inventory models described in the backend context do not expose order cost, and `IngredientExit.reason` distinguishes only `consumption` from `waste`, not the three waste causes. The inbound API has `supplier_name`, not a guaranteed stable `supplier_id`. Instrumentation must not invent these values: add validated source fields/mappings in the owning workflow, or defer the affected cost/variance/waste detail until they exist. The exit guard currently rejects an overdraw with HTTP 400 before writing; emit the rejection event from that controlled path. Direct stock editing must remain impossible: emit `direct_stock_edit_rejected` only at an explicit rejected route/permission boundary or gateway rule, never by creating a mutation endpoint.

## 3. Phase 1: Catalogue of data opportunities

`Mandatory` means explicitly required by the briefing. `Identified opportunity` means proposed here. “Stream” means operationally consumable within seconds/minutes; “batch” means periodic aggregation is sufficient. Delivery choices are justified in section 5.

### Mandatory briefing floor

| Classification | Event | Capture point | Hypothesis and decision |
| --- | --- | --- | --- |
| Mandatory | `inbound_order_created` | Commit of a valid inbound order | We capture `inbound_order_created` because we need to know what and how much is purchased by location and supplier, which allows Purchasing to consolidate demand and negotiate prices. |
| Mandatory | `outbound_order_created` | Commit of a valid consumption exit | We capture `outbound_order_created` because we need to know ingredient consumption rate by location, which allows Operations to tune automatic replenishment suggestions. |
| Mandatory | `stock_waste_registered` | Commit of a waste exit, with an explicit waste cause | We capture `stock_waste_registered` because we need to know the amount, cause, and location of loss, which allows Operations to prioritize waste audits. |
| Mandatory | `stock_threshold_triggered` | Transition from at/above to below a configured minimum | We capture `stock_threshold_triggered` because we need to know how often a location falls below minimum stock, which allows Operations to adjust the threshold or replenishment frequency. |
| Mandatory | `direct_stock_edit_rejected` | Rejected attempt to bypass order-based stock history | We capture `direct_stock_edit_rejected` because we need to know where staff attempt to bypass traceability, which allows the control owner to reinforce training or permissions. |
| Mandatory | `ingredient_price_variance_detected` | Inbound unit cost exceeds configured variance from product/supplier history (briefing example: 10%) | We capture `ingredient_price_variance_detected` because we need to know when an ingredient price changes abnormally, which allows Purchasing and leadership to renegotiate or find an alternate supplier. |

### Identified opportunities: inventory and data integrity

| Classification | Event | Hypothesis and decision |
| --- | --- | --- |
| Identified opportunity | `inventory_validation_failed` | We capture `inventory_validation_failed` because we need to know which form fields and rules block valid inventory work, which allows the product team to fix confusing forms and prioritize training. |
| Identified opportunity | `inventory_product_created` | We capture `inventory_product_created` because we need to know which ingredients and categories are being introduced, which allows administrators to govern the catalog and prevent duplicate or inconsistent products. |
| Identified opportunity | `inventory_product_updated` | We capture `inventory_product_updated` because we need to know how often unit, category, or country metadata changes, which allows the data owner to investigate downstream stock/reporting inconsistencies. |
| Identified opportunity | `inventory_product_lookup_failed` | We capture `inventory_product_lookup_failed` because we need to know which requested ingredient IDs are missing, which allows engineering to fix stale references and operators to correct their workflow. |
| Identified opportunity | `inventory_stock_became_negative_prevented` | We capture `inventory_stock_became_negative_prevented` because we need to know the rate and context of insufficient-stock rejections, which allows Operations to address replenishment gaps and engineering to monitor the invariant. This is a more diagnostic subtype of the rejected outbound path and must not duplicate `direct_stock_edit_rejected`. |
| Identified opportunity | `inventory_duplicate_submission_prevented` | We capture `inventory_duplicate_submission_prevented` because we need to know whether retries create repeated order attempts, which allows engineering to improve idempotency and prevent duplicate records. |
| Identified opportunity | `inventory_stock_reconciled` | We capture `inventory_stock_reconciled` because we need to know whether a controlled reconciliation process finds ledger discrepancies, which allows Finance and Operations to investigate data integrity. Emit only if a formally authorized reconciliation workflow is introduced; never treat it as direct stock mutation. |
| Identified opportunity | `inventory_query_filtered` | We capture `inventory_query_filtered` because we need to know which country/location/category filters operators rely on, which allows the team to improve default views and reporting. Aggregate filter values; do not log search text. |
| Identified opportunity | `inventory_order_list_exported` | We capture `inventory_order_list_exported` because we need to know whether operators depend on exports for reconciliation, which allows product and security owners to prioritize reporting and assess export controls. |

### Identified opportunities: identity, navigation, and workflow

| Classification | Event | Hypothesis and decision |
| --- | --- | --- |
| Identified opportunity | `auth_login_succeeded` | We capture `auth_login_succeeded` because we need to know successful sign-in volume and latency by day, which allows support to distinguish access trends from outages and size support coverage. |
| Identified opportunity | `auth_login_failed` | We capture `auth_login_failed` because we need to know failed attempts and failure categories per day, which allows Security to respond to credential abuse and the product team to reduce legitimate lockouts. Never capture the submitted identifier or password. |
| Identified opportunity | `auth_session_expired` | We capture `auth_session_expired` because we need to know whether expiry interrupts active operator work, which allows Security and Product to tune session lifetime and recovery behavior. |
| Identified opportunity | `auth_session_revoked` | We capture `auth_session_revoked` because we need to know whether sessions are ended by logout, admin action, or security policy, which allows Security to verify revocation controls. |
| Identified opportunity | `auth_password_reset_completed` | We capture `auth_password_reset_completed` because we need to know reset completion and failure rates, which allows Support to improve account recovery without collecting reset tokens or addresses. |
| Identified opportunity | `navigation_section_viewed` | We capture `navigation_section_viewed` because we need to know which backoffice sections operators visit, which allows Product to prioritize navigation and staffing improvements. |
| Identified opportunity | `navigation_flow_abandoned` | We capture `navigation_flow_abandoned` because we need to know where users leave a multi-step task before completion, which allows Product to simplify the relevant flow. Emit a bounded flow/step code, not form values. |
| Identified opportunity | `navigation_flow_completed` | We capture `navigation_flow_completed` because we need to compare starts with successful completion, which allows Product to assess whether a workflow redesign improved task success. |
| Identified opportunity | `backoffice_access_denied` | We capture `backoffice_access_denied` because we need to know which roles encounter authorization boundaries, which allows administrators to correct permissions without weakening access control. |

The current navigation surfaces include Inventory (products and orders), Suppliers, Incidents, Account/Profile, password change, and authentication/recovery. Telemetry should use stable route IDs, not page titles, query strings, or arbitrary URLs. UI language may be collected separately as a coarse preference only if a defined decision requires it; it must never be treated as country.

### Identified opportunities: reliability and performance

| Classification | Event | Hypothesis and decision |
| --- | --- | --- |
| Identified opportunity | `api_request_completed` | We capture `api_request_completed` because we need to know endpoint latency and status distributions, which allows engineering to identify slow or degraded API operations and prioritize capacity or query work. |
| Identified opportunity | `api_request_failed` | We capture `api_request_failed` because we need to know failure rate and bounded failure categories by route, which allows on-call engineers to prioritize incidents and fix unstable dependencies. |
| Identified opportunity | `frontend_error_captured` | We capture `frontend_error_captured` because we need to know uncaught client failures by release and route, which allows engineering to fix user-visible defects before they become support escalations. |
| Identified opportunity | `web_vital_recorded` | We capture `web_vital_recorded` because we need to know real-user load and interaction performance by route/device class, which allows Product and Engineering to prioritize user-impacting performance work. |
| Identified opportunity | `database_query_slow` | We capture `database_query_slow` because we need to know which bounded operation exceeds its latency objective, which allows engineering to tune indexes/queries or capacity. Do not capture SQL text or parameters. |
| Identified opportunity | `dependency_health_changed` | We capture `dependency_health_changed` because we need to know when Supabase, authentication, or an external dependency becomes unavailable, which allows on-call staff to fail over or communicate impact. |
| Identified opportunity | `rate_limit_triggered` | We capture `rate_limit_triggered` because we need to know whether legitimate operators or abusive clients are throttled, which allows Security and Engineering to tune protection without disabling it. |
| Identified opportunity | `deployment_completed` | We capture `deployment_completed` because we need to correlate release time with error and latency changes, which allows on-call staff to roll back a harmful release or confirm a fix. |

### Identified opportunities: internal processing and governance

| Classification | Event | Hypothesis and decision |
| --- | --- | --- |
| Identified opportunity | `background_job_failed` | We capture `background_job_failed` because we need to know whether scheduled imports, alerts, or reporting jobs fail and how often, which allows the owning team to retry safely or page the responsible operator. |
| Identified opportunity | `background_job_completed` | We capture `background_job_completed` because we need to know job duration and processed-record counts, which allows the owning team to set capacity and freshness targets. |
| Identified opportunity | `telemetry_delivery_failed` | We capture `telemetry_delivery_failed` because we need to know whether events are lost, delayed, or repeatedly retried, which allows the telemetry owner to repair the pipeline before reporting becomes incomplete. |
| Identified opportunity | `telemetry_schema_rejected` | We capture `telemetry_schema_rejected` because we need to know which producers emit invalid or unapproved data, which allows the telemetry owner to stop unsafe payloads and fix producer contracts. Do not echo rejected payload values. |
| Identified opportunity | `supplier_record_updated` | We capture `supplier_record_updated` because we need to know whether supplier coverage/status/rates change and when, which allows Purchasing to audit supplier maintenance and interpret price trends. Emit changed field names, not old/new free-text values. |
| Identified opportunity | `incident_record_created` | We capture `incident_record_created` because we need to know operational incident volume and category by location, which allows Operations to prioritize recurring issues. Exclude narrative, reporter identity, and customer details. |

## 4. Phase 2: Event schema catalogue

The accompanying registry provides Draft-07-valid schemas for the six mandatory events and 14 selected opportunities across inventory, identity, navigation, API reliability, frontend experience, and internal processing. Each schema specifies `event_type`, description, properties, types, required fields, descriptions, strict allowlists, privacy/sanitization annotations, and stream/batch mode. The rest of the Phase 1 catalogue is a future opportunity backlog; it is not silently treated as an implemented contract.

### Property and privacy policy

- No employee names, email addresses, customer data, passwords, tokens, reset links, free-text notes, form bodies, raw request/response bodies, SQL, or HTTP headers.
- Authentication failure reasons are bounded codes such as `invalid_credentials`, `locked`, and `provider_unavailable`; never log the submitted identity.
- Error details are normalized to stable error codes. Strip stack traces of source paths, query strings, headers, and user values before any approved diagnostic export.
- Use stable internal IDs for products, suppliers, and locations. Supplier display names are not emitted. Do not use product names when IDs and category suffice.
- Frontend route IDs are allowlisted. Web performance is limited to metric name/value, route ID, and coarse device class; no URL query/hash or browser fingerprint.
- Event storage access is role-limited and audited. Suggested initial retention: raw operational events for 90 days, security events for 180 days subject to Security/legal review, and coarsened aggregates thereafter. Apply deletion/retention policy consistently to pseudonymous IDs.
- Never emit an inventory business event before its database transaction commits. For reliable end-to-end capture, write an outbox row in the same transaction, then publish idempotently; rejected controls are logged by their explicit error-handling path. A request failure and a business event are distinct: a rejected order does not create an order-created event.

## 5. Phase 3: Delivery strategy

The table covers every event defined in `event-schemas.json`; urgency is based on the action it informs, not implementation convenience.

| Event | Mode | Why this timing serves the decision |
| --- | --- | --- |
| `inbound_order_created` | Batch (near-real-time outbox, 5-minute flush) | Purchasing and cost rollups need durable, timely records, but a few minutes do not delay a supplier negotiation. |
| `outbound_order_created` | Batch (5-minute flush) | Consumption-rate replenishment is forecast from accumulated activity; second-level delivery is unnecessary. |
| `stock_waste_registered` | Batch (5-minute flush) | Waste auditing is location/week oriented; preserve the committed event promptly without requiring a second-by-second alert. |
| `stock_threshold_triggered` | Stream | A kitchen may run out of a key ingredient during service; Operations should see the threshold crossing quickly enough to replenish or substitute. |
| `direct_stock_edit_rejected` | Stream | A traceability-control bypass attempt needs prompt review while keeping the mutation rejected. |
| `ingredient_price_variance_detected` | Stream | An abnormal purchase price can require immediate supplier/approver attention before repeated orders compound the cost. |
| `inventory_validation_failed` | Batch (15-minute aggregation) | Form friction is a product-quality trend, not an emergency; counts by field/rule avoid noisy per-attempt paging. |
| `inventory_product_created` | Batch (hourly) | Catalog governance can review new ingredients in a short queue; no operational decision requires seconds. |
| `auth_login_succeeded` | Batch (5-minute flush) | Volume and support trends tolerate short delay; security detection uses the failure stream instead. |
| `auth_login_failed` | Stream | A burst of credential failures can indicate account attack and should feed rapid security detection. |
| `auth_session_expired` | Batch (15-minute aggregation) | Session-friction analysis is not urgent and should be aggregated to reduce event volume. |
| `navigation_section_viewed` | Batch (hourly) | Product usage decisions are based on aggregate trends, not live page views. |
| `navigation_flow_abandoned` | Batch (hourly) | Flow completion analysis is a product improvement input and does not require immediate action. |
| `api_request_completed` | Stream for SLO counters/latency histograms; batch event archive | On-call teams need near-real-time detection of a degrading API; detailed event archives can land in batches. |
| `api_request_failed` | Stream | A rising error rate can interrupt order entry; on-call response should not wait for a daily report. |
| `frontend_error_captured` | Stream | An uncaught client failure can block active work and should quickly correlate with release and route. |
| `web_vital_recorded` | Batch (hourly) | Performance decisions rely on representative percentiles over enough sessions; individual samples do not warrant real-time paging. |
| `background_job_failed` | Stream | A failed import/alert/report job may make operational data stale; notify the owning team promptly. |
| `supplier_record_updated` | Batch (hourly) | Supplier master-data review can wait for a routine audit queue; no immediate interruption is justified. |
| `incident_record_created` | Stream only for configured high-severity category; otherwise batch (15 minutes) | Urgent incidents need prompt triage; routine incidents are handled in an operational queue. Severity is a bounded enum, not inferred from narrative. |

### High-frequency controls

- **API success/latency:** one measurement per request at the API boundary, but publish SLO counters/histograms as a stream and sample detailed successful request events (for example, 1-5%, with deterministic sampling by `requestId`). Always retain all failures and latency threshold breaches. Never use sampling for mandatory business events.
- **Navigation views:** debounce duplicate same-route views within 30 seconds in one session; emit one event per meaningful route entry. Do not emit every render or client-side state update.
- **Validation failures:** aggregate identical `(route_id, field_code, rule_code)` occurrences per session and 5-minute window; cap per-session emission and retain aggregate counts. Never include entered values.
- **Web vitals:** one finalized value per metric, route, and session/page view; ignore observer updates that are superseded before the metric finalizes.
- **Repeated threshold crossings:** emit only when stock transitions from at/above minimum to below it. Do not re-emit on each read while it remains below; a new event is permitted after recovery above threshold and a later recrossing. Include configured threshold and observed stock for auditability.
- **Credential failures:** retain all normalized failure events in a rate-limited stream. Apply aggregation for analytics, not suppression of security signals; controls must prevent event flooding from affecting authentication availability.
- **Outbox and retries:** idempotency key is `eventId`; use bounded exponential retry, dead-letter after configured attempts, and alert on backlog age/loss. Preserve occurrence `timestamp` and add ingestion metadata only outside this envelope.

## 6. Operational and analytical use

Mandatory inventory events are suitable for aggregation by `location_id`, `country`, and ISO week. The future weekly report must sum `total_cost` separately by `currency`, count threshold and price alerts, and never sum COP and USD. `outbound_order_created` distinguishes ingredient consumption; waste must use `stock_waste_registered` so waste ratios are not inferred from generic exits. `ingredient_price_variance_detected` should compare like-for-like product, supplier, and unit, using an explicitly defined historical window and configurable threshold.

Recommended service objectives: no committed mandatory event lost (transactional outbox); p95 stream visibility under 60 seconds; batch freshness under 15 minutes for operational batches and under 2 hours for hourly analytics; schema rejection rate below 0.1%; and alert on oldest undelivered outbox event. These are proposed targets to ratify with Operations and Platform, not current guarantees.

## 7. Risks, exclusions, and decisions needed

### Risks and mitigations

- **Missing cost and waste-cause source fields:** mandatory cost reporting cannot be correct until those values are collected and validated at order creation. Do not estimate or infer them from names or current stock.
- **Supplier identity mismatch:** the current entry model stores a supplier name. Map to an approved supplier ID; reject or quarantine unmatched identifiers rather than emitting free text.
- **Threshold ambiguity:** define the configured minimum per product/location and use a crossing transition, not every query. If the threshold is not persisted, the event cannot be reproducible.
- **Identity/privacy exposure:** pseudonymous `userId` remains sensitive linkable data. Restrict joins, rotate keys thoughtfully, document retention, and avoid using telemetry as employee performance surveillance without policy review.
- **Exactly-once assumptions:** networks retry. Use transactional outbox and idempotent storage keyed by `eventId`; downstream aggregates deduplicate.
- **Country/location consistency:** validate the location-to-country mapping at source; never infer country from UI language or convert currency in telemetry.
- **Price anomaly noise:** define unit normalization, historical baseline window, and minimum sample size before enabling alerts; otherwise small-sample changes can create false positives.
- **Telemetry failure coupling:** event publication must not make an already committed order fail. Queue/outbox persistence is part of the transaction; downstream publishing is independent and observable.

### Considered but excluded

- **Raw credentials, tokens, email, names, customer records, form bodies, free text, full stack traces, and HTTP headers:** unnecessary to the decisions; high privacy/security cost and breach impact.
- **Continuous mouse movement, keystrokes, full clickstream, and session replay:** disproportionate volume and surveillance risk. Bounded route/flow events answer the stated navigation questions.
- **Exact IP address, precise device fingerprint, and location inferred from IP:** not required for this plan; use coarse device class only when performance analysis needs it. Security controls may retain IP separately under an approved security policy, not in this analytics envelope.
- **Raw SQL, request/response bodies, and arbitrary URL/query strings:** risk secrets and personal data; use route templates, error codes, duration, and allowlisted dimensions.
- **Direct stock mutation success event:** prohibited by the business rule. The only event is a rejected attempt at a real enforcement boundary.
- **Sales/revenue, customer behavior, dish-level demand, employee productivity ranking, and cross-currency totals:** outside available source data and/or the stated inventory purpose. Add only with an explicit business owner, lawful purpose, and source contract.
- **Per-render/per-poll stock events and repeated below-threshold alerts:** high-cost duplicates that do not represent a new business fact; use state transitions and aggregation.

### Decisions for implementation planning

1. Approve location-specific minimum-stock storage and the transition semantics for `stock_threshold_triggered`.
2. Add/identify validated inbound unit cost, waste cost basis, waste cause, and stable supplier ID at their source workflows.
3. Ratify stream consumers, alert owners, retention, access policy, and the proposed freshness/SLO targets.
4. Confirm whether `userId` uses a stable HMAC pseudonym for the approved reporting window and who may resolve it.
5. Confirm the price-variance baseline window, threshold, and minimum history before enabling alerts.
