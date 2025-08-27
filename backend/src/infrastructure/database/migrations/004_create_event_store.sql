-- backend/src/infrastructure/database/migrations/004_create_event_store.sql

-- Event Store table for domain events
CREATE TABLE IF NOT EXISTS event_store (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL UNIQUE,
    event_type VARCHAR(100) NOT NULL,
    aggregate_id VARCHAR(255) NOT NULL,
    aggregate_type VARCHAR(50) NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    user_id VARCHAR(255),
    event_data JSONB NOT NULL,
    metadata JSONB DEFAULT '{}',
    occurred_on TIMESTAMP WITH TIME ZONE NOT NULL,
    stored_on TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_event_store_aggregate_id ON event_store (aggregate_id);
CREATE INDEX IF NOT EXISTS idx_event_store_aggregate_type ON event_store (aggregate_type);
CREATE INDEX IF NOT EXISTS idx_event_store_event_type ON event_store (event_type);
CREATE INDEX IF NOT EXISTS idx_event_store_user_id ON event_store (user_id);
CREATE INDEX IF NOT EXISTS idx_event_store_occurred_on ON event_store (occurred_on);
CREATE INDEX IF NOT EXISTS idx_event_store_stored_on ON event_store (stored_on);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_event_store_aggregate_version ON event_store (aggregate_id, version);
CREATE INDEX IF NOT EXISTS idx_event_store_user_occurred ON event_store (user_id, occurred_on DESC);
CREATE INDEX IF NOT EXISTS idx_event_store_type_occurred ON event_store (event_type, occurred_on DESC);

-- GIN index for JSONB data
CREATE INDEX IF NOT EXISTS idx_event_store_event_data ON event_store USING GIN (event_data);
CREATE INDEX IF NOT EXISTS idx_event_store_metadata ON event_store USING GIN (metadata);

-- Audit trail view for easier querying
CREATE OR REPLACE VIEW audit_trail AS
SELECT 
    es.id,
    es.event_id,
    es.event_type,
    es.aggregate_id,
    es.aggregate_type,
    es.user_id,
    es.occurred_on,
    es.stored_on,
    -- Extract commonly accessed fields from event_data
    es.event_data->>'transactionId' as transaction_id,
    (es.event_data->'transaction'->>'amount')::numeric as transaction_amount,
    es.event_data->'transaction'->>'type' as transaction_type,
    es.event_data->'transaction'->>'description' as transaction_description,
    es.event_data->>'reason' as event_reason,
    es.metadata->>'source' as event_source
FROM event_store es
ORDER BY es.occurred_on DESC;

-- User activity log view
CREATE OR REPLACE VIEW user_activity_log AS
SELECT 
    es.user_id,
    es.event_type,
    es.aggregate_type,
    es.aggregate_id,
    es.occurred_on,
    CASE 
        WHEN es.event_type = 'TransactionCreated' THEN 'Created transaction: ' || (es.event_data->'transaction'->>'description')
        WHEN es.event_type = 'TransactionUpdated' THEN 'Updated transaction: ' || (es.event_data->'newTransaction'->>'description')
        WHEN es.event_type = 'TransactionDeleted' THEN 'Deleted transaction: ' || (es.event_data->'transaction'->>'description')
        WHEN es.event_type = 'TransactionPaid' THEN 'Marked transaction as paid: ' || (es.event_data->'transaction'->>'description')
        WHEN es.event_type = 'TransactionCancelled' THEN 'Cancelled transaction: ' || (es.event_data->'transaction'->>'description')
        ELSE es.event_type || ' event'
    END as activity_description,
    es.event_data,
    es.metadata
FROM event_store es
WHERE es.user_id IS NOT NULL
ORDER BY es.occurred_on DESC;

-- Event statistics view
CREATE OR REPLACE VIEW event_statistics AS
SELECT 
    DATE(es.occurred_on) as event_date,
    es.event_type,
    es.aggregate_type,
    COUNT(*) as event_count,
    COUNT(DISTINCT es.user_id) as unique_users,
    COUNT(DISTINCT es.aggregate_id) as unique_aggregates
FROM event_store es
GROUP BY DATE(es.occurred_on), es.event_type, es.aggregate_type
ORDER BY event_date DESC, event_count DESC;

-- Function to clean old events (for maintenance)
CREATE OR REPLACE FUNCTION clean_old_events(days_to_keep INTEGER DEFAULT 365)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM event_store 
    WHERE stored_on < NOW() - INTERVAL '1 day' * days_to_keep;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get aggregate events
CREATE OR REPLACE FUNCTION get_aggregate_events(
    aggregate_id_param VARCHAR(255),
    from_version INTEGER DEFAULT 1
)
RETURNS TABLE (
    event_id UUID,
    event_type VARCHAR(100),
    version INTEGER,
    event_data JSONB,
    occurred_on TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        es.event_id,
        es.event_type,
        es.version,
        es.event_data,
        es.occurred_on
    FROM event_store es
    WHERE es.aggregate_id = aggregate_id_param
      AND es.version >= from_version
    ORDER BY es.version ASC;
END;
$$ LANGUAGE plpgsql;

-- Function to get user activity summary
CREATE OR REPLACE FUNCTION get_user_activity_summary(
    user_id_param VARCHAR(255),
    from_date TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '30 days',
    to_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)
RETURNS TABLE (
    event_type VARCHAR(100),
    event_count BIGINT,
    first_occurrence TIMESTAMP WITH TIME ZONE,
    last_occurrence TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        es.event_type,
        COUNT(*) as event_count,
        MIN(es.occurred_on) as first_occurrence,
        MAX(es.occurred_on) as last_occurrence
    FROM event_store es
    WHERE es.user_id = user_id_param
      AND es.occurred_on BETWEEN from_date AND to_date
    GROUP BY es.event_type
    ORDER BY event_count DESC;
END;
$$ LANGUAGE plpgsql;