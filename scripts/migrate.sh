#!/bin/bash
# Personal Finance Hub - Database Migration Script (container-native)
# Pateta o DEV - Database Schema Management

set -e

# ===== Colors =====
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status()  { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error()   { echo -e "${RED}[ERROR]${NC} $1"; }

# ===== Config =====
POSTGRES_HOST="localhost"         # usado dentro do container
POSTGRES_PORT="5432"
POSTGRES_DB="personal_finance"
POSTGRES_USER="pfh_admin"
POSTGRES_PASSWORD="pfh_secure_2024"
POSTGRES_CONTAINER="pfh-postgres-master"

MONGO_PRIMARY_CONTAINER="pfh-mongo-primary"
MONGO_DB="personal_finance_read"

MIGRATIONS_DIR="backend/src/infrastructure/database/postgres/migrations"

# ===== Helpers p/ Postgres via docker exec =====
require_container() {
  local name="$1"
  if ! docker ps --format '{{.Names}}' | grep -q "^${name}$"; then
    print_error "Container ${name} não está em execução. Suba com: docker compose up -d ${name}"
    exit 1
  fi
}

wait_for_postgres() {
  print_status "Waiting for PostgreSQL to be ready (inside container ${POSTGRES_CONTAINER})..."
  require_container "${POSTGRES_CONTAINER}"

  local timeout=60
  while ! docker exec "${POSTGRES_CONTAINER}" pg_isready -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" >/dev/null 2>&1; do
    sleep 2
    timeout=$((timeout - 2))
    if [ $timeout -le 0 ]; then
      print_error "PostgreSQL is not ready after 60 seconds"
      # Mostra um hint útil
      print_status "Dica: verifique logs com: docker logs -f ${POSTGRES_CONTAINER}"
      print_status "Teste manual: docker exec -it ${POSTGRES_CONTAINER} pg_isready -h ${POSTGRES_HOST} -U ${POSTGRES_USER} -d ${POSTGRES_DB}"
      exit 1
    fi
  done
  print_success "PostgreSQL is ready!"
}

execute_psql() {
  # Executa comando SQL usando psql DENTRO do container
  docker exec -e PGPASSWORD="${POSTGRES_PASSWORD}" -i "${POSTGRES_CONTAINER}" \
    psql -v ON_ERROR_STOP=1 -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -c "$1"
}

execute_psql_file() {
  # Envia arquivo via STDIN para o psql dentro do container
  local file="$1"
  if [ ! -f "$file" ]; then
    print_error "Arquivo de migração não encontrado: $file"
    return 1
  fi
  docker exec -e PGPASSWORD="${POSTGRES_PASSWORD}" -i "${POSTGRES_CONTAINER}" \
    psql -v ON_ERROR_STOP=1 -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -f - < "$file"
}

# ===== Criação dos arquivos de migração =====
create_postgres_migrations() {
  print_status "Creating PostgreSQL migration files..."
  mkdir -p "${MIGRATIONS_DIR}"

  # 001 - Users & Auth
  cat > "${MIGRATIONS_DIR}/001_create_users_auth.sql" <<'EOF'
-- Migration 001: Users and Authentication System
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  date_of_birth DATE,
  profile_image_url VARCHAR(500),
  timezone VARCHAR(50) DEFAULT 'UTC',
  currency VARCHAR(3) DEFAULT 'USD',
  language VARCHAR(5) DEFAULT 'en',
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','inactive','suspended')),
  email_verified BOOLEAN DEFAULT FALSE,
  email_verified_at TIMESTAMP,
  two_factor_enabled BOOLEAN DEFAULT FALSE,
  two_factor_secret VARCHAR(255),
  last_login_at TIMESTAMP,
  last_login_ip INET,
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS user_refresh_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  revoked BOOLEAN DEFAULT FALSE,
  revoked_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  user_agent TEXT,
  ip_address INET
);

CREATE TABLE IF NOT EXISTS user_password_resets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  ip_address INET
);

CREATE TABLE IF NOT EXISTS user_email_verifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_token VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  last_accessed_at TIMESTAMP DEFAULT NOW(),
  user_agent TEXT,
  ip_address INET,
  is_active BOOLEAN DEFAULT TRUE
);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_users_updated_at'
  ) THEN
    CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON user_refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON user_refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON user_refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_password_resets_user_id ON user_password_resets(user_id);
CREATE INDEX IF NOT EXISTS idx_password_resets_token_hash ON user_password_resets(token_hash);
CREATE INDEX IF NOT EXISTS idx_email_verifications_user_id ON user_email_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verifications_token_hash ON user_email_verifications(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON user_sessions(expires_at);

COMMENT ON TABLE users IS 'Core user accounts and authentication data';
COMMENT ON TABLE user_refresh_tokens IS 'JWT refresh tokens for secure token rotation';
COMMENT ON TABLE user_password_resets IS 'Password reset tokens for account recovery';
COMMENT ON TABLE user_email_verifications IS 'Email verification tokens for new accounts';
COMMENT ON TABLE user_sessions IS 'Active user sessions tracking';
EOF

  # 002 - Accounts & Categories (inclui financial_institutions, accounts, categories, tags, merchants)
  cat > "${MIGRATIONS_DIR}/002_create_accounts_categories.sql" <<'EOF'
-- Migration 002: Accounts and Categories System

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_type') THEN
    CREATE TYPE account_type AS ENUM ('checking','savings','credit_card','investment','cash','loan','mortgage','other');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_status') THEN
    CREATE TYPE account_status AS ENUM ('active','inactive','closed');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS financial_institutions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50),
  country_code VARCHAR(2) DEFAULT 'US',
  website_url VARCHAR(500),
  logo_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  financial_institution_id UUID REFERENCES financial_institutions(id),
  name VARCHAR(255) NOT NULL,
  account_type account_type NOT NULL,
  status account_status DEFAULT 'active',
  currency VARCHAR(3) DEFAULT 'USD',
  current_balance DECIMAL(15,2) DEFAULT 0.00,
  available_balance DECIMAL(15,2) DEFAULT 0.00,
  credit_limit DECIMAL(15,2),
  minimum_payment DECIMAL(15,2),
  statement_closing_day INTEGER,
  payment_due_day INTEGER,
  include_in_net_worth BOOLEAN DEFAULT TRUE,
  is_primary BOOLEAN DEFAULT FALSE,
  external_account_id VARCHAR(255),
  last_synced_at TIMESTAMP,
  sync_enabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES categories(id),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  color VARCHAR(7),
  icon VARCHAR(50),
  category_type VARCHAR(20) DEFAULT 'expense' CHECK (category_type IN ('income','expense','transfer')),
  is_system BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  monthly_budget_default DECIMAL(10,2) DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL,
  color VARCHAR(7),
  description TEXT,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS merchants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  category_id UUID REFERENCES categories(id),
  website_url VARCHAR(500),
  logo_url VARCHAR(500),
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(100),
  country VARCHAR(100),
  postal_code VARCHAR(20),
  phone VARCHAR(20),
  tax_id VARCHAR(50),
  keywords TEXT[],
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_accounts_updated_at'
  ) THEN
    CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON accounts
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_categories_updated_at'
  ) THEN
    CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_merchants_updated_at'
  ) THEN
    CREATE TRIGGER update_merchants_updated_at BEFORE UPDATE ON merchants
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_type_status ON accounts(account_type, status);
CREATE INDEX IF NOT EXISTS idx_accounts_institution ON accounts(financial_institution_id);
CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_type ON categories(category_type);
CREATE INDEX IF NOT EXISTS idx_categories_system ON categories(is_system);
CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags(user_id);
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
CREATE INDEX IF NOT EXISTS idx_merchants_name ON merchants(name);
CREATE INDEX IF NOT EXISTS idx_merchants_category ON merchants(category_id);

COMMENT ON TABLE accounts IS 'User financial accounts (bank, credit cards, investments)';
COMMENT ON TABLE categories IS 'Transaction categories for budgeting and reporting';
COMMENT ON TABLE tags IS 'Flexible tags for transaction labeling';
COMMENT ON TABLE merchants IS 'Merchant/payee information with auto-categorization';
EOF

  # 003 - Transactions & Ledger & Budgets & Recurring
  cat > "${MIGRATIONS_DIR}/003_create_transactions_ledger.sql" <<'EOF'
-- Migration 003: Transactions and Double-Entry Ledger System

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaction_type') THEN
    CREATE TYPE transaction_type AS ENUM ('income','expense','transfer','adjustment');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaction_status') THEN
    CREATE TYPE transaction_status AS ENUM ('pending','cleared','reconciled','cancelled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ledger_entry_type') THEN
    CREATE TYPE ledger_entry_type AS ENUM ('debit','credit');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  description VARCHAR(500) NOT NULL,
  amount DECIMAL(15,2) NOT NULL CHECK (amount != 0),
  transaction_type transaction_type NOT NULL,
  transaction_date DATE NOT NULL,
  created_date TIMESTAMP DEFAULT NOW(),
  category_id UUID REFERENCES categories(id),
  merchant_id UUID REFERENCES merchants(id),
  account_id UUID NOT NULL REFERENCES accounts(id),
  transfer_account_id UUID REFERENCES accounts(id),
  status transaction_status DEFAULT 'pending',
  reconciled_at TIMESTAMP,
  reference_number VARCHAR(100),
  notes TEXT,
  location TEXT,
  external_transaction_id VARCHAR(255),
  import_batch_id UUID,
  is_duplicate BOOLEAN DEFAULT FALSE,
  duplicate_of UUID REFERENCES transactions(id),
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_rule JSONB,
  parent_transaction_id UUID REFERENCES transactions(id),
  is_split BOOLEAN DEFAULT FALSE,
  split_parent_id UUID REFERENCES transactions(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS transaction_tags (
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (transaction_id, tag_id)
);

CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  account_type VARCHAR(50) NOT NULL,
  parent_id UUID REFERENCES chart_of_accounts(id),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_code VARCHAR(20) NOT NULL REFERENCES chart_of_accounts(code),
  entry_type ledger_entry_type NOT NULL,
  amount DECIMAL(15,2) NOT NULL CHECK (amount >= 0),
  description VARCHAR(500),
  reference VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS budgets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period VARCHAR(7) NOT NULL,
  total_income_budget DECIMAL(15,2) DEFAULT 0.00,
  total_expense_budget DECIMAL(15,2) DEFAULT 0.00,
  is_active BOOLEAN DEFAULT TRUE,
  is_template BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, period)
);

CREATE TABLE IF NOT EXISTS budget_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  budget_id UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  budgeted_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  percentage_of_income DECIMAL(5,2),
  allow_rollover BOOLEAN DEFAULT FALSE,
  rollover_amount DECIMAL(10,2) DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(budget_id, category_id)
);

CREATE TABLE IF NOT EXISTS recurring_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description VARCHAR(500),
  amount DECIMAL(15,2) NOT NULL,
  transaction_type transaction_type NOT NULL,
  account_id UUID NOT NULL REFERENCES accounts(id),
  category_id UUID REFERENCES categories(id),
  merchant_id UUID REFERENCES merchants(id),
  frequency VARCHAR(20) NOT NULL,
  interval_count INTEGER DEFAULT 1,
  day_of_month INTEGER,
  day_of_week INTEGER,
  start_date DATE NOT NULL,
  end_date DATE,
  next_due_date DATE,
  is_active BOOLEAN DEFAULT TRUE,
  auto_create BOOLEAN DEFAULT FALSE,
  remind_days_before INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_transactions_updated_at') THEN
    CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_budgets_updated_at') THEN
    CREATE TRIGGER update_budgets_updated_at BEFORE UPDATE ON budgets
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_budget_categories_updated_at') THEN
    CREATE TRIGGER update_budget_categories_updated_at BEFORE UPDATE ON budget_categories
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_recurring_transactions_updated_at') THEN
    CREATE TRIGGER update_recurring_transactions_updated_at BEFORE UPDATE ON recurring_transactions
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Seed básico do plano de contas (idempotente)
INSERT INTO chart_of_accounts (code, name, account_type)
VALUES
  ('1000','Cash and Cash Equivalents','asset'),
  ('1100','Checking Accounts','asset'),
  ('1200','Savings Accounts','asset'),
  ('1300','Investment Accounts','asset'),
  ('1400','Other Assets','asset'),
  ('2000','Credit Cards','liability'),
  ('2100','Loans','liability'),
  ('2200','Mortgage','liability'),
  ('2300','Other Liabilities','liability'),
  ('3000','Opening Balance Equity','equity'),
  ('3100','Retained Earnings','equity'),
  ('4000','Salary Income','revenue'),
  ('4100','Investment Income','revenue'),
  ('4200','Other Income','revenue'),
  ('5000','Food & Dining','expense'),
  ('5100','Transportation','expense'),
  ('5200','Shopping','expense'),
  ('5300','Entertainment','expense'),
  ('5400','Bills & Utilities','expense'),
  ('5500','Healthcare','expense'),
  ('5600','Education','expense'),
  ('5700','Travel','expense'),
  ('5800','Housing','expense'),
  ('5900','Other Expenses','expense')
ON CONFLICT (code) DO NOTHING;

-- Função de lançamentos em partida dobrada
CREATE OR REPLACE FUNCTION create_ledger_entries()
RETURNS TRIGGER AS $$
BEGIN
  -- Income
  IF NEW.transaction_type = 'income' THEN
    INSERT INTO ledger_entries (transaction_id, user_id, account_code, entry_type, amount, description, created_by)
    VALUES (NEW.id, NEW.user_id, '1100', 'debit',  ABS(NEW.amount), NEW.description, NEW.created_by);
    INSERT INTO ledger_entries (transaction_id, user_id, account_code, entry_type, amount, description, created_by)
    VALUES (NEW.id, NEW.user_id, '4000', 'credit', ABS(NEW.amount), NEW.description, NEW.created_by);

  -- Expense
  ELSIF NEW.transaction_type = 'expense' THEN
    INSERT INTO ledger_entries (transaction_id, user_id, account_code, entry_type, amount, description, created_by)
    VALUES (NEW.id, NEW.user_id, '5000', 'debit',  ABS(NEW.amount), NEW.description, NEW.created_by);
    INSERT INTO ledger_entries (transaction_id, user_id, account_code, entry_type, amount, description, created_by)
    VALUES (NEW.id, NEW.user_id, '1100', 'credit', ABS(NEW.amount), NEW.description, NEW.created_by);

  -- Transfer
  ELSIF NEW.transaction_type = 'transfer' AND NEW.transfer_account_id IS NOT NULL THEN
    INSERT INTO ledger_entries (transaction_id, user_id, account_code, entry_type, amount, description, created_by)
    VALUES (NEW.id, NEW.user_id, '1100', 'debit',  ABS(NEW.amount), NEW.description, NEW.created_by);
    INSERT INTO ledger_entries (transaction_id, user_id, account_code, entry_type, amount, description, created_by)
    VALUES (NEW.id, NEW.user_id, '1100', 'credit', ABS(NEW.amount), NEW.description, NEW.created_by);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'create_ledger_entries_trigger') THEN
    CREATE TRIGGER create_ledger_entries_trigger
      AFTER INSERT ON transactions
      FOR EACH ROW EXECUTE FUNCTION create_ledger_entries();
  END IF;
END $$;

COMMENT ON TABLE transactions IS 'Main transaction records with categorization and metadata';
COMMENT ON TABLE ledger_entries IS 'Double-entry bookkeeping ledger for financial accuracy';
COMMENT ON TABLE budgets IS 'Monthly budget planning and tracking';
COMMENT ON TABLE recurring_transactions IS 'Templates for recurring income and expenses';
EOF

  # 004 - Outbox / Event Store / Audit / Notification
  cat > "${MIGRATIONS_DIR}/004_create_outbox_events.sql" <<'EOF'
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
EOF

  print_success "PostgreSQL migration files created!"
}

# ===== MongoDB (apenas ping) =====
setup_mongodb() {
  print_status "Setting up MongoDB (ping only)..."
  require_container "${MONGO_PRIMARY_CONTAINER}"

  local timeout=60
  while ! docker exec "${MONGO_PRIMARY_CONTAINER}" mongosh --eval "db.adminCommand('ping')" >/dev/null 2>&1; do
    sleep 2
    timeout=$((timeout - 2))
    if [ $timeout -le 0 ]; then
      print_error "MongoDB is not ready after 60 seconds"
      exit 1
    fi
  done
  print_success "MongoDB is ready!"
  print_success "MongoDB setup completed!"
}

# ===== Verificação =====
verify_setup() {
  print_status "Verifying database setup..."

  # Contagem de tabelas
  local output
  output=$(execute_psql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null || true)
  local table_count
  table_count=$(echo "$output" | grep -Eo '[0-9]+' | head -1)
  print_status "PostgreSQL tables created: ${table_count:-0}"

  # Coleções do Mongo
  local collection_count
  collection_count=$(docker exec "${MONGO_PRIMARY_CONTAINER}" mongosh --quiet "${MONGO_DB}" --eval "db.runCommand('listCollections').cursor.firstBatch.length" 2>/dev/null || echo "0")
  print_status "MongoDB collections created: $collection_count"

  if [ "${table_count:-0}" -gt "0" ] && [ "$collection_count" -ge "0" ]; then
    print_success "Database setup verification passed!"
  else
    print_warning "Database setup verification incomplete. Please check logs."
  fi
}

# ===== Execução das migrações =====
run_migrations() {
  print_status "Running database migrations..."
  wait_for_postgres

  # Executa cada .sql em ordem
  for migration in $(ls -1 "${MIGRATIONS_DIR}"/*.sql | sort); do
    local name
    name=$(basename "$migration")
    print_status "Running migration: $name"
    if execute_psql_file "$migration"; then
      print_success "Migration $name completed successfully!"
    else
      print_error "Migration $name failed!"
      exit 1
    fi
  done

  print_success "All migrations completed successfully!"
}

# ===== Main =====
main() {
  echo "=============================================="
  echo "🗃️  Personal Finance Hub - Database Migration"
  echo "   Pateta o DEV - Database Schema Setup"
  echo "=============================================="
  echo

  create_postgres_migrations
  run_migrations
  setup_mongodb
  verify_setup

  echo
  print_success "🎉 Database migration completed successfully!"
  echo "=============================================="
  echo
  print_status "Database Summary:"
  echo "  📊 PostgreSQL (Write): localhost:${POSTGRES_PORT}"
  echo "  📖 MongoDB (Read): localhost:27017"
  echo "  🔄 Redis (Cache): localhost:6379"
  echo
  print_status "Next steps:"
  echo "  1. Run seed data: ./scripts/seed-data.sh"
  echo "  2. Start backend: cd backend && npm run dev"
  echo
}

if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
  main "$@"
fi