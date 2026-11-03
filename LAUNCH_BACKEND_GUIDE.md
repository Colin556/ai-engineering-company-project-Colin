# Launch Backend & Test Telemetry - Quick Start

## Step 1: Launch the Backend

Open a terminal and run:

```bash
cd /workspaces/ai-engineering-company-project-Colin/services/api
DATABASE_URL="sqlite:///./data/test_telemetry.db" uvicorn main:app --reload --port 8000
```

You should see:
```
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Application startup complete
```

## Step 2: Test the Endpoint (in a new terminal)

Use the test script to send events:

```bash
bash /workspaces/ai-engineering-company-project-Colin/scripts/test_telemetry.sh http://localhost:8000
```

Or send a single test batch with curl:

```bash
curl -X POST http://localhost:8000/telemetry/events \
  -H "Content-Type: application/json" \
  -d '{
  "events": [
    {
      "eventId": "550e8400-e29b-41d4-a716-446655440001",
      "timestamp": "2026-11-03T00:03:07.764442+00:00",
      "sessionId": "test-session-1",
      "userId": "user-hmac-test1",
      "event_type": "inbound_order_created",
      "schemaVersion": 1,
      "requestId": "req-001",
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
}'
```

Expected response:
```json
{
  "received": 1,
  "stored": 1,
  "rejected": 0
}
```

## Step 3: Query the Database

Once events are stored, query them in SQLite:

```bash
sqlite3 /workspaces/ai-engineering-company-project-Colin/services/api/data/test_telemetry.db

# Inside SQLite:
SELECT event_type, COUNT(*) as count FROM telemetry_events GROUP BY event_type;
SELECT event_id, event_type, timestamp, json_extract(tags, '$.location_id') as location_id 
FROM telemetry_events LIMIT 5;
```

## Expected Behavior

✅ **Test 1: Send 5 valid events**
- Response: `{ "received": 5, "stored": 5, "rejected": 0 }`
- All 5 events stored in telemetry_events table

✅ **Test 2: Send 3 events with 1 invalid UUID**
- Response: `{ "received": 3, "stored": 2, "rejected": 1 }`
- Partial acceptance: 2 valid events stored, 1 rejected

✅ **Database Verification**
- Count events by type
- View event properties in tags JSONB
- Query by location_id using JSON functions

## Verification Checklist

After running these tests, you should be able to confirm:

- [ ] Backend runs without errors
- [ ] Endpoint returns `{ received, stored, rejected }`
- [ ] HTTP 200 even when events are rejected
- [ ] Events stored in telemetry_events table
- [ ] Inventory events have correct properties (location_id, country, product_id, etc.)
- [ ] Partial acceptance works (invalid events don't block valid ones)
- [ ] Database queries work (count by event_type, search by properties)

---

## Files Ready

- **Test Script:** `/workspaces/ai-engineering-company-project-Colin/scripts/test_telemetry.sh`
- **Backend Code:** `/workspaces/ai-engineering-company-project-Colin/services/api/routers/telemetry.py`
- **Database:** `/workspaces/ai-engineering-company-project-Colin/services/api/data/test_telemetry.db` (created after first run)

---

**You're ready for Phase 3 E2E Verification! 🚀**
