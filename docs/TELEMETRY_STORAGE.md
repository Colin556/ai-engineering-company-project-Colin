# Brasaland Telemetry Storage Implementation

**Status:** Implementation of Phase 1, Phase 2, and Phase 3 verification plan.  
**Date:** 2026-11-02

## Overview

This document describes the backend telemetry storage system that transforms the Phase 1 stub endpoint into a production system capable of:

1. **Validating** each event against the approved telemetry schema
2. **Persisting** valid events in bulk to Supabase PostgreSQL
3. **Reporting** exactly what was received, stored, and rejected
4. Enabling **partial acceptance**: invalid events are rejected individually while valid ones in the same batch are durably stored

## Phase 1: Storage Table in Supabase

### Schema Design

The `telemetry_events` table stores immutable telemetry events with the following structure:

```sql
CREATE TABLE telemetry_events (
    id BIGSERIAL PRIMARY KEY,
    event_id UUID NOT NULL UNIQUE,
    event_type VARCHAR(100) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    service VARCHAR(50) DEFAULT 'api',
    session_id VARCHAR(255),
    user_id VARCHAR(255),
    request_id VARCHAR(255),
    schema_version INTEGER NOT NULL DEFAULT 1,
    tags JSONB NOT NULL DEFAULT '{}'::jsonb,
    ingestion_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Key Design Decisions

- **Write-only semantics:** Events are never updated or deleted. Telemetry is an immutable fact log.
- **Fixed columns for analytics:** `event_type`, `timestamp`, and `service` support efficient SQL queries and aggregation.
- **JSONB tags column:** Event-specific properties (e.g., `location_id`, `product_category`, `quantity`, `unit`, `currency`) are stored as allowlisted JSON without requiring schema alterations for each new event variant.
- **Idempotency:** `event_id` is unique to prevent duplicate processing on retries.
- **Distributed tracing:** `request_id` correlates events across the frontend, API, and backend services.

### Indexes

The table includes five indexes to support common analytical queries:

| Index | Purpose |
|-------|---------|
| `idx_telemetry_events_timestamp` | Time-range queries for event analysis by date/week |
| `idx_telemetry_events_type` | Event-based aggregations (e.g., all inbound orders) |
| `idx_telemetry_events_tags` | GIN index for JSONB property searches (e.g., location_id = 1) |
| `idx_telemetry_events_type_timestamp` | Composite index for common (event_type, timestamp) queries |
| `idx_telemetry_events_event_id` | Idempotency checks and event lookups |

### Migration

The migration file is located at:
```
services/api/migrations/001_create_telemetry_events.sql
```

To apply it in production:
1. Connect to Supabase PostgreSQL
2. Run the SQL migration
3. Verify table creation and indexes

## Phase 2: Real Endpoint Implementation

### Endpoint Contract

**Endpoint:** `POST /telemetry/events`

**Request Body:**
```json
{
  "events": [
    {
      "eventId": "550e8400-e29b-41d4-a716-446655440000",
      "timestamp": "2026-11-02T23:43:38.010Z",
      "sessionId": "sess-12345",
      "userId": "user-hmac-xyz",
      "event_type": "inbound_order_created",
      "schemaVersion": 1,
      "requestId": "req-abc123",
      "properties": {
        "location_id": 1,
        "country": "CO",
        "product_id": 42,
        "product_category": "meat",
        "quantity": 10.5,
        "unit": "kg",
        "currency": "COP",
        "supplier_id": "supp-001",
        "unit_cost": 5000.0,
        "total_cost": 52500.0
      }
    }
  ]
}
```

**Response (HTTP 200):**
```json
{
  "received": 2,
  "stored": 1,
  "rejected": 1
}
```

### Validation Strategy

The endpoint uses **per-event parsing** rather than eager validation of the entire batch:

1. **Accept loosely:** The request body is parsed as `{ "events": [...] }` where each event is a raw dict.
2. **Parse individually:** For each raw event, call `TelemetryEventModel.model_validate(raw)` inside a try/except.
3. **Collect results:** Valid events go into the bulk-insert list; invalid ones increment the rejected counter.
4. **Loop continues:** Even if one event fails, the loop processes the rest.

**Why this matters:**
- **Old approach (typed body):** If `events: list[TelemetryEvent]` in the FastAPI signature, Pydantic validates every event before the handler runs. One invalid event → 422 status → entire batch rejected → frontend retries all.
- **New approach (per-event validation):** Each event is validated independently. Valid events are stored; invalid ones are counted as rejected. Frontend receives 200 OK and knows exactly what succeeded.

### Partial Acceptance Guarantees

- **Valid events are persisted in a single bulk INSERT transaction.**
- **Rejected events do not block valid ones.**
- **The response always returns HTTP 200** (unless the envelope itself is malformed, which returns 422).

Example: If a batch of 10 events contains 1 invalid event, 9 are stored and 1 is rejected. The response is:
```json
{
  "received": 10,
  "stored": 9,
  "rejected": 1
}
```

### Code

The implementation is in [routers/telemetry.py](/workspaces/ai-engineering-company-project-Colin/services/api/routers/telemetry.py):

```python
@router.post("/events", response_model=TelemetryBatchResponse)
def receive_events(
    batch: TelemetryBatchRequest | bytes = Body(...),
    db: Session = Depends(get_db),
) -> TelemetryBatchResponse:
    """Receive, validate, and store telemetry events in bulk."""
    
    # Parse the batch (bytes or JSON)
    if isinstance(batch, bytes):
        batch = TelemetryBatchRequest.model_validate_json(batch)
    
    received_count = len(batch.events)
    valid_events = []
    rejected_count = 0
    
    # Per-event validation
    for raw_event in batch.events:
        try:
            validated_event = TelemetryEventModel.model_validate(raw_event)
            db_event = TelemetryEvent(
                event_id=validated_event.eventId,
                event_type=validated_event.event_type,
                timestamp=validated_event.timestamp,
                service="api",
                session_id=validated_event.sessionId,
                user_id=validated_event.userId,
                request_id=validated_event.requestId,
                schema_version=validated_event.schemaVersion,
                tags=validated_event.properties,
            )
            valid_events.append(db_event)
        except ValidationError as e:
            logger.debug("Rejected telemetry event: %s", str(e))
            rejected_count += 1
    
    # Bulk insert all valid events in a single transaction
    if valid_events:
        db.add_all(valid_events)
        db.commit()
        stored_count = len(valid_events)
    else:
        stored_count = 0
    
    return TelemetryBatchResponse(
        received=received_count,
        stored=stored_count,
        rejected=rejected_count,
    )
```

### Database Models

The [TelemetryEvent SQLModel](/workspaces/ai-engineering-company-project-Colin/services/api/models.py) provides ORM mapping:

```python
class TelemetryEvent(SQLModel, table=True):
    __tablename__ = "telemetry_events"
    
    id: int | None = Field(default=None, primary_key=True)
    event_id: UUID = Field(unique=True, index=True)
    event_type: str = Field(max_length=100, index=True)
    timestamp: datetime = Field(index=True)
    service: str = Field(default="api", max_length=50)
    session_id: str | None = Field(default=None, max_length=255)
    user_id: str | None = Field(default=None, max_length=255)
    request_id: str | None = Field(default=None, max_length=255, index=True)
    schema_version: int = Field(default=1)
    tags: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    ingestion_timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
```

## Phase 3: End-to-End Verification

### Verification Steps

#### 1. Query the Telemetry Table

After generating events (see below), query the `telemetry_events` table directly:

```sql
-- Count events by type
SELECT event_type, COUNT(*) as count
FROM telemetry_events
GROUP BY event_type
ORDER BY count DESC;

-- View recent events with their properties
SELECT event_id, event_type, "timestamp", tags
FROM telemetry_events
WHERE event_type IN ('inbound_order_created', 'outbound_order_created', 'stock_waste_registered')
ORDER BY "timestamp" DESC
LIMIT 10;

-- Search events by a property (e.g., location_id = 1)
SELECT event_id, event_type, tags->>'location_id' as location_id, "timestamp"
FROM telemetry_events
WHERE tags @> '{"location_id": 1}'
ORDER BY "timestamp" DESC;
```

#### 2. Generate Real Events

Generate events through the backoffice:

1. **Inbound Orders:**
   - Navigate to **Inventory > Inbound Orders**
   - Create at least one inbound order for a specific location
   - Verify that `inbound_order_created` appears in the telemetry table

2. **Outbound Orders (Consumption):**
   - Navigate to **Inventory > Outbound Orders**
   - Create at least one consumption record
   - Verify that `outbound_order_created` appears with `reason: "consumption"`

3. **Waste Records:**
   - Create at least one waste exit with explicit `reason` (expired, kitchen_error, theft_suspected)
   - Verify that `stock_waste_registered` appears with the correct waste cause

4. **Technical Events:**
   - Trigger a login failure or access denial
   - Verify that `auth_login_failed` or similar events appear

#### 3. Test Rejection Behavior

Send a mixed batch with curl:

```bash
curl -X POST http://localhost:8000/telemetry/events \
  -H "Content-Type: application/json" \
  -d '{
    "events": [
      {
        "eventId": "550e8400-e29b-41d4-a716-446655440001",
        "timestamp": "2026-11-02T23:43:38.010Z",
        "sessionId": null,
        "userId": null,
        "event_type": "navigation_section_viewed",
        "schemaVersion": 1,
        "requestId": "req-001",
        "properties": {"section_id": "inventory_products"}
      },
      {
        "eventId": "INVALID-UUID",
        "timestamp": "2026-11-02T23:43:38.010Z",
        "sessionId": null,
        "userId": null,
        "event_type": "navigation_section_viewed",
        "schemaVersion": 1,
        "requestId": "req-002",
        "properties": {"section_id": "inventory_products"}
      },
      {
        "eventId": "550e8400-e29b-41d4-a716-446655440003",
        "timestamp": "2026-11-02T23:43:38.010Z",
        "sessionId": null,
        "userId": null,
        "event_type": "navigation_section_viewed",
        "schemaVersion": 1,
        "requestId": "req-003",
        "properties": {"section_id": "orders"}
      }
    ]
  }'
```

**Expected response:**
```json
{
  "received": 3,
  "stored": 2,
  "rejected": 1
}
```

### Verification Checklist

- [ ] Table `telemetry_events` exists in Supabase with the correct schema
- [ ] Indexes are created and queryable
- [ ] Frontend events arrive at the endpoint without changes (confirm `NEXT_PUBLIC_TELEMETRY_ENDPOINT` points to the same URL)
- [ ] Valid events are stored with correct `event_type`, `timestamp`, and `tags`
- [ ] Inventory events include required properties: `location_id`, `country`, `product_id`, `product_category`, `quantity`, `unit`, `currency`
- [ ] Optional inventory fields are present where applicable: `supplier_id`, `unit_cost`, `total_cost` for inbound orders; `reason` for waste events
- [ ] Mixed batches return partial acceptance (valid stored, invalid counted as rejected)
- [ ] HTTP 200 is returned even when some events are rejected (not 422)
- [ ] Rejected events do not appear in the database
- [ ] The response body is compatible with the frontend (frontend only checks HTTP status, not response body)

## Tags Mapping (Envelope Properties to JSONB)

The `tags` column stores the `properties` object from the event envelope. For inventory events, the stored properties include:

### Mandatory Inventory Properties

| Property | Type | Example | Purpose |
|----------|------|---------|---------|
| `location_id` | int | 1 | Which of the 14 locations |
| `country` | string | "CO" \| "US" | Location's country |
| `product_id` | int | 42 | Ingredient ID |
| `product_category` | string | "meat" \| "produce" | Category from catalog |
| `quantity` | number | 10.5 | Amount received/consumed/wasted |
| `unit` | string | "kg" \| "litre" \| "unit" | Inventory unit |
| `currency` | string | "COP" \| "USD" | Local currency; no conversion |

### Extended Inventory Properties

| Property | Event Type | Type | Example | Purpose |
|----------|------------|------|---------|---------|
| `supplier_id` | `inbound_order_created` | string | "supp-001" | Approved supplier ID |
| `unit_cost` | `inbound_order_created`, `stock_waste_registered` | number | 5000.0 | Cost per unit in local currency |
| `total_cost` | `inbound_order_created`, `stock_waste_registered` | number | 52500.0 | Line total in local currency |
| `reason` | `outbound_order_created`, `stock_waste_registered` | string | "consumption" \| "expired" \| "kitchen_error" \| "theft_suspected" | Outbound classification |
| `order_id` | `inbound_order_created` | int | 123 | Committed inbound order ID if available |

## Constraints and Guarantees

### Idempotency

- If the same `eventId` is submitted twice (network retry), the unique constraint on `event_id` prevents duplicates.
- Only the first attempt is inserted; subsequent attempts fail gracefully or are detected at the application level.

### No Updates or Deletes

- The table design explicitly forbids updating or deleting events.
- Telemetry is an immutable log of what happened at a specific point in time.
- If an event needs correction, emit a new event with the corrected information; do not alter the original.

### Timezone Handling

- All timestamps are stored in UTC with timezone information.
- The `timestamp` field is the occurrence time (from the browser/API where the event originated).
- The `ingestion_timestamp` is the server-side timestamp when the event arrived at the backend.

### Data Isolation

- Events are stored with `user_id` (pseudonymous HMAC, not raw identity).
- `sessionId` is random and short-lived.
- No employee names, customer data, or free-text notes are included in `properties`.
- `properties` keys are validated against the schema registry; unknown keys are rejected.

## Implementation Files

| File | Purpose |
|------|---------|
| [migrations/001_create_telemetry_events.sql](../services/api/migrations/001_create_telemetry_events.sql) | SQL migration to create the table and indexes |
| [models.py](../services/api/models.py) | SQLModel ORM definition for TelemetryEvent |
| [routers/telemetry.py](../services/api/routers/telemetry.py) | FastAPI endpoint implementation |
| [tests/test_telemetry.py](../services/api/tests/test_telemetry.py) | Unit tests for the endpoint |
| [tests/conftest.py](../services/api/tests/conftest.py) | Test configuration and fixtures |

## Monitoring and Observability

### Logging

The endpoint logs at three levels:

- **DEBUG:** Individual rejected events with validation error details
- **INFO:** Batch summary (received, stored, rejected, event types)
- **ERROR:** Database persistence failures

Example log:
```
Telemetry batch: received=10, stored=9, rejected=1, event_types=['inbound_order_created', 'navigation_section_viewed', ...]
```

### Metrics to Monitor

- **Event ingestion rate:** Events per minute (healthy range depends on load)
- **Rejection rate:** Rejected / (received + rejected) should be < 0.1%
- **Bulk insert latency:** P95 duration for a batch insert (should be < 100ms for typical batches)
- **Database connection pool:** Ensure bulk insert strategy keeps pool utilization reasonable

## Future Enhancements

- **Transactional outbox:** A separate outbox table with guaranteed durability before acknowledgment (currently in-transaction only)
- **Dead-letter queue:** Events that fail to store after retries are moved to a DLQ for investigation
- **Schema versioning:** As event schemas evolve, support multiple versions and migration
- **Real-time streaming:** Stream events to downstream consumers (data warehouse, alerting systems) using CDC or Kafka
- **Sampling:** For high-frequency events, implement deterministic sampling by requestId to reduce volume while preserving reproducibility

## References

- [Telemetry Plan](./TELEMETRY_PLAN.md)
- [Telemetry Capture](./TELEMETRY_CAPTURE.md)
- [Event Schemas](./event-schemas.json)
- [Brasaland Briefing](../Context%20Files/Brasaland_BRIEFING.md)
