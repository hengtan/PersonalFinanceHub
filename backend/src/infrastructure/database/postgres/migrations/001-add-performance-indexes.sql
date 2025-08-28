-- Performance optimization indexes for Personal Finance Hub
-- Sprint 6: Query optimization through strategic indexing

-- Users table optimizations
CREATE INDEX IF NOT EXISTS idx_users_email_active ON users(email) WHERE is_active = true AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login_at DESC) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);

-- Transaction table optimizations (building on existing indexes)
CREATE INDEX IF NOT EXISTS idx_transactions_user_amount ON transactions(user_id, amount DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user_status ON transactions(user_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_date_range ON transactions(transaction_date DESC, user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_category_amount ON transactions(category_id, amount DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_payment_method ON transactions(payment_method, user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_recurring ON transactions(user_id, is_recurring) WHERE is_recurring = true;
CREATE INDEX IF NOT EXISTS idx_transactions_tags ON transactions USING GIN(tags) WHERE array_length(tags, 1) > 0;
CREATE INDEX IF NOT EXISTS idx_transactions_search ON transactions USING GIN(to_tsvector('portuguese', description)) WHERE deleted_at IS NULL;

-- Budget table optimizations
CREATE INDEX IF NOT EXISTS idx_budgets_user_period ON budgets(user_id, budget_period, start_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_budgets_category_active ON budgets(category_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_budgets_amount ON budgets(allocated_amount DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_budgets_status ON budgets(user_id, status) WHERE deleted_at IS NULL;

-- Ledger entries optimizations
CREATE INDEX IF NOT EXISTS idx_ledger_entries_transaction ON ledger_entries(transaction_id, entry_type);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_account_balance ON ledger_entries(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_amount ON ledger_entries(amount) WHERE amount != 0;

-- Journal entries optimizations  
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(entry_date DESC, user_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_type ON journal_entries(entry_type, user_id);

-- Outbox events optimizations (for event-driven architecture)
CREATE INDEX IF NOT EXISTS idx_outbox_events_processed ON outbox_events(processed_at) WHERE processed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_outbox_events_event_type ON outbox_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outbox_events_retry ON outbox_events(retry_count, next_retry_at) WHERE processed_at IS NULL;

-- Composite indexes for common dashboard queries
CREATE INDEX IF NOT EXISTS idx_transactions_dashboard ON transactions(
    user_id, 
    transaction_date DESC, 
    type, 
    amount DESC
) WHERE deleted_at IS NULL AND status = 'completed';

-- Monthly summary optimization
CREATE INDEX IF NOT EXISTS idx_transactions_monthly ON transactions(
    user_id, 
    date_trunc('month', transaction_date),
    type
) WHERE deleted_at IS NULL AND status = 'completed';

-- Category spending analysis
CREATE INDEX IF NOT EXISTS idx_transactions_category_analysis ON transactions(
    user_id,
    category_id,
    transaction_date DESC,
    amount
) WHERE deleted_at IS NULL AND type = 'expense';

-- Budget vs actual spending comparison
CREATE INDEX IF NOT EXISTS idx_budget_comparison ON transactions(
    user_id,
    category_id,
    transaction_date,
    amount
) WHERE deleted_at IS NULL AND type = 'expense';

-- Performance monitoring indexes
CREATE INDEX IF NOT EXISTS idx_transactions_performance ON transactions(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_performance ON users(created_at DESC, is_active) WHERE deleted_at IS NULL;

-- Partial indexes for soft deletes (improve performance by excluding deleted records)
CREATE INDEX IF NOT EXISTS idx_transactions_active ON transactions(user_id, transaction_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_budgets_active ON budgets(user_id, start_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_active ON users(email, is_active) WHERE deleted_at IS NULL;

COMMENT ON INDEX idx_transactions_dashboard IS 'Optimized for dashboard queries showing recent transactions with amounts';
COMMENT ON INDEX idx_transactions_monthly IS 'Optimized for monthly spending summaries and reports';
COMMENT ON INDEX idx_transactions_search IS 'Full-text search on transaction descriptions in Portuguese';
COMMENT ON INDEX idx_transactions_tags IS 'GIN index for efficient tag-based filtering';
COMMENT ON INDEX idx_budget_comparison IS 'Optimized for budget vs actual spending comparisons';