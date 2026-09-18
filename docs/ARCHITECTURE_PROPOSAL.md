# Brasaland Backend and API Architecture Proposal

## 1. Purpose and scope

This document proposes the backend architecture for Brasaland's restaurant operations platform. It is an implementation plan, not application code. The platform must serve employees, branch managers, international management, guests, and external systems across multiple restaurant locations in the United States and Colombia.

The API must support:

- employee identity, roles, onboarding, offboarding, documents, and training;
- availability, schedules, shift releases, overtime approval, time-off requests, and payroll summaries;
- direct and group communication, English/Spanish translation, and targeted notifications;
- controlled recipe books, training materials, checklists, allergies, and menu launches;
- POS and online orders, sales, comps, waste, discounts, and OpenTable data;
- ingredients, inventory counts, vendors, purchase orders, deliveries, and price history;
- reporting, recommendations, forecasting, and management approvals;
- guest profiles, consent, loyalty, referrals, subscriptions, campaigns, and rewards.

The proposal deliberately treats payroll, POS, OpenTable, delivery platforms, social media, push providers, and translation or AI providers as integrations. Brasaland should own its operational records and business rules without assuming that every external vendor offers the same API or reliability.

## 2. Architectural decision

### Recommended pattern: domain-oriented modular monolith with layered, ports-and-adapters boundaries

Brasaland should begin with one deployable FastAPI application organized into independently owned domain modules. Inside each module, a layered structure separates HTTP delivery, application use cases, domain rules, and infrastructure adapters. External systems are reached through explicit ports (interfaces) and adapters rather than directly from endpoints or domain logic.

This combines three useful ideas:

1. **Modular monolith:** one API deployment and one coordinated transactional system at the start.
2. **Layered architecture:** predictable dependency direction and separation of API, business, persistence, and integration concerns.
3. **Ports and adapters:** vendor-specific POS, payroll, OpenTable, messaging, translation, and payment behavior remains replaceable.

### Why this fits Brasaland

- **The workflows cross domains and require consistency.** Offboarding must terminate access to recipes and communications; a shift pickup must validate role training, availability, hours, and manager approval; a menu item cost depends on recipes, ingredient prices, inventory, and sales. Keeping these operations in one application and transactional data platform avoids premature distributed transactions.
- **Brasaland needs one management view across branches.** A centralized API can enforce location scope and produce consistent labor, sales, inventory, and retention metrics while still partitioning records by country and location.
- **The external integration landscape is uncertain.** The brief explicitly allows close-report upload when a POS cannot integrate. Ports and adapters let the same use case accept API webhooks, scheduled imports, or manager-uploaded files without changing domain rules.
- **The project and team are still growing.** A microservice estate would add service discovery, distributed tracing, deployment, message contracts, and failure handling before separate scaling needs are proven. Clear module boundaries preserve a later extraction path.
- **Some work is asynchronous and bursty.** Imports, menu launches, translations, notifications, forecasts, and AI recommendations should run through background jobs. This does not require making the whole system serverless.

### Why the other named patterns are not the primary architecture

| Pattern | Decision and Brasaland-specific reasoning |
| --- | --- |
| MVC | Do not use MVC as the system-level pattern. FastAPI routers and response schemas can resemble controllers and views, but Brasaland's main complexity is workflows and integration rules, not server-rendered presentation. A classic MVC structure would tend to group all models and controllers together and weaken domain ownership. |
| Traditional technical layered architecture | Use layers inside each domain, not repository-wide `controllers/`, `services/`, and `models/` folders. Global technical folders would scatter one workflow across the project and make scheduling, inventory, or loyalty changes harder to reason about. |
| Serverless-first | Do not make every endpoint a separate function. Cold starts, connection management, duplicated authorization, and fragmented observability are poor defaults for chat, scheduling, and tightly related operations. Serverless jobs may be useful later for isolated scheduled or event-driven workloads with measurable burst patterns. |
| Microservices | Defer. Extract a module only when it has a distinct owner, independent release cadence, material scaling or isolation requirement, and a stable event/API contract. Notifications, integration ingestion, analytics, or real-time chat are plausible future candidates. |

### Architectural principles

- Domain modules own their rules and persistence access; modules do not query another module's tables directly.
- Routers validate transport concerns and delegate to application use cases; they do not contain business rules.
- Domain logic has no dependency on FastAPI, database libraries, queues, or vendor SDKs.
- Application use cases define transaction boundaries and authorization requirements.
- Integrations are idempotent, observable, retryable, and isolated behind adapters.
- Human approval is mandatory for sensitive recommendations such as schedule changes, vendor changes, marketing sends, and theft-related discrepancy review.
- Every business record carries organization, country, location, timestamps, and actor provenance where applicable.

## 3. System context and deployment shape

The initial production shape should contain:

- **FastAPI API:** synchronous commands, queries, webhook intake, authentication, and OpenAPI documentation.
- **Background worker:** consumes durable jobs for imports, translations, push messages, scheduled campaigns, forecasts, and document processing. It may share the backend codebase while running as a separate process.
- **Scheduler:** emits recurring jobs such as nightly inventory projections, expired-access checks, and campaign scheduling. Only one scheduler instance should own each schedule.
- **PostgreSQL:** system of record for transactional and reporting-ready operational data. Use row-level organization/location identifiers and database constraints; consider row-level security as defense in depth.
- **Redis or equivalent:** short-lived caching, rate limiting, presence, and job brokering where appropriate; never the source of truth.
- **Object storage:** private employee documents, receipts, training assets, and media using short-lived signed access.
- **Event/outbox delivery:** records domain events in the same database transaction as state changes, then publishes them to workers. This prevents a successful schedule, order, or offboarding update from losing its required notifications and follow-up actions.
- **Observability stack:** centralized structured logs, metrics, traces, audit events, and alerting with correlation IDs propagated through API, jobs, and integrations.

REST/JSON should be the primary external contract. WebSocket or Server-Sent Events can be added for chat and live operational notifications, while durable message history remains accessible through REST. Analytics should initially use curated PostgreSQL read models; move historical analysis to a warehouse only when data volume and reporting workloads justify it.

## 4. Domain boundaries and ownership

| Domain module | Owns | Important boundaries |
| --- | --- | --- |
| Identity and access | accounts, login identities, roles, permissions, sessions, location membership | Central authorization policy; separate authentication identity from employee and guest profiles. |
| Organizations and locations | legal entities, countries, branches, departments, operating hours | Supplies tenant and location scope to every other domain. Country-specific policy belongs behind explicit policy interfaces. |
| Workforce | employee profile, trained roles, availability, schedules, shifts, time off, hour totals | Evaluates role eligibility, overlapping shifts, overtime caps, blackout dates, and manager approvals. Payroll systems receive approved data but do not own scheduling rules. |
| People operations | onboarding/offboarding cases, required tasks, employment dates, document metadata, acknowledgements | Stores SSN/ITIN and tax documents in a restricted data boundary with encryption and audited access. Offboarding emits access-revocation events. |
| Knowledge and training | versioned recipes, manuals, checklists, training assignments, acknowledgements, audience permissions | Separates in-force from experimental versions and FOH from BOH/bar views; retains immutable publication history. |
| Catalog and menus | ingredients, products, menu items, specials, menu versions, branch activation | References published recipes without taking ownership of recipe content. Supports planned, branch-specific launches. |
| Sales and ordering | checks, line items, orders, comps, discounts, waste reasons, channel and POS references | Normalizes records from native ordering, POS, delivery services, receipt upload, and OpenTable-related flows. |
| Inventory and procurement | stock items, counts, movements, par levels, vendors, price quotes, purchase orders, deliveries | Maintains unit conversions and immutable price-at-order snapshots; vendor changes require configurable approval. |
| Guest and loyalty | guest profile, consent, receipt claims, points ledger, rewards, referrals, subscriptions, occasions | Uses an append-only points ledger and explicit consent/purpose records. Avoid exposing employee systems to guests. |
| Communications | conversations, membership, messages, translated variants, announcements | Enforces organization/location/team audience and preserves original text alongside machine translations. Management creates managed groups. |
| Notifications and campaigns | templates, delivery preferences, campaigns, device registrations, delivery attempts | Separates a business event from provider delivery and enforces opt-in, quiet hours, jurisdiction, and unsubscribe state. |
| Reporting and recommendations | operational read models, KPIs, forecasts, recommendations, decisions, model metadata | Reads approved domain data/events; never silently modifies schedules, orders, vendors, or campaigns. Records accept/reject decisions for evaluation. |
| Integrations | provider connections, credentials references, mappings, sync cursors, imports, webhooks, failures | Provider adapters translate external payloads into canonical commands/events. Secrets stay in a secret manager, not domain records. |

These boundaries should be enforced in application imports and code ownership. Cross-domain workflows coordinate through public application services and domain events. For example, People Operations records an end date, Identity revokes access at the effective time, Knowledge removes protected-material access, Communications updates memberships, and the audit log records each action.

## 5. Proposed backend folder and module structure

The backend should live under the repository's existing `services/` convention as one service, for example `services/api/`.

```text
services/api/
├── README.md
├── pyproject.toml
├── migrations/
├── src/brasaland_api/
│   ├── main.py
│   ├── api/
│   │   ├── dependencies/
│   │   ├── errors/
│   │   ├── middleware/
│   │   └── v1/
│   │       ├── router.py
│   │       └── system.py
│   ├── core/
│   │   ├── config.py
│   │   ├── security.py
│   │   ├── database.py
│   │   ├── logging.py
│   │   ├── telemetry.py
│   │   └── jobs.py
│   ├── modules/
│   │   ├── identity/
│   │   ├── organizations/
│   │   ├── workforce/
│   │   ├── people_ops/
│   │   ├── knowledge/
│   │   ├── catalog/
│   │   ├── sales/
│   │   ├── inventory/
│   │   ├── loyalty/
│   │   ├── communications/
│   │   ├── notifications/
│   │   ├── reporting/
│   │   └── integrations/
│   └── shared_kernel/
│       ├── ids.py
│       ├── money.py
│       ├── time.py
│       └── events.py
└── tests/
	├── unit/
	├── integration/
	├── contract/
	└── end_to_end/
```

Each business module should use the same internal convention:

```text
modules/<domain>/
├── api/
│   ├── router.py
│   └── schemas.py
├── application/
│   ├── commands.py
│   ├── queries.py
│   ├── services.py
│   └── ports.py
├── domain/
│   ├── entities.py
│   ├── value_objects.py
│   ├── policies.py
│   ├── events.py
│   └── errors.py
├── infrastructure/
│   ├── persistence.py
│   ├── orm_models.py
│   └── adapters.py
└── tests/
```

### Separation criteria

- A **domain module** represents a business capability with its own vocabulary, rules, lifecycle, and data ownership. It is not created merely because a new screen exists.
- The **API layer** owns HTTP paths, status codes, input/output schemas, pagination, and dependency injection.
- The **application layer** coordinates use cases, authorization decisions, transaction boundaries, ports, and events.
- The **domain layer** owns invariants such as overtime approval, trained-role eligibility, recipe publication state, price snapshots, and points accounting.
- The **infrastructure layer** owns SQL mappings, repositories, queues, storage clients, and provider adapters.
- The small **shared kernel** is limited to stable primitives used almost everywhere. Business-specific helpers must remain in their module to prevent an unowned utility layer.
- Tests live both near modules for ownership and in top-level suites for cross-domain, contract, and end-to-end scenarios.

## 6. FastAPI endpoint and router organization

Expose one versioned prefix, `/api/v1`, and include one router per domain. Group routes by the resource or workflow they protect, not by frontend page. Use plural nouns for resources, nested paths only when the child cannot be addressed meaningfully without the parent, and explicit action subpaths for commands that are not CRUD operations.

### System and identity

- `/health`, `/ready`, and `/api/v1/meta` for health, dependency readiness, and API metadata.
- `/api/v1/auth/sessions`, `/auth/refresh`, `/auth/logout`, and `/auth/password-reset` for session lifecycle.
- `/api/v1/me`, `/me/permissions`, `/me/locations`, and `/me/devices` for the authenticated principal.
- `/api/v1/users`, `/roles`, `/permissions`, and `/location-memberships` for authorized administration.

### Organizations and workforce

- `/api/v1/organizations` and `/locations` for company and branch administration.
- `/api/v1/employees`, `/employees/{id}/roles`, `/employees/{id}/availability`, and `/employees/{id}/hours` for employee records and eligibility inputs.
- `/api/v1/schedules`, `/schedules/{id}/publish`, `/shifts`, `/shifts/{id}/release`, `/shifts/{id}/claim`, and `/shift-approvals` for scheduling workflows.
- `/api/v1/time-off-requests`, `/blackout-periods`, and `/labor-policies` for leave and country/location scheduling constraints.

### People operations and training

- `/api/v1/onboarding-cases`, `/onboarding-cases/{id}/tasks`, and `/onboarding-cases/{id}/complete` for hire workflows.
- `/api/v1/offboarding-cases`, `/offboarding-cases/{id}/tasks`, and `/offboarding-cases/{id}/finalize` for controlled termination and access removal.
- `/api/v1/employment-documents` and `/document-requirements` for restricted document metadata and signed upload/download flows.
- `/api/v1/training-assignments`, `/training-assignments/{id}/acknowledge`, and `/training-progress` for staff and manager requirements.

### Knowledge, recipes, and menus

- `/api/v1/knowledge-documents`, `/knowledge-documents/{id}/versions`, `/publish`, and `/archive` for manuals and controlled content.
- `/api/v1/recipes`, `/recipes/{id}/versions`, `/publish`, and `/permissions` for BOH, bar, and experimental/in-force content.
- `/api/v1/checklist-templates`, `/checklist-runs`, and `/checklist-runs/{id}/complete` for opening, closing, and side work.
- `/api/v1/ingredients`, `/menu-items`, `/menus`, `/menus/{id}/versions`, `/menus/{id}/locations`, and `/menu-launches` for branch-aware menu planning.

### Sales, ordering, inventory, and procurement

- `/api/v1/orders`, `/orders/{id}/items`, `/orders/{id}/status`, and `/ordering-channels` for native and normalized online orders.
- `/api/v1/sales-reports`, `/sales-events`, `/comps`, `/discounts`, and `/waste-events` for operational close data.
- `/api/v1/inventory-items`, `/inventory-counts`, `/inventory-movements`, `/par-levels`, and `/inventory-discrepancies` for stock control.
- `/api/v1/vendors`, `/vendor-products`, `/vendor-prices`, `/purchase-orders`, `/purchase-orders/{id}/approve`, `/purchase-orders/{id}/send`, and `/deliveries` for procurement.

### Guests, communications, and campaigns

- `/api/v1/guests`, `/guests/{id}/consents`, `/guest-occasions`, and `/receipt-claims` for guest identity and opted-in history.
- `/api/v1/loyalty/accounts`, `/loyalty/transactions`, `/rewards`, `/reward-redemptions`, `/referrals`, and `/subscriptions` for acquisition and retention.
- `/api/v1/conversations`, `/conversations/{id}/members`, `/conversations/{id}/messages`, and `/messages/{id}/translations` for direct and managed group communication.
- `/api/v1/announcements`, `/campaigns`, `/campaigns/{id}/approve`, `/campaigns/{id}/schedule`, `/notification-preferences`, and `/delivery-attempts` for controlled outreach.

### Reporting, recommendations, and integrations

- `/api/v1/reports/labor`, `/reports/sales`, `/reports/inventory`, `/reports/menu-profitability`, and `/reports/retention` for scoped management read models.
- `/api/v1/recommendations/schedules`, `/recommendations/orders`, `/recommendations/promotions`, and `/recommendations/{id}/decisions` for explainable, human-reviewed suggestions.
- `/api/v1/integrations/connections`, `/integrations/imports`, `/integrations/imports/{id}/errors`, and `/integrations/sync-status` for manager-visible integration operations.
- `/api/v1/webhooks/{provider}` for provider callbacks. Each provider must have signature verification, replay protection, rate limits, and idempotency keys before acknowledging receipt.

Routers should apply authentication and coarse permission dependencies, while application policies enforce resource- and location-level authorization. List endpoints need cursor pagination, filtering, stable sorting, and bounded page sizes. Mutating endpoints that clients or providers may retry should accept idempotency keys. OpenAPI tags should match these domains, and deprecated versions must publish a removal timeline.

## 7. How standards shape the structure

### Repository standards

The repository defines `services/` as the home of the centralized FastAPI backend, `uis/` for human-facing applications, `data/` for datasets and transformation pipelines, `agents/` for AI agents, `workflows/` for cross-system automation, `packages/` for reusable libraries, `shared/` for schemas and templates, `infra/` for deployment assets, and `docs/` for cross-cutting decisions. Therefore:

- the API belongs in `services/api/`, not in the frontend project or a root script;
- long-running operational behavior belongs in the API or its worker, while research datasets and offline transformations remain under `data/`;
- AI recommendation logic may live under `agents/`, but it accesses business capabilities through approved API/tool contracts and cannot bypass authorization or write directly to production tables;
- shared OpenAPI artifacts and generated frontend clients can live in `shared/` or a versioned `packages/` package;
- deployment manifests and secrets references belong under `infra/`, while environment-specific secret values never enter the repository.

### Python and FastAPI conventions

- Use a `src/` layout and package metadata in `pyproject.toml` so imports do not accidentally resolve from the working directory.
- Keep one application factory/composition root in `main.py`; it loads validated settings, middleware, exception handlers, and the versioned router.
- Use Pydantic request/response schemas at the HTTP boundary, domain entities for business behavior, and ORM models only for persistence. Do not use one class for all three concerns because API compatibility, business invariants, and database migrations change for different reasons.
- Load configuration through one typed settings object. Group settings by database, authentication, storage, queues, observability, frontend origins, and each provider. Fail at startup when required configuration is absent.
- Use dependency injection to supply principals, transaction scopes, repositories, and provider ports. Dependencies should not hide business decisions.
- Maintain database schema changes through reviewed, forward-only migrations. Domain modules own their tables and migration review, even while sharing one PostgreSQL cluster.

### API and data contract standards

- Publish OpenAPI as the source of truth for synchronous API communication and generate the TypeScript client/types consumed by frontends. Do not manually duplicate request and response interfaces.
- Use a consistent error envelope containing a stable machine-readable code, human-safe message, correlation ID, and optional field errors.
- Store timestamps in UTC and return ISO 8601 values with offsets. Store money as amount plus ISO currency; never compare USD and COP without an explicit exchange-rate source and effective time.
- Assign immutable internal identifiers and keep external provider identifiers in mapping records.
- Version event schemas and API contracts. Additive changes are preferred within a version; breaking changes require a new API version and migration window.
- Audit privileged reads and all mutations involving HR records, permissions, recipes, vendor approvals, loyalty balances, and management recommendations.

### Security and compliance standards

- Apply least-privilege role- and attribute-based access using organization, location, department, employment state, and trained role. A manager at one branch must not gain access to all branches by knowing an identifier.
- Classify data. SSN/ITIN, tax forms, identity documents, payroll details, and termination records require field-level encryption where appropriate, restricted storage, masked logs, shorter access sessions, and auditable access.
- Do not infer that US and Colombian employment, tax, privacy, consent, or retention requirements are interchangeable. Country policy modules and legal review must define required forms, retention schedules, deletion restrictions, and marketing rules.
- Encrypt traffic and storage, rotate credentials, scan uploads, validate content types and sizes, and issue short-lived signed object URLs.
- Require step-up authentication and approval workflows for high-impact actions such as terminating staff access, publishing recipes, changing vendors, adjusting loyalty balances, or sending broad campaigns.

## 8. Frontend and backend organization

### Monorepo now, separable deployments

Keep the frontends and backend in the current monorepo because the project represents one company, contract changes span applications, and a small team benefits from atomic pull requests and shared CI. Keep them as independently buildable and deployable projects:

- frontends remain under `uis/<application>/`;
- the FastAPI backend remains under `services/api/`;
- neither project imports source files directly from the other;
- shared contracts are generated from OpenAPI into a versioned package rather than copied by hand;
- CI runs affected-project checks and a contract compatibility check before deployment.

Separate repositories become justified only when ownership, access control, release cadence, or regulatory isolation materially diverges. If split later, publish the OpenAPI specification and generated SDK as versioned artifacts, retain consumer contract tests, and define a compatibility and deprecation policy.

### API communication

- Browser and mobile clients call the public API over HTTPS using the generated client.
- Prefer secure, short-lived tokens. For browser applications, use secure, HTTP-only, SameSite cookies when frontend and API deployment topology permits; otherwise use an authorization-code flow with PKCE and never persist long-lived tokens in browser storage.
- Do not expose database credentials or provider secrets to a frontend. Client-visible map, analytics, or push identifiers must be explicitly classified as public configuration.
- Use request correlation IDs, idempotency keys for retryable commands, and explicit timeouts. Frontends should handle `401`, `403`, `409`, `422`, `429`, and provider-degraded states consistently.
- Use optimistic UI only where conflicts are harmless. Shift claims, loyalty redemption, purchase approval, and inventory adjustment require server-confirmed state.

### Environment variables and configuration

Maintain separate development, test, staging, and production environments. Commit only documented example variable names and non-secret defaults. Supply real values through the deployment platform's secret manager.

Backend configuration includes database and queue URLs, token issuer/audience and key references, object storage, allowed frontend origins, telemetry endpoints, encryption key references, provider webhook secrets, and provider credentials. Frontend configuration contains only the API base URL and explicitly public provider settings. Validate configuration at startup and do not silently fall back to development values in staging or production.

### CORS and browser security

- Configure an explicit allowlist per environment, such as the exact admin and guest application origins; never use wildcard origins with credentials.
- Restrict methods and request headers to those the clients need and expose only necessary response headers such as correlation and pagination metadata.
- Keep CORS enforcement at the FastAPI or trusted edge layer from one reviewed configuration source. CORS is not authorization; every endpoint still validates identity, permission, and location scope.
- Protect cookie-authenticated mutations against CSRF, use secure cookie attributes, and apply Content Security Policy and related browser headers at the frontend/edge.
- Local development origins must be listed separately and must never leak into production configuration.

## 9. Integration strategy

For each provider, define a canonical port, provider adapter, external-to-internal identifier mapping, credential reference, health state, sync cursor, and dead-letter/replay process. The supported ingestion order should be:

1. Signed provider webhooks for timely events.
2. Scheduled API reconciliation to repair missed or out-of-order events.
3. Validated CSV/PDF/manual close-report import when no usable API exists.
4. Manual entry with approval and provenance as the final fallback.

Webhook handlers should authenticate and durably record an inbox item quickly, then process asynchronously. The inbox and idempotency key prevent duplicate sales, reservations, rewards, or inventory movements. Raw payload retention must be time-bounded and scrubbed of unnecessary personal or payment data.

Brasaland should not store raw card data; online ordering should use a PCI-compliant payment provider and tokenized references. POS data should be normalized to Brasaland's canonical sales vocabulary while retaining traceability to the provider event. Vendor prices must include source, unit, currency, effective time, and the immutable price accepted on each order.

## 10. Data, reporting, and AI controls

- Start with normalized transactional schemas and purpose-built read models for dashboards. Do not run expensive cross-domain reports directly against request-critical tables without replicas or precomputed views.
- Maintain lineage from source event or manager import to normalized record and report metric. Corrections should be recorded, not overwrite history invisibly.
- AI schedule, order, vendor, and campaign suggestions must include inputs, generated time, model/prompt version, confidence or rationale, and the manager's decision.
- Treat theft detection as a discrepancy signal, not an accusation. Restrict access, require human investigation, and monitor bias and false positives.
- Use de-identified or minimized data for model development where possible. Do not send SSN/ITIN, tax documents, private messages, or unnecessary guest identifiers to model providers.
- Build evaluation datasets under `data/eval/` and establish acceptance thresholds before automating any recommendation. Initially, all recommendations remain advisory.

## 11. Delivery sequence

### Phase 1: platform foundation

Establish identity, organizations/locations, authorization scope, audit logging, configuration, migrations, object storage, job/outbox processing, observability, OpenAPI generation, and CI contract checks. Define data classification and US/Colombia policy ownership before ingesting employee documents.

### Phase 2: employee operations

Deliver employee profiles, trained roles, availability, scheduling, shift workflows, time off, onboarding/offboarding, controlled documents, recipes, training, and communications. Validate overtime and employment policies with management and counsel rather than encoding assumptions.

### Phase 3: restaurant operations

Deliver menu/catalog, POS and close-report ingestion, normalized sales, inventory counts and movements, vendor pricing, purchase orders, deliveries, and menu profitability read models. Begin with one POS and one location, then prove reconciliation before expansion.

### Phase 4: guest and ordering capabilities

Deliver consent-aware guest profiles, receipt claims, append-only loyalty ledger, rewards/referrals, native ordering through a payment provider, campaigns, and notification preferences. Add OpenTable and delivery-channel adapters based on provider access and commercial priority.

### Phase 5: forecasting and optimization

Add schedule recommendations, predicted orders, price trends, promotions, and discrepancy signals only after sufficient clean historical data exists. Keep approval gates and measure recommendation acceptance, financial impact, drift, and false positives.

At each phase, pilot at one branch, document operational fallback procedures, measure correctness and adoption, then expand by location. This reduces the risk of making all branches dependent on an unproven workflow.

## 12. Quality and operational requirements

- Unit-test domain policies, especially role eligibility, overtime, effective access dates, unit conversion, points accounting, and approval transitions.
- Integration-test repositories, migrations, queues, object storage, and authorization scope against real service containers.
- Contract-test provider adapters using recorded, redacted fixtures and test webhook signatures.
- End-to-end-test critical workflows: hire-to-access, termination-to-revocation, shift release/claim/approval, menu publication, sale-to-inventory movement, purchase approval, and reward redemption.
- Define service-level objectives for API availability and latency, job completion delay, webhook processing, notification delivery, and data freshness.
- Back up and restore databases and object storage; test restoration regularly. Define recovery point and recovery time objectives with management.
- Provide runbooks for provider outage, queue backlog, failed import, duplicate event, credential compromise, accidental campaign, and branch connectivity loss.

## 13. Risks and points of attention

1. **Domain boundaries may erode into a coupled monolith.** If modules query each other's tables or place logic in routers, a change to scheduling, HR, or inventory can create hidden regressions across the platform. Enforce dependency rules, module-owned repositories, architecture tests, and code review ownership.
2. **Authorization mistakes can expose employee or branch data.** A route-level role check alone cannot prevent cross-location access. Require organization/location scoping in every use case and repository query, test horizontal privilege escalation, and audit sensitive reads.
3. **Sensitive HR and guest data can create legal and security exposure.** Collecting SSN/ITIN, tax forms, termination reasons, location history, and marketing behavior without classification, consent, retention, and deletion policies can cause severe harm. Minimize collection, isolate access, encrypt, audit, and obtain jurisdiction-specific legal review.
4. **Integration events can be duplicated, missed, or arrive out of order.** Without inbox/outbox records, idempotency, reconciliation, and immutable provider mappings, Brasaland can double-count sales, rewards, or inventory. Every provider must pass replay and reconciliation tests before branch rollout.
5. **Bad master data can make financial recommendations misleading.** Incorrect recipe yields, units, vendor prices, comps, or waste inputs will produce false margins and orders. Assign data owners, validate units and currencies, show lineage, and require human approval.
6. **AI automation can turn correlation into unfair action.** Scheduling patterns or inventory discrepancies can be incomplete or biased. Recommendations must be explainable and advisory, with protected access, decision logging, quality monitoring, and a process to contest or correct data.
7. **Real-time features can distract from durable workflows.** Chat presence and instant dashboards are useful, but should not weaken message persistence, auditability, or core scheduling and offboarding reliability. Scale real-time delivery separately only after measuring demand.
8. **A single deployment can become a scaling bottleneck if boundaries are ignored.** Monitor latency, queue depth, failure domains, and ownership. Extract a module only from an already clean boundary and only when operational evidence justifies the added distributed-system cost.

## 14. Decision checkpoints

Before implementation, Brasaland stakeholders must confirm:

- initial pilot country, branch, POS, payroll, reservation, ordering, and notification providers;
- employee and guest identity strategy and whether browser and mobile apps share an identity provider;
- legal requirements for US and Colombian employment documents, payroll data, privacy, consent, and retention;
- precise overtime, role eligibility, blackout, approval, rewards, and vendor-change rules;
- source-of-truth ownership for schedules, orders, employee hours, menu definitions, and guest profiles;
- availability and contractual limits of provider APIs and webhooks;
- recovery objectives, expected user volume, order volume, message volume, and data freshness targets.

These decisions should be captured as Architecture Decision Records in `docs/` and reflected in versioned API contracts before implementation begins.
