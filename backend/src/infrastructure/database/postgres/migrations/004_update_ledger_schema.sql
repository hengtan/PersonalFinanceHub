-- Migration 004: Update Ledger Schema for Advanced Double-Entry Bookkeeping

-- Create journal entry status enum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'journal_entry_status') THEN
    CREATE TYPE journal_entry_status AS ENUM ('DRAFT','POSTED','REVERSED','ERROR');
  END IF;
END $$;

-- Create account type enum  
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_type') THEN
    CREATE TYPE account_type AS ENUM ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE');
  END IF;
END $$;

-- Create entry type enum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'entry_type') THEN
    CREATE TYPE entry_type AS ENUM ('DEBIT','CREDIT');
  END IF;
END $$;

-- Create reference type enum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reference_type') THEN
    CREATE TYPE reference_type AS ENUM ('TRANSACTION','BUDGET','CATEGORY','USER','ACCOUNT');
  END IF;
END $$;

-- Create journal_entries table
CREATE TABLE IF NOT EXISTS journal_entries (
  id VARCHAR(255) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  transaction_id VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  reference VARCHAR(255),
  status journal_entry_status DEFAULT 'DRAFT',
  total_amount DECIMAL(15,4) NOT NULL CHECK (total_amount >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'BRL',
  posted_at TIMESTAMP,
  reversed_at TIMESTAMP,
  reversed_by UUID REFERENCES users(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Drop old ledger_entries table if it exists and recreate with new schema
DROP TABLE IF EXISTS ledger_entries CASCADE;

-- Create updated ledger_entries table
CREATE TABLE ledger_entries (
  id VARCHAR(255) PRIMARY KEY,
  transaction_id VARCHAR(255) NOT NULL,
  account_id VARCHAR(255) NOT NULL,
  account_name VARCHAR(255) NOT NULL,
  account_type account_type NOT NULL,
  entry_type entry_type NOT NULL,
  amount DECIMAL(15,4) NOT NULL CHECK (amount > 0),
  currency CHAR(3) NOT NULL DEFAULT 'BRL',
  description TEXT NOT NULL,
  reference_id VARCHAR(255),
  reference_type reference_type,
  metadata JSONB DEFAULT '{}',
  journal_entry_id VARCHAR(255) NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  posted_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indices for performance
CREATE INDEX IF NOT EXISTS idx_journal_entries_user_id ON journal_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_transaction_id ON journal_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_status ON journal_entries(status);
CREATE INDEX IF NOT EXISTS idx_journal_entries_posted_at ON journal_entries(posted_at);
CREATE INDEX IF NOT EXISTS idx_journal_entries_created_at ON journal_entries(created_at);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_account_id ON ledger_entries(account_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_account_type ON ledger_entries(account_type);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_entry_type ON ledger_entries(entry_type);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_transaction_id ON ledger_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_journal_entry_id ON ledger_entries(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_posted_at ON ledger_entries(posted_at);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_reference ON ledger_entries(reference_id, reference_type);

-- Create compound indices for common queries
CREATE INDEX IF NOT EXISTS idx_ledger_entries_account_date ON ledger_entries(account_id, posted_at);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_type_date ON ledger_entries(account_type, posted_at);

-- Create triggers for updating timestamps
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_journal_entries_updated_at') THEN
    CREATE TRIGGER update_journal_entries_updated_at 
      BEFORE UPDATE ON journal_entries
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_ledger_entries_updated_at') THEN
    CREATE TRIGGER update_ledger_entries_updated_at 
      BEFORE UPDATE ON ledger_entries
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Create function to validate journal entry balance
CREATE OR REPLACE FUNCTION validate_journal_entry_balance()
RETURNS TRIGGER AS $$
DECLARE
  debit_total DECIMAL(15,4);
  credit_total DECIMAL(15,4);
  journal_id VARCHAR(255);
BEGIN
  IF TG_OP = 'INSERT' THEN
    journal_id := NEW.journal_entry_id;
  ELSIF TG_OP = 'UPDATE' THEN
    journal_id := NEW.journal_entry_id;
  ELSIF TG_OP = 'DELETE' THEN
    journal_id := OLD.journal_entry_id;
  END IF;

  -- Calculate totals for the journal entry
  SELECT 
    COALESCE(SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END), 0)
  INTO debit_total, credit_total
  FROM ledger_entries 
  WHERE journal_entry_id = journal_id AND currency = COALESCE(NEW.currency, OLD.currency, 'BRL');

  -- Check if the journal entry is balanced (allow small rounding differences)
  IF ABS(debit_total - credit_total) > 0.01 THEN
    RAISE EXCEPTION 'Journal entry % is not balanced. Debits: %, Credits: %', 
      journal_id, debit_total, credit_total;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to validate balance on ledger entry changes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'validate_ledger_balance_trigger') THEN
    CREATE CONSTRAINT TRIGGER validate_ledger_balance_trigger
      AFTER INSERT OR UPDATE OR DELETE ON ledger_entries
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION validate_journal_entry_balance();
  END IF;
END $$;

-- Create view for trial balance
CREATE OR REPLACE VIEW trial_balance AS
SELECT 
  account_id,
  account_name,
  account_type,
  currency,
  SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END) as debit_total,
  SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END) as credit_total,
  CASE 
    WHEN account_type IN ('ASSET', 'EXPENSE') THEN 
      SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE -amount END)
    ELSE 
      SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE -amount END)
  END as balance,
  COUNT(*) as entry_count
FROM ledger_entries 
WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE status = 'POSTED')
GROUP BY account_id, account_name, account_type, currency
ORDER BY account_type, account_name;

-- Create view for account balances with running totals
CREATE OR REPLACE VIEW account_ledger AS
SELECT 
  le.*,
  SUM(CASE WHEN le.entry_type = 'DEBIT' THEN le.amount ELSE -le.amount END) 
    OVER (PARTITION BY le.account_id, le.currency ORDER BY le.posted_at, le.created_at 
          ROWS UNBOUNDED PRECEDING) as running_balance
FROM ledger_entries le
JOIN journal_entries je ON le.journal_entry_id = je.id
WHERE je.status = 'POSTED'
ORDER BY le.account_id, le.posted_at, le.created_at;

COMMENT ON TABLE journal_entries IS 'Journal entries for double-entry bookkeeping system';
COMMENT ON TABLE ledger_entries IS 'Individual ledger entries that make up journal entries';
COMMENT ON VIEW trial_balance IS 'Trial balance showing all account balances';
COMMENT ON VIEW account_ledger IS 'Account ledger with running balances';

-- Add constraints
ALTER TABLE ledger_entries 
  ADD CONSTRAINT chk_reference_consistency 
  CHECK ((reference_id IS NULL AND reference_type IS NULL) OR 
         (reference_id IS NOT NULL AND reference_type IS NOT NULL));

ALTER TABLE journal_entries
  ADD CONSTRAINT chk_posted_date_consistency
  CHECK ((status = 'POSTED' AND posted_at IS NOT NULL) OR 
         (status != 'POSTED' AND posted_at IS NULL));

ALTER TABLE journal_entries
  ADD CONSTRAINT chk_reversed_date_consistency  
  CHECK ((status = 'REVERSED' AND reversed_at IS NOT NULL AND reversed_by IS NOT NULL) OR 
         (status != 'REVERSED' AND reversed_at IS NULL));