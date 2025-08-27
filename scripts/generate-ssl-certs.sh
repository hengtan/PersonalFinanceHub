#!/bin/bash

# =============================================
# 📁 ./scripts/generate-ssl-certs.sh
# SSL Certificate Generation Script
# =============================================

set -e

echo "🔐 Generating SSL certificates for development..."

# Create SSL directory
mkdir -p ./infrastructure/docker/ssl

# Generate private key
openssl genrsa -out ./infrastructure/docker/ssl/key.pem 2048

# Generate certificate signing request
openssl req -new -key ./infrastructure/docker/ssl/key.pem -out ./infrastructure/docker/ssl/cert.csr -subj "/C=BR/ST=SP/L=Campinas/O=Personal Finance Hub/OU=Dev/CN=localhost"

# Generate self-signed certificate
openssl x509 -req -days 365 -in ./infrastructure/docker/ssl/cert.csr -signkey ./infrastructure/docker/ssl/key.pem -out ./infrastructure/docker/ssl/cert.pem

# Set proper permissions
chmod 400 ./infrastructure/docker/ssl/key.pem
chmod 444 ./infrastructure/docker/ssl/cert.pem

# Clean up CSR file
rm ./infrastructure/docker/ssl/cert.csr

echo "✅ SSL certificates generated successfully!"
echo "📁 Certificates location: ./infrastructure/docker/ssl/"

---

#!/bin/bash

# =============================================
# 📁 ./scripts/setup-infrastructure.sh
# Infrastructure Setup Script
# =============================================

set -e

echo "🚀 Setting up Personal Finance Hub infrastructure..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
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

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    print_error "Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if Docker Compose is available
if ! command -v docker-compose > /dev/null 2>&1 && ! command -v docker compose > /dev/null 2>&1; then
    print_error "Docker Compose is not installed. Please install Docker Compose and try again."
    exit 1
fi

# Create necessary directories
print_step "Creating directory structure..."
mkdir -p {backend/src/infrastructure/database/postgres/migrations,infrastructure/{docker/configs,monitoring/{prometheus,grafana/{datasources,dashboards},loki,promtail,alerting}},scripts,logs}
print_success "Directories created!"

# Generate SSL certificates
print_step "Generating SSL certificates..."
if [ ! -f "./infrastructure/docker/ssl/cert.pem" ]; then
    ./scripts/generate-ssl-certs.sh
else
    print_warning "SSL certificates already exist, skipping generation."
fi

# Create environment file
print_step "Creating environment file..."
cat > .env << EOF
# =============================================
# Personal Finance Hub - Environment Variables
# =============================================

# Application
NODE_ENV=development
APP_NAME=Personal Finance Hub
APP_VERSION=1.0.0

# Database - PostgreSQL
POSTGRES_HOST=postgres-master
POSTGRES_PORT=5432
POSTGRES_DB=personal_finance
POSTGRES_USER=pfh_admin
POSTGRES_PASSWORD=pfh_secure_2024

POSTGRES_READ_HOST=postgres-replica
POSTGRES_READ_PORT=5433

# Database - MongoDB
MONGODB_URI=mongodb://pfh_admin:mongo_secure_2024@mongo-primary:27017,mongo-secondary-1:27017,mongo-secondary-2:27017/personal_finance_read?replicaSet=rs0&authSource=admin

# Cache - Redis
REDIS_HOST=redis-master
REDIS_PORT=6379
REDIS_PASSWORD=redis_secure_2024
REDIS_READ_HOST=redis-replica
REDIS_READ_PORT=6380

# Message Queue - Kafka
KAFKA_BROKERS=kafka-1:29092,kafka-2:29093,kafka-3:29094
KAFKA_CLIENT_ID=pfh-backend

# Object Storage - MinIO
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=pfh_admin
MINIO_SECRET_KEY=minio_secure_2024
MINIO_BUCKET=pfh-attachments

# Security
JWT_SECRET=your_super_secure_jwt_secret_change_in_production_$(openssl rand -hex 32)
JWT_REFRESH_SECRET=your_super_secure_refresh_secret_change_in_production_$(openssl rand -hex 32)
BCRYPT_ROUNDS=12

# Monitoring
PROMETHEUS_ENDPOINT=http://prometheus:9090
GRAFANA_ENDPOINT=http://grafana:3000
LOKI_ENDPOINT=http://loki:3100
JAEGER_ENDPOINT=http://jaeger:14268/api/traces

# External APIs (Add your keys here)
FINANCIAL_API_KEY=your_financial_api_key_here
NOTIFICATION_SERVICE_KEY=your_notification_key_here

# Development
DEBUG=pfh:*
LOG_LEVEL=debug
ENABLE_CORS=true
EOF

print_success "Environment file created!"

# Set proper permissions
print_step "Setting file permissions..."
chmod +x ./scripts/*.sh
chmod 600 .env
print_success "Permissions set!"

# Pull required Docker images
print_step "Pulling Docker images..."
docker-compose pull
print_success "Images pulled!"

print_success "Infrastructure setup completed! 🎉"
echo ""
echo "📋 Next steps:"
echo "1. Review and customize the .env file with your specific configuration"
echo "2. Run: docker-compose up -d to start all services"
echo "3. Run: ./scripts/init-databases.sh to initialize databases"
echo "4. Access the applications:"
echo "   • Frontend: https://localhost"
echo "   • Backend API: https://localhost/api"
echo "   • Grafana: http://localhost:3001 (admin/grafana_secure_2024)"
echo "   • Kafka UI: http://localhost:8080"
echo "   • MinIO Console: http://localhost:9001 (pfh_admin/minio_secure_2024)"

---

#!/bin/bash

# =============================================
# 📁 ./scripts/init-databases.sh
# Database Initialization Script
# =============================================

set -e

echo "🗄️  Initializing databases..."

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_step() {
    echo -e "${BLUE}[DB-INIT]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Wait for services to be ready
print_step "Waiting for services to be ready..."
sleep 10

# Initialize PostgreSQL replication
print_step "Setting up PostgreSQL replication..."
docker-compose exec postgres-master bash -c "
psql -U pfh_admin -d personal_finance -c \"
CREATE USER replicator WITH REPLICATION ENCRYPTED PASSWORD 'repl_secure_2024';
SELECT pg_create_physical_replication_slot('replica_slot');
\"
"

# Configure replica
docker-compose exec postgres-replica bash -c "
echo 'standby_mode = on' >> /var/lib/postgresql/data/recovery.conf
echo \"primary_conninfo = 'host=postgres-master port=5432 user=replicator password=repl_secure_2024'\" >> /var/lib/postgresql/data/recovery.conf
echo \"primary_slot_name = 'replica_slot'\" >> /var/lib/postgresql/data/recovery.conf
"

# Restart replica to apply configuration
docker-compose restart postgres-replica

print_success "PostgreSQL replication configured!"

# Initialize MongoDB replica set (already done in mongo-init.js)
print_step "Checking MongoDB replica set..."
sleep 5
docker-compose exec mongo-primary mongosh --eval "rs.status()" --quiet
print_success "MongoDB replica set is ready!"

# Create Kafka topics
print_step "Creating Kafka topics..."
docker-compose exec kafka-1 kafka-topics --create \
  --bootstrap-server localhost:9092 \
  --replication-factor 3 \
  --partitions 6 \
  --topic user-events

docker-compose exec kafka-1 kafka-topics --create \
  --bootstrap-server localhost:9092 \
  --replication-factor 3 \
  --partitions 12 \
  --topic transaction-events

docker-compose exec kafka-1 kafka-topics --create \
  --bootstrap-server localhost:9092 \
  --replication-factor 3 \
  --partitions 3 \
  --topic notification-events

print_success "Kafka topics created!"

# Create MinIO buckets
print_step "Creating MinIO buckets..."
docker-compose exec minio mc alias set local http://localhost:9000 pfh_admin minio_secure_2024
docker-compose exec minio mc mb local/pfh-attachments
docker-compose exec minio mc mb local/pfh-backups
docker-compose exec minio mc policy set public local/pfh-attachments

print_success "MinIO buckets created!"

print_success "Database initialization completed! 🎉"
echo ""
echo "📊 Services Status:"
echo "• PostgreSQL Master: Ready with replication"
echo "• PostgreSQL Replica: Ready as read-only"
echo "• MongoDB Cluster: Ready with 3 nodes"
echo "• Redis Master/Replica: Ready for caching"
echo "• Kafka Cluster: Ready with topics created"
echo "• MinIO: Ready with buckets configured"

---

#!/bin/bash

# =============================================
# 📁 ./scripts/health-check.sh
# Infrastructure Health Check Script
# =============================================

set -e

echo "🏥 Performing infrastructure health check..."

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

check_service() {
    local service=$1
    local url=$2
    local expected_code=${3:-200}

    echo -n "Checking $service... "

    if curl -f -s -o /dev/null -w "%{http_code}" "$url" | grep -q "$expected_code"; then
        echo -e "${GREEN}✅ Healthy${NC}"
        return 0
    else
        echo -e "${RED}❌ Unhealthy${NC}"
        return 1
    fi
}

check_port() {
    local service=$1
    local host=$2
    local port=$3

    echo -n "Checking $service port $port... "

    if nc -z "$host" "$port" 2>/dev/null; then
        echo -e "${GREEN}✅ Open${NC}"
        return 0
    else
        echo -e "${RED}❌ Closed${NC}"
        return 1
    fi
}

echo -e "${BLUE}=== Port Connectivity Check ===${NC}"
check_port "PostgreSQL Master" localhost 5432
check_port "PostgreSQL Replica" localhost 5433
check_port "MongoDB Primary" localhost 27017
check_port "MongoDB Secondary 1" localhost 27018
check_port "MongoDB Secondary 2" localhost 27019
check_port "Redis Master" localhost 6379
check_port "Redis Replica" localhost 6380
check_port "Kafka 1" localhost 9092
check_port "Kafka 2" localhost 9093
check_port "Kafka 3" localhost 9094

echo -e "\n${BLUE}=== HTTP Service Check ===${NC}"
check_service "Frontend" "http://localhost:3000"
check_service "Backend API" "http://localhost:3333/health"
check_service "Nginx" "http://localhost:80/health"
check_service "Grafana" "http://localhost:3001/api/health"
check_service "Kafka UI" "http://localhost:8080"
check_service "MinIO Console" "http://localhost:9001/minio/health/live"
check_service "Prometheus" "http://localhost:9090/-/ready"

echo -e "\n${BLUE}=== Container Status Check ===${NC}"
docker-compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"

echo -e "\n${BLUE}=== Resource Usage ===${NC}"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}"

echo -e "\n${GREEN}Health check completed!${NC} 🏥"

---

# =============================================
# 📁 ./docker-compose.override.yml
# Docker Compose Development Overrides
# =============================================

version: '3.8'

services:
  # Backend Development Overrides
  backend:
    environment:
      # Development specific settings
      NODE_ENV: development
      DEBUG: "pfh:*"
      LOG_LEVEL: debug

      # Hot reload settings
      CHOKIDAR_USEPOLLING: "true"
      WATCHPACK_POLLING: "true"

    volumes:
      # Additional development volumes
      - ./backend/src:/app/src
      - ./backend/package.json:/app/package.json
      - ./backend/tsconfig.json:/app/tsconfig.json

    # Enable debugging
    command: npm run dev:debug

  # Frontend Development Overrides
  frontend:
    environment:
      # Next.js development settings
      NODE_ENV: development
      NEXT_TELEMETRY_DISABLED: 1
      FAST_REFRESH: "true"

    volumes:
      # Additional development volumes
      - ./frontend/src:/app/src
      - ./frontend/public:/app/public
      - ./frontend/package.json:/app/package.json
      - ./frontend/next.config.js:/app/next.config.js
      - ./frontend/tailwind.config.js:/app/tailwind.config.js

  # Nginx Development - Direct ports
  nginx:
    ports:
      - "8000:80"   # Alternative HTTP port
      - "8443:443"  # Alternative HTTPS port

---

# =============================================
# 📁 ./.gitignore
# Git Ignore File
# =============================================

# Environment files
.env
.env.local
.env.production
.env.test

# SSL Certificates (regenerate for each environment)
infrastructure/docker/ssl/*.pem
infrastructure/docker/ssl/*.csr

# Logs
logs/
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Docker volumes data
postgres_*_data/
mongo_*_data/
redis_*_data/
kafka*_data/
zookeeper_*/
minio_data/
prometheus_data/
grafana_data/
loki_data/

# Node.js
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.npm
.yarn-integrity

# Next.js
.next/
out/
build/

# Production builds
dist/
build/

# IDE files
.vscode/
.idea/
*.swp
*.swo
*~

# OS generated files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# Testing
coverage/
.nyc_output

# Temporary files
tmp/
temp/

---

# =============================================
# 📁 ./README.md
# Project Documentation
# =============================================

# 🏦 Personal Finance Hub

A modern, scalable personal finance management platform built with **Node.js**, **React**, and **microservices architecture**.

## 🚀 Quick Start

```bash
# 1. Clone the repository
git clone <repository-url>
cd personal-finance-hub

# 2. Setup infrastructure
chmod +x scripts/*.sh
./scripts/setup-infrastructure.sh

# 3. Start all services
docker-compose up -d

# 4. Initialize databases
./scripts/init-databases.sh

# 5. Run health check
./scripts/health-check.sh
```

## 🏗️ Architecture Overview

### **Backend Stack**
- **Node.js 22** with TypeScript
- **Express.js** / **Fastify** for API
- **PostgreSQL** (Write) + **MongoDB** (Read)
- **Redis** for caching and sessions
- **Kafka** for event streaming

### **Frontend Stack**
- **React 19** with **Next.js**
- **TypeScript** for type safety
- **Tailwind CSS** for styling
- **React Query** for state management

### **Infrastructure**
- **Docker Compose** for orchestration
- **Nginx** as reverse proxy
- **Prometheus + Grafana** for monitoring
- **Loki + Promtail** for logging
- **Jaeger** for distributed tracing

## 📊 Services & Ports

| Service | Port | Description |
|---------|------|-------------|
| Frontend | 3000 | Next.js React App |
| Backend API | 3333 | Node.js REST API |
| Nginx | 80/443 | Reverse Proxy |
| PostgreSQL Master | 5432 | Write Database |
| PostgreSQL Replica | 5433 | Read Database |
| MongoDB Primary | 27017 | Read Model DB |
| Redis Master | 6379 | Cache & Sessions |
| Kafka Cluster | 9092-9094 | Event Streaming |
| Grafana | 3001 | Metrics Dashboard |
| Prometheus | 9090 | Metrics Collection |
| MinIO | 9000/9001 | Object Storage |

## 🗄️ Database Architecture

### **CQRS Pattern**
- **PostgreSQL**: Commands (Write Model)
- **MongoDB**: Queries (Read Model)
- **Event Sourcing**: Kafka for sync

### **Replication**
- **PostgreSQL**: Master/Replica setup
- **MongoDB**: 3-node replica set
- **Redis**: Master/Replica caching

## 🔧 Development

### **Backend Development**
```bash
cd backend
npm install
npm run dev:debug  # Debug mode on port 9229
```

### **Frontend Development**
```bash
cd frontend
npm install
npm run dev        # Development server
```

### **Database Migrations**
```bash
# PostgreSQL
npm run migration:create <name>
npm run migration:run

# MongoDB
npm run seed:create <name>
npm run seed:run
```

## 📈 Monitoring

- **Grafana**: http://localhost:3001 (`admin` / `grafana_secure_2024`)
- **Prometheus**: http://localhost:9090
- **Kafka UI**: http://localhost:8080
- **Jaeger**: http://localhost:16686

## 🛠️ Utilities

```bash
# Health check all services
./scripts/health-check.sh

# View logs
docker-compose logs -f [service-name]

# Scale services
docker-compose up -d --scale backend=3

# Database backup
./scripts/backup-databases.sh

# SSL certificate renewal
./scripts/generate-ssl-certs.sh
```

## 🔒 Security

- **SSL/TLS** encryption
- **JWT** authentication
- **Rate limiting** via Nginx
- **Input validation** with Joi/Yup
- **SQL injection** protection with Prisma
- **CORS** configuration

## 🚀 Deployment

### **Production Environment**
```bash
# Use production compose file
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Or with environment
NODE_ENV=production docker-compose up -d
```

### **Kubernetes Deployment**
```bash
# Generate k8s manifests
kompose convert

# Deploy to cluster
kubectl apply -f k8s/
```

## 📝 API Documentation

- **OpenAPI/Swagger**: http://localhost:3333/docs
- **GraphQL Playground**: http://localhost:3333/graphql

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Built with ❤️ by Pateta o DEV** 🚀