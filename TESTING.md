# Testing

## Run the suites

From the repository root, run the API suite with coverage:

```sh
cd services/api
uv run pytest
uv run pytest --cov=accounts --cov=core --cov=incidents --cov=suppliers --cov-report=term-missing
```

Run the backoffice frontend unit tests separately:

```sh
cd uis/backoffice
npm test -- --coverage
```

The API tests use isolated TinyDB tables and a test-only signing key. Frontend tests cover pure/helper logic and use jsdom's browser storage. They do not assert framework serialization or HTTP transport details.

## Test suites

- `services/api/tests/test_auth.py` covers registration, form login, current-user lookup, token rejection, user access control, and admin actions.
- `services/api/tests/test_auth_routes.py` covers JSON login, user listing and updates, profile read/update behavior, and empty or missing credentials.
- `services/api/tests/test_password.py` covers reset-link privacy, inactive and unknown accounts, one-time/expired/malformed reset tokens, and password changes.
- `services/api/tests/test_suppliers.py` covers supplier reads, filters, creation, rate/status updates, deletion, invalid values, and authentication requirements.
- `services/api/tests/test_supplier_edge_cases.py` covers unmatched filters, the smallest positive rate, and missing-supplier mutations.
- `services/api/tests/test_incidents.py` covers incident validation, list/detail/summary decisions, status transitions, and invalid or missing records.
- `services/api/tests/test_incident_edge_cases.py` covers terminal incident transitions, missing status, and invalid filters/updates.
- `uis/backoffice/__tests__/auth.test.ts` covers stored token reads and expiry/malformed token validation.
- `uis/backoffice/__tests__/password.test.ts` covers password acceptance and minimum-length, mismatch, and UTF-8 byte-limit rejection.

## Planned test coverage

Cases are organized around what each route decides: account creation and permissions, token validity, password transitions, and data state. Each endpoint includes a normal outcome, a boundary case, and a rejected or unavailable outcome.

### Authentication and account endpoints

| Endpoint | Happy path | Edge case | Failure mode |
| --- | --- | --- | --- |
| `POST /users` | Register a user; verify normalized identity, hashed password, and linked profile | Whitespace-normalized email and minimum valid password | Duplicate email; missing/empty or too-short required fields |
| `POST /auth/login` | Valid form credentials issue a usable access token with expected identity and lifetime | Email normalization and configured token lifetime boundary | Wrong password or unknown user; missing credential |
| `POST /auth/login/json` | Valid JSON credentials issue a usable access token | Whitespace around normalized email | Wrong password; empty or malformed credentials |
| `GET /auth/me` | Valid session resolves the current user and profile | User has no profile or unusual optional profile values | Missing, malformed, expired, wrong-type, unknown-user, or inactive-user token |
| `POST /auth/forgot-password` | Active registered account receives a reset link | Unknown/inactive address produces the same public result and no email | Empty or malformed email is rejected |
| `POST /auth/reset-password` | Issued reset token changes the password and is consumed once | New reset request invalidates the older token | Malformed, expired, unissued, access, reused token, or empty/short new password |
| `POST /auth/change-password` | Correct current password changes credentials and revokes reset links | Password at the allowed byte/length boundary | Wrong current password, missing session, or empty/short password |
| `GET /users` | Authenticated user can list users | One-account list | Missing, malformed, or expired session |
| `GET /users/{user_id}` | User reads self; admin reads another user | Unknown user id | Non-admin reads another user or unauthenticated request |
| `PUT /users/{user_id}` | User updates own email/password; admin updates role/status | Empty update is a no-op | Duplicate email, unknown user, invalid role, or non-admin privilege escalation |
| `DELETE /users/{user_id}` | User deletes self or admin deletes another user and linked profile | Repeated delete of the same id | Non-admin deletes another user or unauthenticated request |
| `GET /profiles/me` | User reads linked profile | Optional profile fields are absent | Missing profile or unauthenticated request |
| `PUT /profiles/me` | User updates own profile fields | Empty update preserves existing values | Missing profile or unauthenticated request |

### Backoffice API groups

Existing supplier and incident suites are complemented by focused edge-case modules for these endpoint groups.

| Group | Happy path | Edge case | Failure mode |
| --- | --- | --- | --- |
| Suppliers: list/detail/create/rate/status/delete | Filter and mutate a valid supplier through its lifecycle | Empty results and valid boundary rate | Invalid supplier fields, non-positive rate, missing id, or unauthenticated write |
| Incidents: options/list/create/detail/summary/status | Create, query, summarize, and advance an incident through allowed states | Empty data, optional filters, and terminal states | Invalid payload/filter, missing incident, invalid or forbidden transition, or unauthenticated write |

### Frontend helpers

Each helper will have a success case and an invalid/boundary case.

| Helper | Happy path | Failure or edge case |
| --- | --- | --- |
| `getToken` | Reads a stored session token | No stored token returns `null` |
| `isTokenUsable` | Accepts a well-formed, unexpired token | Rejects malformed, missing-expiry, and expired token values |
| `validateNewPassword` | Accepts matching password within the API's length rules | Rejects short, mismatched, and over-72-byte passwords |

## Coverage results

Last verified: 50 API tests and 10 frontend tests passed.

- Authentication: `accounts.py` 93%, `core.py` 95% (target: 70%).
- Backoffice API groups: `suppliers.py` 94%, `incidents.py` 94% (target: 60%).
- Frontend Jest coverage: `password.ts` 100%; `auth.ts` 55% statements. The tested helpers are covered across happy and failure cases; unrelated token subscription/logout helpers are outside FE-019's selected scope.

The API run reports one Starlette deprecation warning about its current `httpx` test-client integration; it does not affect test results.
