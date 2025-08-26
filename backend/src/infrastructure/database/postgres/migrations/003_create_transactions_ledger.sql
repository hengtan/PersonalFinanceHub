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
