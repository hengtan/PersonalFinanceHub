#!/bin/bash

# Personal Finance Hub - Development Setup Script
# Pateta o DEV - Staff Full-Stack Engineer

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."

    if ! command_exists docker; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi

    if ! command_exists docker-compose; then
        print_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi

    if ! command_exists node; then
        print_error "Node.js is not installed. Please install Node.js 18+ first."
        exit 1
    fi

    # Check Node.js version
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        print_error "Node.js version 18+ is required. Current version: $(node -v)"
        exit 1
    fi

    print_success "All prerequisites are met!"
}

# Create directory structure
create_directories() {
    print_status "Creating directory structure..."

    # Infrastructure directories
    mkdir -p infrastructure/{terraform,kubernetes,docker/configs,monitoring/{grafana/{dashboards,datasources},prometheus,alerting,loki,promtail}}

    # Backend directories
    mkdir -p backend/src/{api/{controllers,middlewares,routes,validators},core/{domain/{entities,value-objects,events},services,use-cases},infrastructure/{database/{postgres/{entities,repositories,migrations},mongodb/{schemas,repositories},redis},messaging/{kafka,consumers,publishers},external/{storage,email,ai},monitoring},jobs/{processors,schedulers},shared/{constants,utils,types,decorators}}
    mkdir -p backend/{tests/{unit/{services,utils},integration/{api,database,messaging},e2e,performance},docs/{api,architecture}}

    # Frontend directories
    mkdir -p frontend/src/{app/{api,\(auth\)/{login,register},\(dashboard\)/{dashboard,transactions,budget,reports,settings}},components/{ui,charts,forms,layout,features/{dashboard,transactions,reports},common},hooks,lib/{api,stores,utils,constants,types},styles}
    mkdir -p frontend/{public/{icons,images},tests/{components,pages,hooks,e2e}}

    # Scripts directory
    mkdir -p scripts

    # Docs directory
    mkdir -p docs/diagrams

    # GitHub Actions
    mkdir -p .github/{workflows,ISSUE_TEMPLATE}

    print_success "Directory structure created!"
}

# Generate environment files
create_env_files() {
    print_status "Creating environment files..."

    # Root .env.example
    cat > .env.example << 'EOF'
# Personal Finance Hub - Environment Variables

# ===========================================
# DATABASE CONFIGURATION
# ===========================================

# PostgreSQL (Write Database)
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=personal_finance
POSTGRES_USER=pfh_admin
POSTGRES_PASSWORD=pfh_secure_2024

# PostgreSQL Read Replica
POSTGRES_READ_HOST=localhost
POSTGRES_READ_PORT=5433

# MongoDB (Read Database)
MONGODB_URI=mongodb://pfh_admin:mongo_secure_2024@localhost:27017,localhost:27018,localhost:27019/personal_finance_read?replicaSet=rs0&authSource=admin

# Redis (Cache & Sessions)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=redis_secure_2024
REDIS_READ_HOST=localhost
REDIS_READ_PORT=6380

# ===========================================
# MESSAGING & EVENTS
# ===========================================

# Kafka
KAFKA_BROKERS=localhost:9092,localhost:9093,localhost:9094
KAFKA_CLIENT_ID=personal-finance-api

# ===========================================
# STORAGE
# ===========================================

# MinIO (S3 Compatible)
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=pfh_admin
MINIO_SECRET_KEY=minio_secure_2024
MINIO_BUCKET=personal-finance-files

# ===========================================
# AUTHENTICATION & SECURITY
# ===========================================

# JWT Configuration
JWT_SECRET=your_super_secure_jwt_secret_change_in_production_min_32_chars
JWT_REFRESH_SECRET=your_super_secure_refresh_secret_change_in_production_min_32_chars
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Encryption
ENCRYPTION_KEY=your_32_char_encryption_key_here
ENCRYPTION_IV=your_16_char_iv_here

# API Rate Limiting
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100

# ===========================================
# EXTERNAL SERVICES
# ===========================================

# Email Service (SendGrid)
SENDGRID_API_KEY=your_sendgrid_api_key_here
FROM_EMAIL=noreply@personalfinance.com

# AI/ML Services
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4

# ===========================================
# MONITORING & OBSERVABILITY
# ===========================================

# Prometheus
PROMETHEUS_ENDPOINT=http://localhost:9090

# Jaeger Tracing
JAEGER_ENDPOINT=http://localhost:14268/api/traces

# Loki Logging
LOKI_ENDPOINT=http://localhost:3100

# ===========================================
# APPLICATION CONFIGURATION
# ===========================================

# Server Configuration
NODE_ENV=development
PORT=3333
HOST=0.0.0.0

# CORS Configuration
CORS_ORIGIN=http://localhost:3000
CORS_CREDENTIALS=true

# File Upload
MAX_FILE_SIZE=10485760  # 10MB in bytes
ALLOWED_FILE_TYPES=csv,xlsx,pdf,png,jpg,jpeg

# Report Generation
REPORT_QUEUE_CONCURRENCY=5
REPORT_TIMEOUT_MS=60000  # 1 minute

# Data Retention
TRANSACTION_RETENTION_YEARS=7
LOG_RETENTION_DAYS=90
EVENT_REPLAY_DAYS=30
EOF

    # Backend .env.example
    cp .env.example backend/.env.example

    # Frontend .env.example
    cat > frontend/.env.example << 'EOF'
# Personal Finance Hub - Frontend Environment Variables

# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:3333/api
NEXT_PUBLIC_WS_URL=ws://localhost:3333

# App Configuration
NEXT_PUBLIC_APP_NAME="Personal Finance Hub"
NEXT_PUBLIC_APP_VERSION=1.0.0
NEXT_PUBLIC_APP_ENV=development

# Feature Flags
NEXT_PUBLIC_ENABLE_AI_FEATURES=true
NEXT_PUBLIC_ENABLE_ADVANCED_REPORTS=true
NEXT_PUBLIC_ENABLE_REAL_TIME_SYNC=true

# Analytics (Optional)
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX

# Error Reporting (Optional)
NEXT_PUBLIC_SENTRY_DSN=https://your-sentry-dsn-here
EOF

    print_success "Environment files created!"
}

# Generate package.json files
create_package_files() {
    print_status "Creating package.json files..."

    # Root package.json (workspace)
    cat > package.json << 'EOF'
{
  "name": "personal-finance-hub",
  "version": "1.0.0",
  "description": "Personal Finance Management Platform - Full-Stack TypeScript Application",
  "private": true,
  "workspaces": [
    "backend",
    "frontend"
  ],
  "scripts": {
    "dev": "concurrently \"npm run dev:backend\" \"npm run dev:frontend\"",
    "dev:backend": "cd backend && npm run dev",
    "dev:frontend": "cd frontend && npm run dev",
    "build": "npm run build:backend && npm run build:frontend",
    "build:backend": "cd backend && npm run build",
    "build:frontend": "cd frontend && npm run build",
    "test": "npm run test:backend && npm run test:frontend",
    "test:backend": "cd backend && npm run test",
    "test:frontend": "cd frontend && npm run test",
    "test:e2e": "cd frontend && npm run test:e2e",
    "lint": "npm run lint:backend && npm run lint:frontend",
    "lint:backend": "cd backend && npm run lint",
    "lint:frontend": "cd frontend && npm run lint",
    "type-check": "npm run type-check:backend && npm run type-check:frontend",
    "type-check:backend": "cd backend && npm run type-check",
    "type-check:frontend": "cd frontend && npm run type-check",
    "docker:up": "docker-compose up -d",
    "docker:down": "docker-compose down",
    "docker:logs": "docker-compose logs -f",
    "docker:clean": "docker-compose down -v && docker system prune -f",
    "setup": "./scripts/setup-dev.sh",
    "migrate": "./scripts/migrate.sh",
    "seed": "./scripts/seed-data.sh",
    "backup": "./scripts/backup.sh"
  },
  "devDependencies": {
    "concurrently": "^8.2.2",
    "@types/node": "^20.10.4",
    "typescript": "^5.3.3"
  },
  "engines": {
    "node": ">=18.0.0",
    "npm": ">=9.0.0"
  },
  "author": {
    "name": "Pateta o DEV (John Spearrow)",
    "email": "john.spearrow@personalfinance.com"
  },
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/your-org/personal-finance-hub.git"
  }
}
EOF

    print_success "Root package.json created!"
}

# Initialize Git repository
init_git() {
    print_status "Initializing Git repository..."

    if [ ! -d ".git" ]; then
        git init
        print_success "Git repository initialized!"
    else
        print_warning "Git repository already exists!"
    fi

    # Create .gitignore
    cat > .gitignore << 'EOF'
# Dependencies
node_modules/
*/node_modules/

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
lerna-debug.log*

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/
*.lcov

# nyc test coverage
.nyc_output

# Dependency directories
node_modules/
jspm_packages/

# Optional npm cache directory
.npm

# Optional eslint cache
.eslintcache

# Microbundle cache
.rpt2_cache/
.rts2_cache_cjs/
.rts2_cache_es/
.rts2_cache_umd/

# Optional REPL history
.node_repl_history

# Output of 'npm pack'
*.tgz

# Yarn Integrity file
.yarn-integrity

# parcel-bundler cache (https://parceljs.org/)
.cache
.parcel-cache

# Next.js build output
.next
out

# Nuxt.js build / generate output
.nuxt
dist

# Gatsby files
.cache/
public

# Storybook build outputs
.out
.storybook-out

# Temporary folders
tmp/
temp/

# Editor directories and files
.vscode/*
!.vscode/settings.json
!.vscode/tasks.json
!.vscode/launch.json
!.vscode/extensions.json
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?
.idea/

# OS generated files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# Docker
docker-compose.override.yml

# Database files
*.sqlite
*.sqlite3
*.db

# SSL certificates
*.pem
*.key
*.crt
*.csr

# Terraform
*.tfstate
*.tfstate.*
.terraform/
.terraform.lock.hcl

# Kubernetes
kubeconfig

# Build outputs
build/
dist/
out/

# Test outputs
coverage/
test-results/
playwright-report/

# Monitoring data
/infrastructure/monitoring/data/
EOF

    print_success ".gitignore created!"
}

# Setup Docker configurations
setup_docker_configs() {
    print_status "Setting up Docker configurations..."

    # PostgreSQL Master Config
    cat > infrastructure/docker/configs/postgres-master.conf << 'EOF'
# PostgreSQL Master Configuration
listen_addresses = '*'
port = 5432

# Memory Settings
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 4MB
maintenance_work_mem = 64MB

# Write-Ahead Logging (WAL)
wal_level = replica
max_wal_senders = 10
max_replication_slots = 10
wal_keep_size = 1GB

# Replication
hot_standby = on
archive_mode = on
archive_command = 'test ! -f /var/lib/postgresql/archive/%f && cp %p /var/lib/postgresql/archive/%f'

# Logging
log_destination = 'stderr'
logging_collector = on
log_min_messages = info
log_line_prefix = '%m [%p] %q%u@%d '

# Performance
checkpoint_completion_target = 0.9
wal_buffers = 16MB
random_page_cost = 1.1

# Connection settings
max_connections = 100
EOF

    # PostgreSQL Replica Config
    cat > infrastructure/docker/configs/postgres-replica.conf << 'EOF'
# PostgreSQL Replica Configuration
listen_addresses = '*'
port = 5432

# Memory Settings (same as master)
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 4MB
maintenance_work_mem = 64MB

# Standby Settings
hot_standby = on
max_standby_streaming_delay = 30s
max_standby_archive_delay = 30s
hot_standby_feedback = on

# Recovery
recovery_target_timeline = 'latest'

# Logging
log_destination = 'stderr'
logging_collector = on
log_min_messages = info
log_line_prefix = '%m [%p] %q%u@%d '
EOF

    # MongoDB Primary Config
    cat > infrastructure/docker/configs/mongod-primary.conf << 'EOF'
# MongoDB Primary Configuration
systemLog:
  destination: file
  logAppend: true
  path: /var/log/mongodb/mongod.log
  logRotate: rename
  verbosity: 1

storage:
  dbPath: /data/db
  journal:
    enabled: true
  wiredTiger:
    engineConfig:
      cacheSizeGB: 0.5

processManagement:
  fork: false
  pidFilePath: /var/run/mongodb/mongod.pid

net:
  port: 27017
  bindIpAll: true
  maxIncomingConnections: 1000

replication:
  replSetName: rs0
  oplogSizeMB: 1024

security:
  authorization: enabled
EOF

    # MongoDB Secondary Config
    cat > infrastructure/docker/configs/mongod-secondary.conf << 'EOF'
# MongoDB Secondary Configuration
systemLog:
  destination: file
  logAppend: true
  path: /var/log/mongodb/mongod.log
  logRotate: rename
  verbosity: 1

storage:
  dbPath: /data/db
  journal:
    enabled: true
  wiredTiger:
    engineConfig:
      cacheSizeGB: 0.5

processManagement:
  fork: false
  pidFilePath: /var/run/mongodb/mongod.pid

net:
  port: 27017
  bindIpAll: true
  maxIncomingConnections: 1000

replication:
  replSetName: rs0
  oplogSizeMB: 1024

security:
  authorization: enabled
EOF

    # Redis Master Config
    cat > infrastructure/docker/configs/redis-master.conf << 'EOF'
# Redis Master Configuration
port 6379
bind 0.0.0.0
protected-mode no

# Authentication
requirepass redis_secure_2024

# Memory management
maxmemory 512mb
maxmemory-policy allkeys-lru

# Persistence
save 900 1
save 300 10
save 60 10000
stop-writes-on-bgsave-error yes
rdbcompression yes
rdbchecksum yes
dbfilename dump.rdb

# Append Only File
appendonly yes
appendfilename "appendonly.aof"
appendfsync everysec
no-appendfsync-on-rewrite no
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb

# Replication
masterauth redis_secure_2024

# Logging
loglevel notice
logfile ""

# Client output buffer limits
client-output-buffer-limit replica 256mb 64mb 60
client-output-buffer-limit pubsub 32mb 8mb 60

# Slow log
slowlog-log-slower-than 10000
slowlog-max-len 128

# Latency monitor
latency-monitor-threshold 100
EOF

    # Redis Replica Config
    cat > infrastructure/docker/configs/redis-replica.conf << 'EOF'
# Redis Replica Configuration
port 6379
bind 0.0.0.0
protected-mode no

# Authentication
requirepass redis_secure_2024
masterauth redis_secure_2024

# Replica configuration
replicaof redis-master 6379
replica-read-only yes
replica-serve-stale-data yes
replica-priority 90

# Memory management
maxmemory 512mb
maxmemory-policy allkeys-lru

# Persistence (lighter on replica)
save 900 1
save 300 10
rdbcompression yes
rdbchecksum yes
dbfilename dump.rdb

# Append Only File
appendonly yes
appendfilename "appendonly.aof"
appendfsync everysec

# Logging
loglevel notice
logfile ""

# Slow log
slowlog-log-slower-than 10000
slowlog-max-len 128
EOF

    # Nginx Configuration
    cat > infrastructure/docker/configs/nginx.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    upstream backend {
        server backend:3333;
    }

    upstream frontend {
        server frontend:3000;
    }

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=auth:10m rate=5r/m;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;

    # Frontend
    server {
        listen 80;
        server_name localhost;

        location / {
            proxy_pass http://frontend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
        }

        # API routes
        location /api/ {
            limit_req zone=api burst=20 nodelay;

            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
        }

        # Auth routes (stricter rate limiting)
        location /api/auth/ {
            limit_req zone=auth burst=3 nodelay;

            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
EOF

    print_success "Docker configurations created!"
}

# Setup MongoDB initialization script
setup_mongo_init() {
    print_status "Setting up MongoDB initialization..."

    cat > scripts/mongo-init.js << 'EOF'
// MongoDB Initialization Script
// Initialize replica set and create initial collections with indexes

// Wait for MongoDB to be ready
sleep(1000);

// Initialize replica set
try {
  rs.initiate({
    _id: "rs0",
    members: [
      { _id: 0, host: "mongo-primary:27017", priority: 2 },
      { _id: 1, host: "mongo-secondary-1:27017", priority: 1 },
      { _id: 2, host: "mongo-secondary-2:27017", priority: 1 }
    ]
  });

  print("Replica set initialized successfully");
} catch (error) {
  print("Replica set initialization error:", error);
}

// Wait for replica set to be ready
sleep(5000);

// Switch to primary
var attempts = 0;
while (!rs.isMaster().ismaster && attempts < 30) {
  print("Waiting for primary...");
  sleep(1000);
  attempts++;
}

if (rs.isMaster().ismaster) {
  print("Connected to primary, creating database and collections...");

  // Switch to the database
  db = db.getSiblingDB('personal_finance_read');

  // Create collections with initial documents (to ensure they exist)
  db.daily_category_spend.insertOne({
    user_id: "init",
    date: new Date(),
    category: "init",
    amount: 0,
    created_at: new Date()
  });

  db.monthly_summaries.insertOne({
    user_id: "init",
    period: "2024-01",
    total_income: 0,
    total_expenses: 0,
    categories: {},
    created_at: new Date()
  });

  db.dashboard_cache.insertOne({
    user_id: "init",
    period: "2024-01",
    data: {},
    expires_at: new Date(),
    created_at: new Date()
  });

  // Remove init documents
  db.daily_category_spend.deleteOne({ user_id: "init" });
  db.monthly_summaries.deleteOne({ user_id: "init" });
  db.dashboard_cache.deleteOne({ user_id: "init" });

  // Create indexes
  print("Creating indexes...");

  // Daily category spend indexes
  db.daily_category_spend.createIndex({ user_id: 1, date: 1, category: 1 }, { unique: true });
  db.daily_category_spend.createIndex({ user_id: 1, date: 1 });
  db.daily_category_spend.createIndex({ user_id: 1, category: 1 });
  db.daily_category_spend.createIndex({ date: 1 });

  // Monthly summaries indexes
  db.monthly_summaries.createIndex({ user_id: 1, period: 1 }, { unique: true });
  db.monthly_summaries.createIndex({ user_id: 1 });
  db.monthly_summaries.createIndex({ period: 1 });

  // Dashboard cache indexes
  db.dashboard_cache.createIndex({ user_id: 1, period: 1 }, { unique: true });
  db.dashboard_cache.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
  db.dashboard_cache.createIndex({ user_id: 1 });

  print("MongoDB initialization completed successfully!");
} else {
  print("Failed to connect to primary after 30 attempts");
}
EOF

    print_success "MongoDB initialization script created!"
}

# Setup Kafka topics creation script
setup_kafka_topics() {
    print_status "Setting up Kafka topics script..."

    cat > scripts/create-kafka-topics.sh << 'EOF'
#!/bin/bash

# Create Kafka Topics for Personal Finance Hub
# Pateta o DEV - Event-Driven Architecture Setup

KAFKA_CONTAINER="pfh-kafka-1"
TOPICS=(
  "budget.transaction.v1:3:3"
  "budget.updated.v1:3:3"
  "user.registered.v1:1:3"
  "user.updated.v1:1:3"
  "report.requested.v1:3:3"
  "report.completed.v1:3:3"
  "notification.send.v1:3:3"
  "audit.event.v1:3:3"
  "system.health.v1:1:1"
)

echo "Creating Kafka topics..."

for topic_config in "${TOPICS[@]}"; do
  IFS=':' read -r topic_name partitions replication <<< "$topic_config"

  echo "Creating topic: $topic_name (partitions: $partitions, replication: $replication)"

  docker exec $KAFKA_CONTAINER kafka-topics \
    --bootstrap-server localhost:9092 \
    --create \
    --topic "$topic_name" \
    --partitions "$partitions" \
    --replication-factor "$replication" \
    --config cleanup.policy=delete \
    --config retention.ms=604800000 \
    --config max.message.bytes=1048576 \
    --if-not-exists
done

echo "Listing all topics:"
docker exec $KAFKA_CONTAINER kafka-topics \
  --bootstrap-server localhost:9092 \
  --list

echo "Kafka topics created successfully!"
EOF

    chmod +x scripts/create-kafka-topics.sh
    print_success "Kafka topics script created!"
}

# Wait for services to be ready
wait_for_services() {
    print_status "Waiting for services to be ready..."

    # PostgreSQL
    print_status "Waiting for PostgreSQL..."
    while ! docker exec pfh-postgres-master pg_isready -U pfh_admin -d personal_finance >/dev/null 2>&1; do
        sleep 2
    done
    print_success "PostgreSQL is ready!"

    # MongoDB
    print_status "Waiting for MongoDB..."
    while ! docker exec pfh-mongo-primary mongosh --eval "db.adminCommand('ping')" >/dev/null 2>&1; do
        sleep 2
    done
    print_success "MongoDB is ready!"

    # Redis
    print_status "Waiting for Redis..."
    while ! docker exec pfh-redis-master redis-cli ping >/dev/null 2>&1; do
        sleep 2
    done
    print_success "Redis is ready!"

    # Kafka
    print_status "Waiting for Kafka..."
    while ! docker exec pfh-kafka-1 kafka-broker-api-versions --bootstrap-server localhost:9092 >/dev/null 2>&1; do
        sleep 5
    done
    print_success "Kafka is ready!"
}

# Main setup function
main() {
    echo "=============================================="
    echo "🚀 Personal Finance Hub - Development Setup"
    echo "   Pateta o DEV - Staff Full-Stack Engineer"
    echo "=============================================="
    echo

    check_prerequisites
    create_directories
    create_env_files
    create_package_files
    init_git
    setup_docker_configs
    setup_mongo_init
    setup_kafka_topics

    print_status "Starting Docker services..."
    docker-compose up -d

    wait_for_services

    print_status "Creating Kafka topics..."
    ./scripts/create-kafka-topics.sh

    echo
    echo "=============================================="
    print_success "🎉 Setup completed successfully!"
    echo "=============================================="
    echo
    print_status "Services running:"
    echo "  📊 Kafka UI:      http://localhost:8080"
    echo "  📈 Grafana:       http://localhost:3001 (admin/grafana_secure_2024)"
    echo "  📊 Prometheus:    http://localhost:9090"
    echo "  💾 MinIO:         http://localhost:9001 (pfh_admin/minio_secure_2024)"
    echo "  🔍 Jaeger:        http://localhost:16686"
    echo
    print_status "Next steps:"
    echo "  1. cd backend && npm install"
    echo "  2. cd frontend && npm install"
    echo "  3. npm run dev (from root directory)"
    echo
    print_warning "Remember to:"
    echo "  - Copy .env.example to .env and update values"
    echo "  - Run database migrations: ./scripts/migrate.sh"
    echo "  - Seed initial data: ./scripts/seed-data.sh"
    echo
}

# Run main function
main "$@"