#!/bin/bash
# Personal Finance Hub - Seed Data Script (container-native)
# Pateta o DEV - Initial Data Population

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
POSTGRES_HOST="localhost"
POSTGRES_PORT="5432"
POSTGRES_DB="personal_finance"
POSTGRES_USER="pfh_admin"
POSTGRES_PASSWORD="pfh_secure_2024"
POSTGRES_CONTAINER="pfh-postgres-master"

MONGO_PRIMARY_CONTAINER="pfh-mongo-primary"
REDIS_CONTAINER="pfh-redis-master"
MONGO_DB="personal_finance_read"

# ===== Helpers =====
require_container() {
  local name="$1"
  if ! docker ps --format '{{.Names}}' | grep -q "^${name}$"; then
    print_error "Container ${name} não está em execução. Suba com: docker compose up -d ${name}"
    exit 1
  fi
}

wait_for_postgres() {
  print_status "Waiting for PostgreSQL (inside ${POSTGRES_CONTAINER})..."
  require_container "${POSTGRES_CONTAINER}"
  local timeout=60
  while ! docker exec "${POSTGRES_CONTAINER}" pg_isready -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" >/dev/null 2>&1; do
    sleep 2
    timeout=$((timeout - 2))
    if [ $timeout -le 0 ]; then
      print_error "PostgreSQL is not ready after 60 seconds"
      print_status "Dica: docker logs -f ${POSTGRES_CONTAINER}"
      exit 1
    fi
  done
  print_success "PostgreSQL is ready!"
}

execute_psql() {
  docker exec -e PGPASSWORD=$POSTGRES_PASSWORD pfh-postgres-master \
    psql -h localhost -p 5432 -U $POSTGRES_USER -d $POSTGRES_DB -c "$1"
}

execute_psql_file_stdin() {
  docker exec -e PGPASSWORD="${POSTGRES_PASSWORD}" -i "${POSTGRES_CONTAINER}" \
    psql -v ON_ERROR_STOP=1 -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -f -
}

wait_for_mongo() {
  print_status "Waiting for MongoDB (inside ${MONGO_PRIMARY_CONTAINER})..."
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
}

require_redis() {
  require_container "${REDIS_CONTAINER}"
}

# ===== Ensure system categories =====
ensure_system_categories() {
  print_status "Ensuring system categories..."
  execute_psql "
    INSERT INTO categories (id, name, category_type, is_system, color, icon)
    VALUES
      (uuid_generate_v4(), 'Salary', 'income', true, '#4CAF50', 'briefcase'),
      (uuid_generate_v4(), 'Freelance', 'income', true, '#4CAF50', 'laptop'),
      (uuid_generate_v4(), 'Investment Returns', 'income', true, '#4CAF50', 'trending-up'),
      (uuid_generate_v4(), 'Other Income', 'income', true, '#4CAF50', 'plus-circle'),

      (uuid_generate_v4(), 'Food & Dining', 'expense', true, '#FF5722', 'utensils'),
      (uuid_generate_v4(), 'Transportation', 'expense', true, '#FF9800', 'car'),
      (uuid_generate_v4(), 'Shopping', 'expense', true, '#9C27B0', 'shopping-bag'),
      (uuid_generate_v4(), 'Entertainment', 'expense', true, '#E91E63', 'film'),
      (uuid_generate_v4(), 'Bills & Utilities', 'expense', true, '#607D8B', 'file-text'),
      (uuid_generate_v4(), 'Healthcare', 'expense', true, '#F44336', 'heart'),
      (uuid_generate_v4(), 'Education', 'expense', true, '#3F51B5', 'book'),
      (uuid_generate_v4(), 'Travel', 'expense', true, '#00BCD4', 'map-pin'),
      (uuid_generate_v4(), 'Housing', 'expense', true, '#795548', 'home'),
      (uuid_generate_v4(), 'Insurance', 'expense', true, '#9E9E9E', 'shield'),
      (uuid_generate_v4(), 'Taxes', 'expense', true, '#FF5722', 'file-minus'),
      (uuid_generate_v4(), 'Other Expenses', 'expense', true, '#757575', 'more-horizontal')
    ON CONFLICT DO NOTHING;
  "
  print_success "System categories ready."
}

# ===== Seed functions =====
seed_demo_users() {
  print_status "Creating demo users..."
  execute_psql "
    INSERT INTO users (id, email, password_hash, first_name, last_name, phone, timezone, currency, status, email_verified, created_at)
    VALUES
      ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','demo@personalfinance.com',
       '\$2b\$12\$LQv3c1yqBw2k1z4xJ5zJ5eJwJg7rG8fH5zJ5eJwJg7rG8fH5zJ5eJ','Demo','User',
       '+1-555-0123','America/New_York','USD','active',true, NOW() - INTERVAL '30 days'),
      ('b1ffcd99-9c0b-4ef8-bb6d-6bb9bd380a22','john.doe@example.com',
       '\$2b\$12\$LQv3c1yqBw2k1z4xJ5zJ5eJwJg7rG8fH5zJ5eJwJg7rG8fH5zJ5eJ','John','Doe',
       '+1-555-0456','America/Los_Angeles','USD','active',true, NOW() - INTERVAL '60 days'),
      ('c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33','jane.smith@example.com',
       '\$2b\$12\$LQv3c1yqBw2k1z4xJ5zJ5eJwJg7rG8fH5zJ5eJwJg7rG8fH5zJ5eJ','Jane','Smith',
       '+1-555-0789','America/Chicago','USD','active',true, NOW() - INTERVAL '45 days')
    ON CONFLICT (id) DO NOTHING;
  "
  print_success "Demo users created!"
}

seed_financial_institutions() {
  print_status "Creating financial institutions..."
  execute_psql "
    INSERT INTO financial_institutions (id, name, code, country_code, website_url) VALUES
      ('11111111-1111-1111-1111-111111111111','Chase Bank','CHASE','US','https://www.chase.com'),
      ('22222222-2222-2222-2222-222222222222','Bank of America','BOA','US','https://www.bankofamerica.com'),
      ('33333333-3333-3333-3333-333333333333','Wells Fargo','WELLS','US','https://www.wellsfargo.com'),
      ('44444444-4444-4444-4444-444444444444','Citibank','CITI','US','https://www.citibank.com'),
      ('55555555-5555-5555-5555-555555555555','American Express','AMEX','US','https://www.americanexpress.com')
    ON CONFLICT (id) DO NOTHING;
  "
  print_success "Financial institutions created!"
}

seed_demo_accounts() {
  print_status "Creating demo accounts..."
  # Nota: a tabela accounts (migração revisada) NÃO possui account_number_last4.
  execute_psql "
    INSERT INTO accounts
      (id, user_id, financial_institution_id, name, account_type,
       current_balance, available_balance, credit_limit, status, is_primary, created_at)
    VALUES
      -- Demo user
      ('d1111111-1111-1111-1111-111111111111','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','11111111-1111-1111-1111-111111111111',
       'Chase Checking','checking', 2547.83, 2547.83, NULL,'active', true,  NOW() - INTERVAL '30 days'),
      ('d2222222-2222-2222-2222-222222222222','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','11111111-1111-1111-1111-111111111111',
       'Chase Savings','savings',  8932.47, 8932.47, NULL,'active', false, NOW() - INTERVAL '30 days'),
      ('d3333333-3333-3333-3333-333333333333','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','55555555-5555-5555-5555-555555555555',
       'Amex Gold Card','credit_card', -1245.67, 3754.33, 5000.00,'active', false, NOW() - INTERVAL '25 days'),

      -- John Doe
      ('d4444444-4444-4444-4444-444444444444','b1ffcd99-9c0b-4ef8-bb6d-6bb9bd380a22','22222222-2222-2222-2222-222222222222',
       'BOA Checking','checking', 4892.15, 4892.15, NULL,'active', true,  NOW() - INTERVAL '60 days'),
      ('d5555555-5555-5555-5555-555555555555','b1ffcd99-9c0b-4ef8-bb6d-6bb9bd380a22','22222222-2222-2222-2222-222222222222',
       'BOA Credit Card','credit_card', -567.89, 4432.11, 5000.00,'active', false, NOW() - INTERVAL '55 days')
    ON CONFLICT (id) DO NOTHING;
  "
  print_success "Demo accounts created!"
}

seed_merchants() {
  print_status "Creating merchants..."
  execute_psql "
    INSERT INTO merchants (id, name, website_url, keywords) VALUES
      ('11111111-aaaa-bbbb-cccc-000000000001','Starbucks','https://www.starbucks.com', ARRAY['starbucks','coffee','sbux']),
      ('11111111-aaaa-bbbb-cccc-000000000002','Amazon','https://www.amazon.com', ARRAY['amazon','amzn','aws']),
      ('11111111-aaaa-bbbb-cccc-000000000003','Walmart','https://www.walmart.com', ARRAY['walmart','wal-mart','wmt']),
      ('11111111-aaaa-bbbb-cccc-000000000004','Target','https://www.target.com', ARRAY['target','tgt']),
      ('11111111-aaaa-bbbb-cccc-000000000005','McDonald''s','https://www.mcdonalds.com', ARRAY['mcdonalds','mcdonald','mcd']),
      ('11111111-aaaa-bbbb-cccc-000000000006','Shell Gas Station','https://www.shell.com', ARRAY['shell','gas','fuel']),
      ('11111111-aaaa-bbbb-cccc-000000000007','Netflix','https://www.netflix.com', ARRAY['netflix','streaming']),
      ('11111111-aaaa-bbbb-cccc-000000000008','Uber','https://www.uber.com', ARRAY['uber','ride','transport']),
      ('11111111-aaaa-bbbb-cccc-000000000009','Grocery Store', NULL, ARRAY['grocery','supermarket','food']),
      ('11111111-aaaa-bbbb-cccc-00000000000a','Electric Company', NULL, ARRAY['electric','utility','power'])
    ON CONFLICT (id) DO NOTHING;
  "
  print_success "Merchants created!"
}

seed_tags() {
  print_status "Creating tags..."
  execute_psql "
    INSERT INTO tags (id, user_id, name, color, description) VALUES
      (uuid_generate_v4(),'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Business','#2196F3','Business related expenses'),
      (uuid_generate_v4(),'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Tax Deductible','#4CAF50','Tax deductible expenses'),
      (uuid_generate_v4(),'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Emergency','#F44336','Emergency purchases'),
      (uuid_generate_v4(),'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Gift','#FF9800','Gifts for others'),
      (uuid_generate_v4(),'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Subscription','#9C27B0','Monthly subscriptions')
    ON CONFLICT DO NOTHING;
  "
  print_success "Tags created!"
}

get_category_ids() {
  FOOD_CATEGORY_ID=$(execute_psql "SELECT id FROM categories WHERE name='Food & Dining' AND is_system=true LIMIT 1;" | tail -n +3 | head -n 1 | xargs)
  TRANSPORT_CATEGORY_ID=$(execute_psql "SELECT id FROM categories WHERE name='Transportation' AND is_system=true LIMIT 1;" | tail -n +3 | head -n 1 | xargs)
  SHOPPING_CATEGORY_ID=$(execute_psql "SELECT id FROM categories WHERE name='Shopping' AND is_system=true LIMIT 1;" | tail -n +3 | head -n 1 | xargs)
  BILLS_CATEGORY_ID=$(execute_psql "SELECT id FROM categories WHERE name='Bills & Utilities' AND is_system=true LIMIT 1;" | tail -n +3 | head -n 1 | xargs)
  SALARY_CATEGORY_ID=$(execute_psql "SELECT id FROM categories WHERE name='Salary' AND is_system=true LIMIT 1;" | tail -n +3 | head -n 1 | xargs)
  ENTERTAINMENT_CATEGORY_ID=$(execute_psql "SELECT id FROM categories WHERE name='Entertainment' AND is_system=true LIMIT 1;" | tail -n +3 | head -n 1 | xargs)
}

seed_demo_transactions() {
  print_status "Creating demo transactions..."
  get_category_ids

  # transações fixas
  execute_psql "
    INSERT INTO transactions
      (id, user_id, description, amount, transaction_type, transaction_date,
       category_id, merchant_id, account_id, status, notes, created_at, created_by)
    VALUES
      (uuid_generate_v4(),'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Salary Deposit', 5500.00,'income',
       DATE_TRUNC('month', NOW()) + INTERVAL '1 day', '${SALARY_CATEGORY_ID}', NULL, 'd1111111-1111-1111-1111-111111111111','cleared','Monthly salary',
       DATE_TRUNC('month', NOW()) + INTERVAL '1 day','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'),

      (uuid_generate_v4(),'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Starbucks Coffee', -4.85,'expense',
       NOW() - INTERVAL '2 days', '${FOOD_CATEGORY_ID}', '11111111-aaaa-bbbb-cccc-000000000001','d3333333-3333-3333-3333-333333333333','pending','Morning coffee',
       NOW() - INTERVAL '2 days','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'),

      (uuid_generate_v4(),'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Amazon Purchase', -89.99,'expense',
       NOW() - INTERVAL '5 days', '${SHOPPING_CATEGORY_ID}', '11111111-aaaa-bbbb-cccc-000000000002','d3333333-3333-3333-3333-333333333333','cleared','Home office supplies',
       NOW() - INTERVAL '5 days','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'),

      (uuid_generate_v4(),'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Gas Station', -45.20,'expense',
       NOW() - INTERVAL '7 days', '${TRANSPORT_CATEGORY_ID}', '11111111-aaaa-bbbb-cccc-000000000006','d1111111-1111-1111-1111-111111111111','cleared','Weekly gas fill-up',
       NOW() - INTERVAL '7 days','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'),

      (uuid_generate_v4(),'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Netflix Subscription', -15.99,'expense',
       NOW() - INTERVAL '10 days', '${ENTERTAINMENT_CATEGORY_ID}', '11111111-aaaa-bbbb-cccc-000000000007','d1111111-1111-1111-1111-111111111111','cleared','Monthly streaming',
       NOW() - INTERVAL '10 days','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'),

      (uuid_generate_v4(),'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Electric Bill', -120.45,'expense',
       NOW() - INTERVAL '15 days', '${BILLS_CATEGORY_ID}', '11111111-aaaa-bbbb-cccc-00000000000a','d1111111-1111-1111-1111-111111111111','cleared','Monthly electric bill',
       NOW() - INTERVAL '15 days','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'),

      (uuid_generate_v4(),'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Grocery Shopping', -156.73,'expense',
       NOW() - INTERVAL '18 days', '${FOOD_CATEGORY_ID}', '11111111-aaaa-bbbb-cccc-000000000009','d1111111-1111-1111-1111-111111111111','cleared','Weekly groceries',
       NOW() - INTERVAL '18 days','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')
    ON CONFLICT (id) DO NOTHING;
  "

  # histórico aleatório (60 dias) via SQL
  execute_psql "
    INSERT INTO transactions (id, user_id, description, amount, transaction_type, transaction_date,
                              category_id, account_id, status, created_at, created_by)
    SELECT
      uuid_generate_v4(),
      'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      'Random Expense ' || g::text,
      -ROUND((random()*100)::numeric, 2),
      'expense',
      NOW() - (g::text || ' days')::interval,
      (SELECT id FROM categories WHERE is_system = true AND category_type = 'expense' ORDER BY random() LIMIT 1),
      (SELECT id FROM accounts WHERE user_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' ORDER BY random() LIMIT 1),
      'cleared',
      NOW() - (g::text || ' days')::interval,
      'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
    FROM generate_series(1,60) g;
  "
  print_success "Demo transactions created!"
}

seed_demo_budgets() {
  print_status "Creating demo budgets..."
  get_category_ids
  CURRENT_PERIOD=$(date '+%Y-%m')

  execute_psql "
    INSERT INTO budgets (id, user_id, period, total_income_budget, total_expense_budget, is_active)
    VALUES (uuid_generate_v4(), 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '${CURRENT_PERIOD}', 5500.00, 4800.00, true)
    ON CONFLICT (user_id, period) DO NOTHING;
  "

  BUDGET_ID=$(execute_psql "SELECT id FROM budgets WHERE user_id='a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' AND period='${CURRENT_PERIOD}' LIMIT 1;" | tail -n +3 | head -n 1 | xargs)

  if [ -n "$BUDGET_ID" ]; then
    execute_psql "
      INSERT INTO budget_categories (id, budget_id, category_id, budgeted_amount, percentage_of_income)
      VALUES
        (uuid_generate_v4(), '${BUDGET_ID}', '${FOOD_CATEGORY_ID}', 600.00, 10.91),
        (uuid_generate_v4(), '${BUDGET_ID}', '${TRANSPORT_CATEGORY_ID}', 400.00, 7.27),
        (uuid_generate_v4(), '${BUDGET_ID}', '${SHOPPING_CATEGORY_ID}', 300.00, 5.45),
        (uuid_generate_v4(), '${BUDGET_ID}', '${BILLS_CATEGORY_ID}', 1200.00, 21.82),
        (uuid_generate_v4(), '${BUDGET_ID}', '${ENTERTAINMENT_CATEGORY_ID}', 200.00, 3.64)
      ON CONFLICT (budget_id, category_id) DO NOTHING;
    "
  fi

  print_success "Demo budgets created!"
}

seed_recurring_transactions() {
  print_status "Creating recurring transactions..."
  get_category_ids
  execute_psql "
    INSERT INTO recurring_transactions
      (id, user_id, name, description, amount, transaction_type,
       account_id, category_id, frequency, start_date, next_due_date, is_active)
    VALUES
      (uuid_generate_v4(),'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Monthly Salary','Regular salary deposit',
       5500.00,'income','d1111111-1111-1111-1111-111111111111','${SALARY_CATEGORY_ID}','monthly',
       DATE_TRUNC('month', NOW()), DATE_TRUNC('month', NOW()) + INTERVAL '1 month', true),
      (uuid_generate_v4(),'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Netflix Subscription','Monthly streaming service',
       -15.99,'expense','d1111111-1111-1111-1111-111111111111','${ENTERTAINMENT_CATEGORY_ID}','monthly',
       NOW() - INTERVAL '30 days', NOW() + INTERVAL '20 days', true),
      (uuid_generate_v4(),'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Electric Bill','Monthly utility payment',
       -120.00,'expense','d1111111-1111-1111-1111-111111111111','${BILLS_CATEGORY_ID}','monthly',
       NOW() - INTERVAL '30 days', NOW() + INTERVAL '15 days', true)
    ON CONFLICT (id) DO NOTHING;
  "
  print_success "Recurring transactions created!"
}

seed_mongodb_data() {
  wait_for_mongo
  print_status "Seeding MongoDB read-side data..."

    # string de conexão (localhost dentro do container aponta pro próprio Mongo)
    MONGO_URI="mongodb://pfh_admin:mongo_secure_2024@localhost:27017/personal_finance_read?authSource=admin"

    # Daily category spend
    docker exec pfh-mongo-primary mongosh "$MONGO_URI" --eval "
      db.daily_category_spend.insertMany([
        {
          user_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          date: new Date('2024-01-01'),
          category: 'Food & Dining',
          amount: 45.67,
          transaction_count: 3,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          user_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          date: new Date('2024-01-01'),
          category: 'Transportation',
          amount: 32.10,
          transaction_count: 1,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          user_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          date: new Date('2024-01-02'),
          category: 'Shopping',
          amount: 156.89,
          transaction_count: 2,
          created_at: new Date(),
          updated_at: new Date()
        }
      ]);
    " >/dev/null

    # Monthly summaries
    docker exec pfh-mongo-primary mongosh "$MONGO_URI" --eval "
      db.monthly_summaries.insertMany([
        {
          user_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          period: '2024-01',
          total_income: 5500.00,
          total_expenses: 3245.67,
          net_income: 2254.33,
          categories: {
            'Food & Dining': { budgeted: 600.00, actual: 567.89, variance: 32.11 },
            'Transportation': { budgeted: 400.00, actual: 456.78, variance: -56.78 },
            'Shopping': { budgeted: 300.00, actual: 234.56, variance: 65.44 },
            'Bills & Utilities': { budgeted: 1200.00, actual: 1156.89, variance: 43.11 },
            'Entertainment': { budgeted: 200.00, actual: 167.45, variance: 32.55 }
          },
          created_at: new Date(),
          updated_at: new Date()
        }
      ]);
    " >/dev/null

    # Dashboard cache
    docker exec pfh-mongo-primary mongosh "$MONGO_URI" --eval "
      db.dashboard_cache.insertMany([
        {
          user_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          period: '2024-01',
          data: {
            total_income: 5500.00,
            total_expenses: 3245.67,
            net_income: 2254.33,
            spending_by_category: [
              { name: 'Bills & Utilities', value: 1156.89, percentage: 35.6 },
              { name: 'Food & Dining', value: 567.89, percentage: 17.5 },
              { name: 'Transportation', value: 456.78, percentage: 14.1 },
              { name: 'Shopping', value: 234.56, percentage: 7.2 },
              { name: 'Entertainment', value: 167.45, percentage: 5.2 }
            ],
            budget_vs_actual: {
              budgeted: 4800.00,
              actual: 3245.67,
              variance: 1554.33,
              percentage_used: 67.6
            },
            top_merchants: [
              { name: 'Electric Company', amount: 456.78 },
              { name: 'Grocery Store', amount: 234.56 },
              { name: 'Gas Station', amount: 167.89 },
              { name: 'Amazon', amount: 123.45 },
              { name: 'Starbucks', amount: 89.67 }
            ]
          },
          expires_at: new Date(Date.now() + 5 * 60 * 1000),
          created_at: new Date(),
          updated_at: new Date()
        }
      ]);
    " >/dev/null

    print_success "MongoDB data seeded!"
  }

seed_redis_data() {
  print_status "Seeding Redis cache data..."
  require_redis
  docker exec "${REDIS_CONTAINER}" redis-cli SET \
    "dash:a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11:2024-01" \
    '{"total_income":5500,"total_expenses":3245.67,"net_income":2254.33}' EX 300 >/dev/null

  docker exec "${REDIS_CONTAINER}" redis-cli SET \
    "session:demo-session-token" \
    '{"user_id":"a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11","expires_at":"2024-12-31T23:59:59Z"}' EX 3600 >/dev/null

  docker exec "${REDIS_CONTAINER}" redis-cli SET \
    "rate_limit:127.0.0.1:api" "5" EX 60 >/dev/null

  print_success "Redis cache data seeded!"
}

create_sample_files() {
  print_status "Creating sample files and documentation..."
  cat > README.md << 'EOF'
# Personal Finance Hub 💰
[... mesmo conteúdo do README do seu script anterior ...]
EOF

  if [ ! -f ".env" ] && [ -f ".env.example" ]; then
    cp .env.example .env
    print_status "Created .env file from template"
  fi
  print_success "Sample files created!"
}

verify_seed_data() {
  print_status "Verifying seed data..."

  USER_COUNT=$(execute_psql "SELECT COUNT(*) FROM users;" | tail -n +3 | head -n 1 | xargs)
  ACCOUNT_COUNT=$(execute_psql "SELECT COUNT(*) FROM accounts;" | tail -n +3 | head -n 1 | xargs)
  TRANSACTION_COUNT=$(execute_psql "SELECT COUNT(*) FROM transactions;" | tail -n +3 | head -n 1 | xargs)
  BUDGET_COUNT=$(execute_psql "SELECT COUNT(*) FROM budgets;" | tail -n +3 | head -n 1 | xargs)

  print_status "PostgreSQL data:"
  echo "  👥 Users: $USER_COUNT"
  echo "  🏦 Accounts: $ACCOUNT_COUNT"
  echo "  💸 Transactions: $TRANSACTION_COUNT"
  echo "  📊 Budgets: $BUDGET_COUNT"

  MONGO_COLLECTIONS=$(docker exec "${MONGO_PRIMARY_CONTAINER}" mongosh --quiet "${MONGO_DB}" --eval "db.getCollectionNames().length" 2>/dev/null || echo "0")
  print_status "MongoDB collections: $MONGO_COLLECTIONS"

  REDIS_KEYS=$(docker exec "${REDIS_CONTAINER}" redis-cli DBSIZE 2>/dev/null || echo "0")
  print_status "Redis keys: $REDIS_KEYS"

  if [ "$USER_COUNT" -gt "0" ] && [ "$TRANSACTION_COUNT" -gt "0" ]; then
    print_success "Seed data verification passed!"
  else
    print_warning "Seed data verification incomplete. Please check logs."
  fi
}

# ===== Main =====
main() {
  echo "=============================================="
  echo "🌱 Personal Finance Hub - Seed Data"
  echo "   Pateta o DEV - Demo Data Population"
  echo "=============================================="
  echo

  print_warning "This will populate the database with demo data."
  print_warning "Make sure you have run ./scripts/migrate.sh first!"
  echo

  if [ -t 0 ]; then
    read -p "Continue with seeding demo data? (y/N): " -n 1 -r
    echo
    [[ $REPLY =~ ^[Yy]$ ]] || { print_status "Seed operation cancelled."; exit 0; }
  fi

  wait_for_postgres
  ensure_system_categories
  seed_demo_users
  seed_financial_institutions
  seed_demo_accounts
  seed_merchants
  seed_tags
  seed_demo_transactions
  seed_demo_budgets
  seed_recurring_transactions
  seed_mongodb_data
  seed_redis_data
  create_sample_files
  verify_seed_data

  echo
  echo "=============================================="
  print_success "🎉 Seed data population completed!"
  echo "=============================================="
  echo
  print_status "Demo Account Credentials:"
  echo "  📧 Email: demo@personalfinance.com"
  echo "  🔑 Password: password123"
  echo
  print_status "Additional demo users:"
  echo "  📧 john.doe@example.com (password: password123)"
  echo "  📧 jane.smith@example.com (password: password123)"
  echo
}

if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
  main "$@"
fi