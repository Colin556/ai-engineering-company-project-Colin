-- Migration: Create telemetry_events table
-- Phase 1: Storage table for telemetry events
-- 
-- This table stores validated telemetry events with the following characteristics:
-- - Write-only, never updated or deleted (events are immutable facts)
-- - Fixed columns support analytical queries (event_type, timestamp, service)
-- - tags JSONB column stores envelope properties without schema alteration
-- - Three indexes support query patterns: timestamp, event_type, and JSONB tags

CREATE TABLE IF NOT EXISTS telemetry_events (
    id BIGSERIAL PRIMARY KEY,
    event_id UUID NOT NULL UNIQUE,
    event_type VARCHAR(100) NOT NULL,
    "timestamp" TIMESTAMPTZ NOT NULL,
    service VARCHAR(50) DEFAULT 'api',
    session_id VARCHAR(255),
    user_id VARCHAR(255),
    request_id VARCHAR(255),
    schema_version INTEGER NOT NULL DEFAULT 1,
    tags JSONB NOT NULL DEFAULT '{}'::jsonb,
    ingestion_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index on timestamp for time-range queries (essential for analytics)
CREATE INDEX IF NOT EXISTS idx_telemetry_events_timestamp 
    ON telemetry_events ("timestamp" DESC);

-- Index on event_type for event-based aggregations
CREATE INDEX IF NOT EXISTS idx_telemetry_events_type 
    ON telemetry_events (event_type);

-- GIN index on tags JSONB for efficient property searches
-- Supports queries like: tags @> '{"location_id": 1}'
CREATE INDEX IF NOT EXISTS idx_telemetry_events_tags 
    ON telemetry_events USING GIN (tags);

-- Composite index for common analytical queries: event_type + timestamp
CREATE INDEX IF NOT EXISTS idx_telemetry_events_type_timestamp 
    ON telemetry_events (event_type, "timestamp" DESC);

-- Index on event_id for idempotency checks and event lookups
CREATE INDEX IF NOT EXISTS idx_telemetry_events_event_id 
    ON telemetry_events (event_id);

-- Index on request_id for distributed tracing
CREATE INDEX IF NOT EXISTS idx_telemetry_events_request_id 
    ON telemetry_events (request_id);

-- Ensure no updates or deletes: telemetry is immutable
-- Note: This is enforced at the application layer; database permissions can further restrict this
COMMENT ON TABLE telemetry_events IS 
    'Immutable telemetry event log. Events are persisted once and never modified. '
    'The tags column stores event-specific properties validated against the schema registry.';

COMMENT ON COLUMN telemetry_events.event_id IS 
    'Unique UUID per event; preserves identity across retries for idempotency.';

COMMENT ON COLUMN telemetry_events.event_type IS 
    'Stable lower-case entity_action taxonomy (e.g., inbound_order_created, auth_login_failed).';

COMMENT ON COLUMN telemetry_events.timestamp IS 
    'Occurrence time in UTC (not ingestion time); ISO 8601 format with timezone.';

COMMENT ON COLUMN telemetry_events.tags IS 
    'Event-specific properties as JSONB; allowlist keys only per event schema. '
    'Stores properties like location_id, product_category, quantity, unit, currency for inventory events.';

COMMENT ON COLUMN telemetry_events.user_id IS 
    'Pseudonymous user identifier (keyed HMAC, not raw auth ID). Null for unauthenticated/system events.';

COMMENT ON COLUMN telemetry_events.session_id IS 
    'Random short-lived session identifier. Null for system events or when no session.';

COMMENT ON COLUMN telemetry_events.request_id IS 
    'Correlation ID propagated through browser, API, and logs for distributed tracing.';

COMMENT ON COLUMN telemetry_events.ingestion_timestamp IS 
    'Server-side ingestion timestamp; tracks when the event arrived at the backend.';
