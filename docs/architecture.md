# Personal Finance Hub - Arquitetura Detalhada

## 🏗️ Visão Geral da Arquitetura

O Personal Finance Hub segue os princípios de **Clean Architecture**, **Domain-Driven Design (DDD)** e **Event-Driven Architecture** para garantir escalabilidade, manutenibilidade e performance.

## 📐 Diagrama de Arquitetura Geral

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                   FRONTEND                                      │
│                     (Next.js + React + TypeScript)                             │
└─────────────────────────┬───────────────────────────────────────────────────────┘
                          │ HTTP/WebSocket
                          │
┌─────────────────────────▼───────────────────────────────────────────────────────┐
│                                API GATEWAY                                     │
│                       (Nginx + Load Balancer)                                 │
└─────────────────────────┬───────────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────────────────────┐
│                              BACKEND SERVICES                                  │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐               │
│ │   Auth      │ │ Transactions│ │ Dashboard   │ │   Reports   │               │
│ │  Service    │ │   Service   │ │   Service   │ │   Service   │               │
│ └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘               │
└─────────────────────────┬───────────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────────────────────┐
│                           EVENT STREAMING                                      │
│                              (Kafka)                                           │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐              │
│  │   Transactions   │ │     Budget       │ │   Dashboard      │              │
│  │      Topic       │ │     Topic        │ │     Topic        │              │
│  └──────────────────┘ └──────────────────┘ └──────────────────┘              │
└─────────────────────────┬───────────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────────────────────┐
│                            DATA LAYER                                          │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐               │
│ │ PostgreSQL  │ │  MongoDB    │ │    Redis    │ │   MinIO     │               │
│ │   (Write)   │ │   (Read)    │ │  (Cache)    │ │ (Storage)   │               │
│ └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘               │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## 🧱 Clean Architecture em Camadas

### **1. Presentation Layer (API)**
```
api/
├── controllers/          # 🎮 HTTP Controllers
│   ├── auth.controller.ts
│   ├── transaction.controller.ts
│   ├── dashboard.controller.ts
│   └── report.controller.ts
├── middlewares/          # 🛡️ Request/Response Processing  
│   ├── auth.middleware.ts
│   ├── validation.middleware.ts
│   ├── correlation-id.middleware.ts
│   └── error-handler.middleware.ts
├── routes/              # 🛣️ Route Definitions
│   ├── auth.routes.ts
│   ├── transaction.routes.ts
│   └── dashboard.routes.ts
└── validators/          # ✅ Input Validation
    ├── auth.validator.ts
    ├── transaction.validator.ts
    └── dashboard.validator.ts
```

### **2. Application Layer (Use Cases)**
```
core/application/
├── services/            # 🔧 Application Services
│   ├── auth.service.ts
│   ├── transaction.service.ts
│   └── dashboard.service.ts
└── use-cases/           # 📋 Business Use Cases
    ├── auth/
    │   ├── login-user.use-case.ts
    │   └── register-user.use-case.ts
    ├── transaction/
    │   ├── create-transaction.use-case.ts
    │   ├── list-transactions.use-case.ts
    │   └── update-transaction.use-case.ts
    └── dashboard/
        └── calculate-dashboard.use-case.ts
```

### **3. Domain Layer (Business Logic)**
```
core/domain/
├── entities/            # 🏛️ Business Entities
│   ├── user.entity.ts
│   ├── transaction.entity.ts
│   ├── budget.entity.ts
│   └── ledger-entry.entity.ts
├── value-objects/       # 💎 Value Objects
│   ├── money.vo.ts
│   ├── email.vo.ts
│   ├── cpf.vo.ts
│   └── period.vo.ts
├── events/              # 📢 Domain Events
│   ├── transaction-created.event.ts
│   ├── budget-exceeded.event.ts
│   └── user-registered.event.ts
├── repositories/        # 🗄️ Repository Interfaces
│   ├── transaction.repository.ts
│   └── user.repository.ts
└── services/           # 🧠 Domain Services
    ├── budget.service.ts
    └── ledger.service.ts
```

### **4. Infrastructure Layer (External Concerns)**
```
infrastructure/
├── database/           # 🗃️ Data Persistence
│   ├── postgres/       # Write Model
│   ├── mongodb/        # Read Model  
│   └── redis/          # Cache Layer
├── messaging/          # 📨 Event Streaming
│   ├── kafka/          # Event Bus
│   ├── publishers/     # Event Publishers
│   └── consumers/      # Event Consumers
├── monitoring/         # 📊 Observability
│   ├── logger.service.ts
│   ├── metrics.service.ts
│   └── tracer.service.ts
├── external/           # 🌐 Third-party Services
│   ├── email/
│   ├── storage/
│   └── ai/
└── patterns/           # 🔄 Infrastructure Patterns
    ├── outbox.service.ts
    └── inbox.service.ts
```

## 🔄 Event-Driven Architecture Flow

### **Fluxo de Criação de Transação**

```
1. Client Request
   POST /api/transactions
        │
        ▼
2. Controller Layer
   TransactionController.create()
        │
        ▼
3. Use Case Layer  
   CreateTransactionUseCase.execute()
        │
        ▼
4. Domain Layer
   Transaction.create() + TransactionCreatedEvent
        │
        ▼
5. Infrastructure - Outbox Pattern
   ┌─────────────────┐    ┌─────────────────┐
   │  PostgreSQL     │    │    Outbox       │
   │ (Transaction)   │◄──►│   (Events)      │
   └─────────────────┘    └─────────────────┘
        │                         │
        ▼                         ▼
6. Event Publishing
   OutboxDispatcher → Kafka Producer
        │
        ▼
7. Event Consumers
   ┌─────────────────┐    ┌─────────────────┐
   │   Dashboard     │    │   MongoDB       │
   │   Consumer      │    │   Projection    │
   └─────────────────┘    └─────────────────┘
        │                         │
        ▼                         ▼
8. Cache Invalidation        Read Model Update
   Redis.del("dashboard:*")    MongoDB.updateSummary()
```

## 🗄️ Estratégia de Dados (CQRS + Event Sourcing)

### **Write Model (PostgreSQL)**
```sql
-- Transações (Comandos)
CREATE TABLE transactions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    description TEXT NOT NULL,
    type transaction_type NOT NULL,
    category VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    version INTEGER DEFAULT 1
);

-- Event Store (Auditoria)
CREATE TABLE domain_events (
    id UUID PRIMARY KEY,
    aggregate_id UUID NOT NULL,
    event_type VARCHAR(255) NOT NULL,
    event_data JSONB NOT NULL,
    occurred_at TIMESTAMP DEFAULT NOW(),
    version INTEGER NOT NULL
);

-- Outbox Pattern (Garantia Transacional)
CREATE TABLE outbox (
    id UUID PRIMARY KEY,
    event_type VARCHAR(255) NOT NULL,
    event_data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    processed_at TIMESTAMP NULL
);
```

### **Read Model (MongoDB)**
```javascript
// Dashboard Aggregations (Consultas Otimizadas)
{
  _id: ObjectId("..."),
  userId: "user-123",
  period: "2024-08",
  summary: {
    totalIncome: 5000.00,
    totalExpenses: 3200.50,
    netIncome: 1799.50,
    transactionCount: 45
  },
  categoryBreakdown: [
    { category: "food", amount: 800.00, percentage: 25.0 },
    { category: "transport", amount: 400.00, percentage: 12.5 }
  ],
  dailyTrends: [
    { date: "2024-08-01", income: 0, expenses: 45.30 },
    { date: "2024-08-02", income: 3000, expenses: 120.80 }
  ],
  lastUpdated: ISODate("2024-08-15T10:30:00Z"),
  version: 3
}

// Transaction Projections (Views Desnormalizadas)
{
  _id: ObjectId("..."),
  transactionId: "trans-123",
  userId: "user-123", 
  amount: 150.75,
  description: "Almoço - Restaurante",
  category: "food",
  type: "expense",
  date: ISODate("2024-08-15T12:30:00Z"),
  location: {
    name: "Restaurante Bom Sabor",
    lat: -23.550520,
    lng: -46.633308
  },
  tags: ["restaurante", "almoço", "trabalho"],
  metadata: {
    paymentMethod: "credit_card",
    installments: 1,
    recurring: false
  }
}
```

### **Cache Layer (Redis)**
```bash
# Session Management
SET "session:user:123" '{"userId":"123","expires":1692123456}' EX 900

# Dashboard Cache (Cache-Aside Pattern)
SET "dashboard:user:123:2024-08" '{"summary":{...},"trends":[...]}' EX 300

# Rate Limiting
SET "rate_limit:127.0.0.1:auth" "5" EX 60
SET "rate_limit:user:123:transactions" "100" EX 3600

# Idempotency Keys
SET "idempotency:trans:abc123" '{"transactionId":"trans-456"}' EX 86400

# Lock Pattern (Anti-Stampede)
SET "lock:dashboard:user:123" "processing" EX 30 NX
```

## 📨 Kafka Topics & Event Schema

### **Topic: personal_finance.transactions.v1**
```json
{
  "eventId": "evt-123",
  "aggregateId": "trans-456",
  "eventType": "TransactionCreated",
  "version": 1,
  "timestamp": "2024-08-15T12:30:00Z",
  "userId": "user-123",
  "correlationId": "corr-789",
  "payload": {
    "transactionId": "trans-456",
    "amount": 150.75,
    "description": "Almoço - Restaurante",
    "category": "food",
    "type": "expense",
    "accountId": "acc-001",
    "metadata": {
      "paymentMethod": "credit_card",
      "location": {
        "name": "Restaurante Bom Sabor",
        "coordinates": [-23.550520, -46.633308]
      }
    }
  }
}
```

### **Topic: personal_finance.dashboard.v1**
```json
{
  "eventId": "evt-124",
  "eventType": "DashboardInvalidated",
  "version": 1,
  "timestamp": "2024-08-15T12:30:01Z",
  "userId": "user-123",
  "payload": {
    "reason": "TransactionCreated",
    "affectedPeriods": ["2024-08"],
    "cacheKeys": [
      "dashboard:user:123:2024-08",
      "summary:user:123:current"
    ]
  }
}
```

## 🔐 Segurança e Padrões

### **Authentication Flow**
```
1. POST /auth/login
   ┌─────────────────┐
   │ Username/Password│
   └─────────────────┘
           │
           ▼
   ┌─────────────────┐
   │ Validate Credentials │
   └─────────────────┘
           │
           ▼
   ┌─────────────────┐    ┌─────────────────┐
   │ Generate JWT    │    │ HttpOnly Cookie │
   │ Access Token    │◄──►│ Refresh Token   │
   └─────────────────┘    └─────────────────┘
           │                       │
           ▼                       ▼
   ┌─────────────────┐    ┌─────────────────┐
   │ Redis Session   │    │ Token Blacklist │
   │ Storage         │    │ (on logout)     │
   └─────────────────┘    └─────────────────┘
```

### **Authorization Pattern**
```typescript
// Middleware de Autorização
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('user', 'admin')
@ApiSecurity('bearer')
async createTransaction(
  @User() user: AuthUser,
  @Body() request: CreateTransactionRequest
) {
  // Verificação de ownership
  if (!this.canAccessResource(user.id, request.accountId)) {
    throw new ForbiddenException('Access denied');
  }
  
  // Limitação por quota
  await this.rateLimitService.checkQuota(user.id, 'transactions');
  
  return this.transactionService.create(user.id, request);
}
```

## 📊 Observabilidade e Métricas

### **Correlation ID Flow**
```
Request ID: req-123 → Correlation ID: corr-456

API Layer:     [corr-456] POST /transactions → 201 Created
Use Case:      [corr-456] CreateTransaction started
Domain:        [corr-456] Transaction created: trans-789  
Repository:    [corr-456] PostgreSQL INSERT successful
Event Bus:     [corr-456] Event published to Kafka
Consumer:      [corr-456] Dashboard update processed
Cache:         [corr-456] Redis cache invalidated
```

### **Métricas Principais**
```prometheus
# Business Metrics
pfh_transactions_total{type="expense",category="food"} 1420
pfh_user_registrations_total{source="web"} 245
pfh_revenue_total{period="monthly"} 15420.50

# Technical Metrics  
pfh_http_requests_duration_seconds{method="POST",route="/transactions"} 0.145
pfh_database_connections_active{database="postgresql"} 12
pfh_kafka_consumer_lag_total{topic="transactions",group="dashboard"} 0
pfh_cache_hit_ratio{service="dashboard"} 0.95
```

### **Alertas Configurados**
- **SLO Violations**: P95 > 2s, Error Rate > 1%
- **Business KPIs**: Daily revenue drop > 20%  
- **Infrastructure**: DB connections > 80%, Kafka lag > 1000
- **Security**: Failed auth attempts > 100/hour

## 🚀 Estratégia de Deployment

### **CI/CD Pipeline**
```yaml
# GitHub Actions Workflow
name: Deploy Personal Finance Hub

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Run Unit Tests
        run: npm test
      - name: Run Integration Tests  
        run: npm run test:integration
      - name: Check Coverage (90%)
        run: npm run test:coverage

  security:
    runs-on: ubuntu-latest  
    steps:
      - name: Security Scan
        run: npm audit --audit-level high
      - name: SAST Analysis
        run: npx snyk test

  deploy:
    needs: [test, security]
    runs-on: ubuntu-latest
    steps:
      - name: Build Docker Image
        run: docker build -t pfh-backend:${{ github.sha }} .
      - name: Deploy to Staging
        run: kubectl apply -f k8s/staging/
      - name: Smoke Tests
        run: npm run test:smoke
      - name: Deploy to Production  
        run: kubectl apply -f k8s/production/
```

### **Zero-Downtime Deployment**
```bash
# Rolling Update Strategy
kubectl rollout status deployment/pfh-backend
kubectl set image deployment/pfh-backend backend=pfh-backend:v2.1.0
kubectl rollout status deployment/pfh-backend

# Health Check Verification
kubectl get pods -l app=pfh-backend
curl -f http://api.personalfinance.com/health
```

## 🔄 Disaster Recovery

### **Backup Strategy**
- **PostgreSQL**: Continuous WAL archiving + Daily full backup
- **MongoDB**: Replica set + Point-in-time recovery  
- **Redis**: RDB snapshots + AOF persistence
- **Kafka**: Multi-region replication

### **RTO/RPO Targets**
- **RTO** (Recovery Time Objective): < 30 minutes
- **RPO** (Recovery Point Objective): < 5 minutes
- **Availability SLA**: 99.9% uptime

---

Esta arquitetura garante **escalabilidade**, **consistência de dados**, **observabilidade completa** e **alta disponibilidade** para o Personal Finance Hub, seguindo as melhores práticas de sistemas distribuídos e arquitetura orientada por eventos.