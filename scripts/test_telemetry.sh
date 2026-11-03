#!/bin/bash
# Test Telemetry Events - Send test data to POST /telemetry/events

API_URL="${1:-http://localhost:8000}"
ENDPOINT="${API_URL}/telemetry/events"

echo "╔═══════════════════════════════════════════════════════════════════════════════╗"
echo "║                    TELEMETRY EVENTS - TEST SCRIPT                            ║"
echo "╚═══════════════════════════════════════════════════════════════════════════════╝"
echo ""
echo "API Endpoint: $ENDPOINT"
echo ""

# Test 1: Send valid batch of 5 events
echo "📤 Test 1: Send batch of 5 valid events"
echo "─────────────────────────────────────────────────────────────────────────────────"

curl -X POST "$ENDPOINT" \
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
    },
    {
      "eventId": "550e8400-e29b-41d4-a716-446655440002",
      "timestamp": "2026-11-03T00:03:07.764499+00:00",
      "sessionId": "test-session-1",
      "userId": "user-hmac-test1",
      "event_type": "outbound_order_created",
      "schemaVersion": 1,
      "requestId": "req-002",
      "properties": {
        "location_id": 1,
        "country": "CO",
        "product_id": 42,
        "product_category": "meat",
        "quantity": 2.5,
        "unit": "kg",
        "currency": "COP",
        "reason": "consumption"
      }
    },
    {
      "eventId": "550e8400-e29b-41d4-a716-446655440003",
      "timestamp": "2026-11-03T00:03:07.764509+00:00",
      "sessionId": "test-session-1",
      "userId": "user-hmac-test1",
      "event_type": "stock_waste_registered",
      "schemaVersion": 1,
      "requestId": "req-003",
      "properties": {
        "location_id": 1,
        "country": "CO",
        "product_id": 42,
        "product_category": "meat",
        "quantity": 0.5,
        "unit": "kg",
        "currency": "COP",
        "reason": "expired",
        "unit_cost": 5000.0,
        "total_cost": 2500.0
      }
    },
    {
      "eventId": "550e8400-e29b-41d4-a716-446655440004",
      "timestamp": "2026-11-03T00:03:07.764516+00:00",
      "sessionId": "test-session-2",
      "userId": "user-hmac-test2",
      "event_type": "navigation_section_viewed",
      "schemaVersion": 1,
      "requestId": "req-004",
      "properties": {
        "section_id": "inventory_products"
      }
    },
    {
      "eventId": "550e8400-e29b-41d4-a716-446655440005",
      "timestamp": "2026-11-03T00:03:07.764523+00:00",
      "sessionId": null,
      "userId": null,
      "event_type": "auth_login_failed",
      "schemaVersion": 1,
      "requestId": "req-005",
      "properties": {
        "reason": "invalid_credentials",
        "username": "user@brasaland.co"
      }
    }
  ]
}'

echo ""
echo ""
echo "📤 Test 2: Send batch with partial acceptance (3 valid + 1 invalid)"
echo "─────────────────────────────────────────────────────────────────────────────────"

curl -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d '{
  "events": [
    {
      "eventId": "550e8400-e29b-41d4-a716-446655440010",
      "timestamp": "2026-11-03T00:03:07.764442+00:00",
      "sessionId": "test-session-3",
      "userId": "user-hmac-test3",
      "event_type": "inbound_order_created",
      "schemaVersion": 1,
      "requestId": "req-010",
      "properties": {
        "location_id": 2,
        "country": "US",
        "product_id": 50,
        "product_category": "produce",
        "quantity": 20.0,
        "unit": "kg",
        "currency": "USD",
        "supplier_id": "supp-002",
        "unit_cost": 10.0,
        "total_cost": 200.0
      }
    },
    {
      "eventId": "INVALID-UUID-HERE",
      "timestamp": "2026-11-03T00:03:07.764442+00:00",
      "sessionId": "test-session-3",
      "userId": "user-hmac-test3",
      "event_type": "outbound_order_created",
      "schemaVersion": 1,
      "requestId": "req-011",
      "properties": {
        "location_id": 2,
        "country": "US",
        "product_id": 50,
        "product_category": "produce",
        "quantity": 5.0,
        "unit": "kg",
        "currency": "USD",
        "reason": "consumption"
      }
    },
    {
      "eventId": "550e8400-e29b-41d4-a716-446655440012",
      "timestamp": "2026-11-03T00:03:07.764442+00:00",
      "sessionId": "test-session-3",
      "userId": "user-hmac-test3",
      "event_type": "stock_waste_registered",
      "schemaVersion": 1,
      "requestId": "req-012",
      "properties": {
        "location_id": 2,
        "country": "US",
        "product_id": 50,
        "product_category": "produce",
        "quantity": 1.0,
        "unit": "kg",
        "currency": "USD",
        "reason": "kitchen_error",
        "unit_cost": 10.0,
        "total_cost": 10.0
      }
    }
  ]
}'

echo ""
echo ""
echo "✅ Tests completed!"
echo ""
echo "Expected results:"
echo "  Test 1: { \"received\": 5, \"stored\": 5, \"rejected\": 0 }"
echo "  Test 2: { \"received\": 3, \"stored\": 2, \"rejected\": 1 } (invalid UUID)"
echo ""
