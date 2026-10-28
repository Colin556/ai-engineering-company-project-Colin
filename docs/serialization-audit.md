# Backend Serialization Audit

## Scope And Baseline

Audit date: 2026-10-28. Application: `services/api/main.py`; schemas:
`services/api/schemas.py`. All **34 application operations** are inventoried below.
FastAPI-generated `/docs`, `/redoc`, `/docs/oauth2-redirect`, and `/openapi.json`
are framework documentation resources, not application data endpoints.

Before edits, Uvicorn started successfully with a temporary development SQLite
inventory database. Both `GET /docs` and `GET /suppliers` returned HTTP 200.
The audit server now uses isolated TinyDB and SQLite files under `/tmp`.

Baseline classifications:

- **Already serialized**: explicit decorator response model and appropriate projection.
- **Partially serialized**: a filtered response exists but overexposes fields, or
	relies on inferred rather than explicitly declared decorator metadata.
- **Not serialized**: untyped dictionary or missing response declaration. For CSV
	and empty responses this means an undocumented transport contract, not an ORM leak.

No route was found returning an unfiltered ORM object. Most existing handlers
already constructed Pydantic responses; the material risks were unnecessary
fields, loosely documented aggregates, permissive inputs, and credential values
echoed by FastAPI validation errors.

## Authentication First

`POST /users` is the public registration endpoint. Its old `UserResponse`
excluded passwords but echoed email. `RegistrationResponse` now permits only
`id`, `is_active`, `role`, and `created_at`; the account ID remains useful to API
clients for account operations. The browser registration consumer ignores this
body and logs in using its existing request credentials.

Login intentionally returns an access token, its type, and lifetime. It never
returns account documents, email, password hashes, or password-reset tokens.
Forgot/reset/change-password return only a generic `detail` message.
`GET /auth/me` intentionally retains the caller's own email because the profile
view uses it. Self/admin account detail and update routes retain email for account
management; the authenticated account directory no longer exposes it.

Default FastAPI validation errors included submitted `input` values. Errors now
retain only `type`, `loc`, and `msg`, preventing invalid email, passwords, and
reset tokens from being echoed. Incident write errors retain their existing
HTTP 400 `{detail: {field, message}}` contract. Other validation errors remain 422.

## Endpoint Inventory

Every row's **final state is Already serialized**. Field lists below are exact
top-level success-body allowlists, not database-model dumps. A schema name in a
relationship column is expanded in the relationship section below.

### Auth, Accounts, And Profiles

| Method | Route | Purpose / consumer | Before: model and actual behavior | Initial state | Final response and exact fields | Input / improvement |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/auth/login` | Swagger/OAuth2 sign-in | Explicit `Token`; typed token object | Already serialized | `Token`: access_token, token_type, expires_in | OAuth2 form: username (email), password; standard grant_type, scope, client_id, client_secret fields supported by FastAPI. No credential echo. |
| POST | `/auth/login/json` | JSON-client sign-in | Explicit `Token`; typed token object | Already serialized | `Token`: access_token, token_type, expires_in | `LoginRequest`: email, password; unknown fields forbidden. |
| GET | `/auth/me` | Profile/session view | Explicit `MeResponse`; typed user and profile | Already serialized | `MeResponse`: id, email, role, is_active, profile | Bearer token; own email required by profile view; bounded profile relation. |
| POST | `/auth/forgot-password` | Password recovery form | Explicit `MessageResponse`; typed generic confirmation | Already serialized | `MessageResponse`: detail | `ForgotPasswordRequest`: email; same confirmation for unknown accounts. |
| POST | `/auth/reset-password` | Reset-link form | Explicit `MessageResponse`; typed confirmation | Already serialized | `MessageResponse`: detail | `ResetPasswordRequest`: token, new_password; reset token stays request-only. |
| POST | `/auth/change-password` | Signed-in password form | Explicit `MessageResponse`; typed confirmation | Already serialized | `MessageResponse`: detail | `ChangePasswordRequest`: current_password, new_password. |
| POST | `/users` | Public registration | Explicit `UserResponse`; typed safe user but echoed email | Partially serialized | `RegistrationResponse`: id, is_active, role, created_at | `UserCreate`: email, password, name, phone, address. Removed response email; role cannot be submitted. |
| GET | `/users` | Authenticated API account directory; no browser consumer found | Explicit list of `UserResponse`; included email and created_at | Partially serialized | List of `UserListItem`: id, is_active, role | Removed contact data and unused audit timestamp; no profiles or credential fields. |
| GET | `/users/{user_id}` | Self/admin account detail | Explicit `UserResponse`; typed safe user | Already serialized | `UserResponse`: id, is_active, role, created_at, email | Path user_id; email retained for self/admin account management. |
| PUT | `/users/{user_id}` | Self/admin account management | Explicit `UserResponse`; typed safe user | Already serialized | `UserResponse`: id, is_active, role, created_at, email | `UserUpdate`: email, password, is_active, role; activation/role require admin; ignores unset/null values as before. |
| DELETE | `/users/{user_id}` | Self/admin deletion | No explicit response_model; already empty 204 | Not serialized (declaration only) | `response_model=None`: empty 204, no body | Path user_id; explicitly preserve HTTP no-content semantics. |
| GET | `/profiles/me` | Caller contact/profile view | Explicit `ProfileResponse`; typed profile | Already serialized | `ProfileResponse`: id, user_id, name, phone, address | Bearer token selects the caller's profile. |
| PUT | `/profiles/me` | Profile editor | Explicit `ProfileResponse`; typed profile | Already serialized | `ProfileResponse`: id, user_id, name, phone, address | `ProfileUpdate`: name, phone, address only; neither identifier writable; null clears a contact field. |

### Suppliers

Consumer evidence: `uis/backoffice/app/(protected)/suppliers/page.tsx` reads ID,
name, country, product categories, rate, and status; it does not read updated_at.
No separate browser detail screen was found. Full detail/write projections remain
available to API consumers; list responses deliberately omit the timestamp.

| Method | Route | Purpose / consumer | Before: model and actual behavior | Initial state | Final response and exact fields | Input / improvement |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/suppliers` | Supplier creation form | Explicit `SupplierResponse`; typed supplier | Already serialized | `SupplierResponse`: id, name, country, product_categories, rate_per_unit, status, updated_at | `SupplierCreate`: name, country, product_categories, rate_per_unit, status. |
| GET | `/suppliers` | Filterable directory | Explicit list of `SupplierResponse`; unnecessary updated_at | Partially serialized | List of `SupplierListItem`: id, name, country, product_categories, rate_per_unit, status | Optional country/category queries; dedicated slimmer list model. |
| GET | `/suppliers/{supplier_id}` | API supplier detail | Explicit `SupplierResponse`; typed supplier | Already serialized | `SupplierResponse`: id, name, country, product_categories, rate_per_unit, status, updated_at | Path supplier_id; no related objects. |
| PATCH | `/suppliers/{supplier_id}/rate` | Directory inline rate editor | Explicit `SupplierResponse`; typed supplier | Already serialized | `SupplierResponse`: id, name, country, product_categories, rate_per_unit, status, updated_at | `SupplierRateUpdate`: rate_per_unit only. |
| PATCH | `/suppliers/{supplier_id}/status` | Directory activation control | Explicit `SupplierResponse`; typed supplier | Already serialized | `SupplierResponse`: id, name, country, product_categories, rate_per_unit, status, updated_at | `SupplierStatusUpdate`: status only. |
| DELETE | `/suppliers/{supplier_id}` | API directory removal | No explicit response_model; empty 204 | Not serialized (declaration only) | `response_model=None`: empty 204, no body | Path supplier_id; no JSON body introduced. |

### Incidents

Consumer evidence: `uis/backoffice/app/(protected)/incidents/page.tsx` reads all
list fields below, including description and updated_at, but never created_at.
`uis/backoffice/lib/api.ts` consumes options, summaries, upload metrics, CSV
export, creation, and status updates. No browser incident-detail call was found;
the existing API detail contract remains available.

| Method | Route | Purpose / consumer | Before: model and actual behavior | Initial state | Final response and exact fields | Input / improvement |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/incidents/options` | Incident form/filter choices | No response_model; dict[str, Any] | Not serialized | `IncidentOptionsResponse`: categories, statuses, origins, branches | Enum lists and explicit value/label branch projections replace arbitrary JSON. |
| GET | `/api/incidents/summary` | Incident dashboard metrics | No response_model; dict[str, Any] | Not serialized | `IncidentSummaryResponse`: total, by_status, by_category, by_origin, by_branch | Counts only; enum-keyed breakdowns, branch-code counts; no incident records. |
| POST | `/api/incidents` | Incident entry form | Explicit `IncidentResponse`; typed output, arbitrary dict input manually validated | Already serialized (input needed work) | `IncidentResponse`: id, title, description, category, status, origin, branch, created_at, updated_at | `IncidentCreate`: title, description, category, status, origin, branch; now declared as request schema; existing branch rules and 400 field errors preserved. |
| GET | `/api/incidents` | Filterable incident table | Implicit response inferred from list[IncidentResponse]; no decorator response_model | Partially serialized | List of `IncidentListItem`: id, title, description, category, status, origin, branch, updated_at | Explicit slim schema; removed unused created_at; optional status/origin/branch/category filters. |
| GET | `/api/incidents/{incident_id}/status` | Legacy API lifecycle update | Explicit `IncidentResponse`; typed incident | Already serialized | `IncidentResponse`: id, title, description, category, status, origin, branch, created_at, updated_at | Path incident_id and status query; retained for compatibility, not preferred for new callers. |
| PATCH | `/api/incidents/{incident_id}/status` | Incident table status editor | Explicit `IncidentResponse`; dict input manually validated | Already serialized (input needed work) | `IncidentResponse`: id, title, description, category, status, origin, branch, created_at, updated_at | `IncidentStatusUpdate`: status only; now a declared strict input model. |
| GET | `/api/incidents/{incident_id}` | API incident detail | Explicit `IncidentResponse`; typed incident | Already serialized | `IncidentResponse`: id, title, description, category, status, origin, branch, created_at, updated_at | Path incident_id; no nested database relations. |
| POST | `/api/incidents/analyze` | CSV analysis upload | No response_model; manually selected dict from metrics_to_json | Not serialized | `IncidentAnalysisResponse`: total_records, total_valid, total_invalid, invalid_reason_counts, category_breakdown, status_breakdown, closed_with_score_count, avg_satisfaction_closed | Multipart file, not JSON; explicit aggregates only, never raw invalid rows, customer names, email, or arbitrary CSV columns. |
| GET | `/api/incidents/results/export` | Analysis CSV download | No response_model; StreamingResponse containing selected metric rows | Not serialized (transport declaration) | `response_model=None`, `StreamingResponse`, explicit text/csv schema; columns metric,value | CSV serializer remains to_export_rows; metric rows cover counts, category/status/reason breakdowns, score count and average. Never serialize uploaded records. |

### Inventory

Consumer evidence: `uis/backoffice/app/(protected)/inventory/products/page.tsx`
uses the seven product fields below. The inbound/outbound forms replace their
selected ingredient with the returned full ingredient, including refreshed stock.
The history table uses only name/SKU/unit/country from the ingredient relation;
it also displays/searches creator UUID, location, time, quantity, and type-specific
supplier/reason fields. These identifiers are intentional business/audit fields,
not incidental database foreign keys.

| Method | Route | Purpose / consumer | Before: model and actual behavior | Initial state | Final response and exact fields | Input / improvement |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/inventory/products` | Ingredient/stock table and order selectors | Explicit list of `IngredientResponse`; typed projection | Already serialized | List of `IngredientResponse`: id, name, sku, unit, category, country, current_stock | Optional country query; all safe fields used by stock table/forms; reuse intentional. |
| POST | `/inventory/products` | Ingredient registration | Explicit `IngredientResponse`; typed projection | Already serialized | `IngredientResponse`: id, name, sku, unit, category, country, current_stock | `IngredientCreate`: name, sku, unit, category, country; no writable stock or ID. |
| GET | `/inventory/products/{ingredient_id}` | Stock refresh before exit | Explicit `IngredientResponse`; typed projection | Already serialized | `IngredientResponse`: id, name, sku, unit, category, country, current_stock | Path ingredient_id; computed stock, no ORM relationship dump. |
| POST | `/inventory/orders/inbound` | Delivery entry and stock refresh | Explicit `IngredientEntryResponse`; typed order/full ingredient | Already serialized | `IngredientEntryResponse`: id, ingredient_id, quantity, location_id, created_at, user_uuid, ingredient, order_type, supplier_name | `IngredientEntryCreate`: ingredient_id, quantity, location_id, supplier_name; creator/time/type generated server-side. |
| POST | `/inventory/orders/outbound` | Consumption/waste entry and stock refresh | Explicit `IngredientExitResponse`; typed order/full ingredient | Already serialized | `IngredientExitResponse`: id, ingredient_id, quantity, location_id, created_at, user_uuid, ingredient, order_type, reason | `IngredientExitCreate`: ingredient_id, quantity, location_id, reason; stock checked transactionally. |
| GET | `/inventory/orders` | Immutable order-history table | Explicit list of entry/exit responses; repeated full ingredient and computed stock | Partially serialized | List union of `IngredientEntryListItem` / `IngredientExitListItem`: id, ingredient_id, quantity, location_id, created_at, user_uuid, ingredient, order_type, plus supplier_name for inbound or reason for outbound | Optional country/location_id queries; ingredient reduced to four display fields; removed unused stock aggregate query. |

## Relationship And Payload Decisions

- `MeResponse.profile`: bounded nested `ProfileResponse`, exactly id, user_id,
	name, phone, address, or null. No nested user object. `user_id` is the explicit
	public account link in the existing standalone profile contract, not a credential.
- Supplier product_categories and incident option enums are scalar lists, not
	related model dumps. Branch options contain exactly value and label.
- Incident branch is a scalar public branch code. Labels come from the options
	endpoint rather than repeating branch objects in every incident.
- Order writes retain `ingredient_id` for the forms' selected-product replacement
	and the full safe `IngredientResponse` for refreshed stock. Both are explicitly
	allowlisted; no raw ingredient/order ORM instance leaves a route.
- Order history uses `OrderIngredientSummary`: exactly name, sku, unit, country.
	It intentionally preserves a small nested projection for existing client access
	paths; a fully flat wire format would add migration work without removing more
	data. It omits nested ingredient id, category, and current_stock.
- History retains ingredient_id for existing client fallback identification,
	location_id for business location labels, and user_uuid because the audit table
	displays and searches the creator. No user/email/profile relation is joined.
- Removing unused history stock aggregation reduces database statements from
	three to two, independent of history size. Tests verify both 7- and 17-row cases.
- List-specific frontend types now match supplier, incident, and order-history
	projections. Write-response types retain fields needed for local state refresh.

## Input And Transport Rules

All JSON write bodies use dedicated request models, never response models.
Unknown JSON fields are forbidden, including server-owned IDs, hashes, timestamps,
and creator values. Existing role/activation authorization remains enforced.
Password changes/resets expose only confirmation messages. OAuth2 login retains
FastAPI's standard form dependency; CSV analysis retains multipart UploadFile.
Neither transport should be mislabeled as a JSON Pydantic body.

Response models are independent from strict request models: unknown stored fields
are filtered rather than causing the request policy to reject a database record.
The only `response_model=None` operations are two empty 204 deletes and the CSV
stream. These are explicit non-JSON transport contracts, not untyped JSON escape
hatches. A Pydantic JSON body on a 204 would violate HTTP semantics; the CSV export
has its own explicit row serializer and OpenAPI media/schema declaration.

## Verification

Completed 2026-10-28:

- Full backend: `services/api/.venv/bin/python -m pytest services/api/tests -q`:
	**106 passed, 2 skipped**. PostgreSQL-only concurrency/constraint checks were
	skipped because no disposable INVENTORY_TEST_DATABASE_URL was configured.
- Frontend: `cd uis/backoffice && npx tsc --noEmit --incremental false` passed;
	`npm test -- --runInBand`: **3 suites, 18 tests passed**.
- Regression coverage checks explicit decorator declarations against all 34
	published OpenAPI operations, nonempty JSON success schemas, no-content deletes,
	CSV media metadata, typed incident input, unknown-write-field rejection,
	filtering of injected stored fields, credential-free validation errors,
	aggregate-only analysis/export, and constant inventory query counts.
- Existing incident lifecycle, authentication, role checks, password reset,
	suppliers, and stock validation tests continue to pass. Registration-email,
	list-stock, and query-count assertions were deliberately updated to the new
	contracts; no unrelated failures were suppressed.

### Interactive Docs Checks

The following requests were exercised through **the actual `/docs` Swagger UI**
in Chromium using Playwright: expand operation, click Try it out, fill request
JSON where applicable, click Execute, inspect live response, assert exact keys.
This is browser-driven interactive-docs verification, not a claim that a human
performed a separate manual review. Temporary browser tooling and extracted
libraries live outside the repository; no browser dependencies were added here.

| Operation | Status | Verified shape |
| --- | --- | --- |
| POST /users | 201 | id, is_active, role, created_at; no email or password |
| POST /auth/login/json | 200 | access_token, token_type, expires_in only |
| GET /api/incidents/options | 200 | categories, statuses, origins, branches |
| GET /api/incidents/summary | 200 | total, by_status, by_category, by_origin, by_branch |
| GET /suppliers | 200 | array items: id, name, country, product_categories, rate_per_unit, status |

To repeat manually, open `http://localhost:8000/docs`, register a unique test
email, log in with the same request credentials, and execute options/summary or
supplier listing. Compare Server response with the response schema shown below
each operation. The audit development server remains available at that URL.

## Remaining Production Concerns

Serialization work is complete; these adjacent behaviors were not changed:

- Lists remain unpaginated. Slimmer rows do not bound total response size.
- Public supplier/incident reads and authenticated account listing retain existing
	access policies. Review authorization separately before expanding sensitive data.
- The legacy GET incident-status route mutates state. Prefer PATCH and plan a
	separate compatibility/deprecation change to avoid unsafe HTTP caching semantics.
- Analysis results remain process-global, so authenticated users can export the
	most recent analysis from another session. Current exports contain only metrics,
	but per-user/job ownership and retention need a separate design.
- A human manual Swagger pass and PostgreSQL-specific test run remain release
	verification steps; the browser-driven Swagger checks and SQLite tests above
	must not be represented as those unperformed checks.