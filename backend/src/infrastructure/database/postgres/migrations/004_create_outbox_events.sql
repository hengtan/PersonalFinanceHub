-- Migration 004: Outbox Pattern and Event Sourcing

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_type') THEN
    CREATE TYPE event_type AS ENUM (
      'user.registered','user.updated','user.deleted',
      'transaction.created','transaction.updated','transaction.deleted',
      'budget.created','budget.updated',
      'account.created','account.updated',
      'category.created',
      'report.requested','report.completed',
      'notification.send',
      'audit.event'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_status') THEN
    CREATE TYPE event_status AS ENUM ('pending','processing','published','failed','skipped');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS outbox_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type event_type NOT NULL,
  event_version VARCHAR(10) DEFAULT 'v1',
  aggregate_id UUID NOT NULL,
  aggregate_type VARCHAR(100) NOT NULL,
  event_data JSONB NOT NULL,
  event_metadata JSONB DEFAULT '{}',
  status event_status DEFAULT 'pending',
  published_at TIMESTAMP,
  failed_at TIMESTAMP,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  error_message TEXT,
  correlation_id UUID,
  causation_id UUID,
  user_id UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS event_store (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type event_type NOT NULL,
  event_version VARCHAR(10) DEFAULT 'v1',
  stream_id UUID NOT NULL,
  stream_version INTEGER NOT NULL,
  event_data JSONB NOT NULL,
  event_metadata JSONB DEFAULT '{}',
  correlation_id UUID,
  causation_id UUID,
  user_id UUID REFERENCES users(id),
  event_timestamp TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(stream_id, stream_version)
);

CREATE TABLE IF NOT EXISTS event_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stream_id UUID NOT NULL,
  stream_version INTEGER NOT NULL,
  aggregate_type VARCHAR(100) NOT NULL,
  snapshot_data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(stream_id, stream_version)
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key VARCHAR(255) UNIQUE NOT NULL,
  user_id UUID REFERENCES users(id),
  request_path VARCHAR(500),
  request_method VARCHAR(10),
  request_body_hash VARCHAR(255),
  response_status INTEGER,
  response_body JSONB,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type VARCHAR(100) NOT NULL,
  entity_id UUID NOT NULL,
  action VARCHAR(50) NOT NULL,
  changed_fields JSONB,
  old_values JSONB,
  new_values JSONB,
  user_id UUID REFERENCES users(id),
  session_id UUID,
  ip_address INET,
  user_agent TEXT,
  reason TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_name VARCHAR(255) NOT NULL,
  event_category VARCHAR(100),
  severity INTEGER DEFAULT 0,
  message TEXT,
  event_data JSONB DEFAULT '{}',
  stack_trace TEXT,
  service_name VARCHAR(100),
  service_version VARCHAR(50),
  environment VARCHAR(50),
  correlation_id UUID,
  user_id UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  notification_type VARCHAR(50) NOT NULL,
  recipient_user_id UUID NOT NULL REFERENCES users(id),
  subject VARCHAR(500),
  body TEXT NOT NULL,
  template_name VARCHAR(100),
  template_data JSONB DEFAULT '{}',
  recipient_email VARCHAR(255),
  recipient_phone VARCHAR(20),
  status VARCHAR(50) DEFAULT 'pending',
  sent_at TIMESTAMP,
  failed_at TIMESTAMP,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  error_message TEXT,
  scheduled_for TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_outbox_events_updated_at') THEN
    CREATE TRIGGER update_outbox_events_updated_at BEFORE UPDATE ON outbox_events
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_notification_queue_updated_at') THEN
    CREATE TRIGGER update_notification_queue_updated_at BEFORE UPDATE ON notification_queue
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION create_outbox_event(
  p_event_type event_type,
  p_aggregate_id UUID,
  p_aggregate_type VARCHAR,
  p_event_data JSONB,
  p_user_id UUID DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE event_id UUID;
BEGIN
  INSERT INTO outbox_events (
    event_type, aggregate_id, aggregate_type, event_data, user_id, correlation_id
  ) VALUES (
    p_event_type, p_aggregate_id, p_aggregate_type, p_event_data, p_user_id, COALESCE(p_correlation_id, uuid_generate_v4())
  ) RETURNING id INTO event_id;
  RETURN event_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION add_event_to_store(
  p_event_type event_type,
  p_stream_id UUID,
  p_event_data JSONB,
  p_user_id UUID DEFAULT NULL,
  p_correlation_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE event_id UUID; next_version INTEGER;
BEGIN
  SELECT COALESCE(MAX(stream_version),0)+1 INTO next_version FROM event_store WHERE stream_id = p_stream_id;
  INSERT INTO event_store (event_type, stream_id, stream_version, event_data, user_id, correlation_id)
  VALUES (p_event_type, p_stream_id, next_version, p_event_data, p_user_id, COALESCE(p_correlation_id, uuid_generate_v4()))
  RETURNING id INTO event_id;
  RETURN event_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION create_audit_entry(
  p_entity_type VARCHAR, p_entity_id UUID, p_action VARCHAR, p_user_id UUID,
  p_old_values JSONB DEFAULT NULL, p_new_values JSONB DEFAULT NULL, p_changed_fields JSONB DEFAULT NULL
) RETURNS UUID AS $$
DECLARE audit_id UUID;
BEGIN
  INSERT INTO audit_log (entity_type, entity_id, action, user_id, old_values, new_values, changed_fields)
  VALUES (p_entity_type, p_entity_id, p_action, p_user_id, p_old_values, p_new_values, p_changed_fields)
  RETURNING id INTO audit_id;
  RETURN audit_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION queue_notification(
  p_notification_type VARCHAR, p_user_id UUID, p_subject VARCHAR, p_body TEXT,
  p_template_name VARCHAR DEFAULT NULL, p_template_data JSONB DEFAULT '{}', p_scheduled_for TIMESTAMP DEFAULT NOW()
) RETURNS UUID AS $$
DECLARE notification_id UUID; user_email VARCHAR;
BEGIN
  SELECT email INTO user_email FROM users WHERE id = p_user_id;
  INSERT INTO notification_queue (notification_type, recipient_user_id, subject, body, template_name, template_data, recipient_email, scheduled_for)
  VALUES (p_notification_type, p_user_id, p_subject, p_body, p_template_name, p_template_data, user_email, p_scheduled_for)
  RETURNING id INTO notification_id;
  RETURN notification_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION cleanup_expired_records()
RETURNS INTEGER AS $$
DECLARE deleted_count INTEGER := 0;
BEGIN
  DELETE FROM idempotency_keys WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  DELETE FROM audit_log WHERE created_at < NOW() - INTERVAL '1 year';
  DELETE FROM system_events WHERE created_at < NOW() - INTERVAL '6 months';
  DELETE FROM outbox_events WHERE status = 'published' AND published_at < NOW() - INTERVAL '30 days';
  DELETE FROM event_snapshots e1
   WHERE e1.id NOT IN (
     SELECT e2.id FROM event_snapshots e2 WHERE e2.stream_id = e1.stream_id ORDER BY e2.stream_version DESC LIMIT 10
   );
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trigger_transaction_events()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM create_outbox_event('transaction.created', NEW.id, 'transaction', to_jsonb(NEW), NEW.user_id, uuid_generate_v4());
    PERFORM add_event_to_store('transaction.created', NEW.id, to_jsonb(NEW), NEW.user_id);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM create_outbox_event('transaction.updated', NEW.id, 'transaction', jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW)), NEW.user_id, uuid_generate_v4());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM create_outbox_event('transaction.deleted', OLD.id, 'transaction', to_jsonb(OLD), OLD.user_id, uuid_generate_v4());
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'transaction_outbox_events') THEN
    CREATE TRIGGER transaction_outbox_events
      AFTER INSERT OR UPDATE OR DELETE ON transactions
      FOR EACH ROW EXECUTE FUNCTION trigger_transaction_events();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION trigger_user_events()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM create_outbox_event('user.registered', NEW.id, 'user', to_jsonb(NEW) - 'password_hash', NEW.id, uuid_generate_v4());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM create_outbox_event('user.updated', NEW.id, 'user', to_jsonb(NEW) - 'password_hash', NEW.id, uuid_generate_v4());
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'user_outbox_events') THEN
    CREATE TRIGGER user_outbox_events
      AFTER INSERT OR UPDATE ON users
      FOR EACH ROW EXECUTE FUNCTION trigger_user_events();
  END IF;
END $$;

COMMENT ON TABLE outbox_events IS 'Outbox pattern for reliable event publishing to message brokers';
COMMENT ON TABLE event_store IS 'Complete event history for event sourcing and replay';
COMMENT ON TABLE audit_log IS 'Comprehensive audit trail for all system changes';
COMMENT ON TABLE idempotency_keys IS 'Prevents duplicate processing of API requests';
COMMENT ON TABLE notification_queue IS 'Queue for email, SMS, and push notifications';
