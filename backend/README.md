# Personal Finance Hub - Backend

A comprehensive financial management platform built with Node.js, TypeScript, and Event-Driven Architecture following Domain-Driven Design (DDD) principles.

## 📈 Project Status & Sprint Progress

### ✅ **Pré-Sprint (Hardening) - COMPLETED**
- **Infrastructure**: Full docker-compose.yml with MongoDB RS, Redis Cluster, Kafka 3-node cluster
- **Backend Foundation**: Fastify + TypeScript with correlation-id, Pino logging, Helmet, rate limiting
- **Monitoring**: Prometheus metrics, Grafana dashboards, Loki log aggregation, Jaeger tracing
- **Event-Driven**: Kafka producers/consumers, Event Store, Outbox pattern implementation
- **Cache Strategy**: Redis cache-aside pattern with anti-stampede locks
- **Security**: CORS, CSP, payload limits, PII masking ready

### ✅ **Sprint 1 (Autenticação) - COMPLETED**
- **Auth System**: Complete JWT authentication with refresh tokens
- **Security**: HttpOnly+Secure+SameSite cookies, token blacklist (Redis)
- **API**: POST /auth/register, /auth/login, /auth/refresh, /auth/logout
- **Documentation**: OpenAPI/Swagger integration
- **Rate Limiting**: Strong rate limits on auth endpoints

### 🚧 **Sprint 2 (Dashboard Base) - IN PROGRESS**
- **Dashboard API**: GET /dashboard with basic financial overview
- **Caching**: Redis cache with TTL for dashboard data
- **Budget Models**: Initial budget structure implemented
- **Missing**: Complete budget CRUD operations, percentage validation

### 🚧 **Sprint 3 (Transações) - PARTIAL**
- **Transaction CRUD**: Complete API implementation with validation
- **Event-Driven**: Kafka events for transaction operations
- **Idempotency**: Idempotency-Key support for mutations
- **Missing**: Ledger double-entry implementation, UoW pattern completion

### 🔄 **Remaining Sprints**: 4-12 planned for Q4/Q1

## 🚀 Quick Start

```bash
# Full stack with Docker (recommended)
docker-compose up -d

# Development mode
npm install
cp .env.example .env
npm run dev
```

## 🏗️ Architecture

### **Clean Architecture + Event-Driven Design**

```
src/
├── api/                    # 🌐 Presentation Layer
│   ├── controllers/        # HTTP controllers (Fastify)
│   ├── middlewares/        # Request/Response middlewares
│   ├── routes/            # Route definitions
│   └── validators/        # Input validation schemas
├── core/                  # 🏛️ Business Logic Layer
│   ├── application/       # Application Services & Use Cases
│   │   ├── services/      # Domain services orchestration
│   │   └── use-cases/     # Specific business operations
│   └── domain/            # 🧠 Domain Layer (Pure Business Logic)
│       ├── entities/      # Business entities
│       ├── events/        # Domain events
│       ├── repositories/  # Repository interfaces
│       ├── services/      # Domain services
│       └── value-objects/ # Value objects
├── infrastructure/        # 🔧 Infrastructure Layer
│   ├── database/         # Data persistence (PostgreSQL, MongoDB)
│   ├── messaging/        # Event streaming (Kafka)
│   ├── cache/            # Caching (Redis)
│   ├── monitoring/       # Observability stack
│   ├── external/         # Third-party integrations
│   └── patterns/         # Infrastructure patterns (Outbox, Inbox)
├── jobs/                 # 🔄 Background Processing
│   ├── processors/       # Job processors
│   └── schedulers/       # Scheduled tasks
└── shared/               # 🔗 Shared Utilities
    ├── constants/        # Application constants
    ├── exceptions/       # Custom exceptions
    ├── types/            # TypeScript types
    └── utils/            # Helper functions
```

### **Data Flow Architecture**

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│   Client    │◄──►│   Fastify    │◄──►│ Use Cases   │
│ (Frontend)  │    │  (API Layer) │    │ (Business)  │
└─────────────┘    └──────────────┘    └─────────────┘
                           │                    │
                           ▼                    ▼
              ┌─────────────────────┐    ┌─────────────┐
              │    Middlewares      │    │  Domain     │
              │ • Auth              │    │ Entities    │
              │ • Validation        │    │ & Services  │
              │ • Rate Limiting     │    └─────────────┘
              │ • Correlation ID    │           │
              └─────────────────────┘           ▼
                           │            ┌─────────────┐
                           ▼            │ Repository  │
                ┌─────────────────┐     │ Interfaces  │
                │   Controllers   │     └─────────────┘
                └─────────────────┘           │
                           │                  ▼
                           ▼         ┌─────────────────┐
                  ┌─────────────┐    │ Infrastructure  │
                  │   Events    │◄───│ • PostgreSQL    │
                  │   Kafka     │    │ • MongoDB       │
                  └─────────────┘    │ • Redis Cache   │
                           │         │ • Event Store   │
                           ▼         └─────────────────┘
                  ┌─────────────┐
                  │ Consumers   │
                  │ Background  │
                  │ Jobs        │
                  └─────────────┘
```

## 🗃️ Database Strategy

### **Write Model (PostgreSQL)**
- **Transactional Operations**: ACID compliance for financial data
- **Event Store**: Domain events persistence
- **User Management**: Authentication & authorization data

### **Read Model (MongoDB)**
- **Query Optimization**: Denormalized views for fast reads
- **Dashboard Data**: Pre-aggregated financial summaries
- **Reporting**: Flexible document structure for analytics

### **Cache Layer (Redis)**
- **Session Storage**: JWT refresh tokens, user sessions
- **Application Cache**: Dashboard data, frequently accessed queries
- **Rate Limiting**: Request throttling and quota management
- **Locks**: Anti-stampede pattern for cache warming

## 🔄 Event-Driven Patterns

### **Implemented Patterns**
- **Outbox Pattern**: Transactional guarantee for event publishing
- **Saga Orchestration**: Complex business transaction coordination
- **Event Sourcing**: Complete audit trail of domain events
- **CQRS**: Command-Query Responsibility Segregation

### **Kafka Topics**
```
personal_finance.transactions.v1        # Transaction events
personal_finance.budget.v1              # Budget events  
personal_finance.dashboard.v1           # Dashboard invalidation
personal_finance.sync.v1                # Data synchronization
personal_finance.notifications.v1       # User notifications
```

## 📊 Monitoring & Observability

### **Metrics (Prometheus)**
- API endpoint performance
- Database connection pools
- Kafka consumer lag
- Redis hit/miss ratios
- Business KPIs (transactions/minute, user growth)

### **Logs (Loki + Pino)**
- Structured JSON logging with correlation IDs
- Error tracking with stack traces
- Performance monitoring
- Audit trails for financial operations

### **Tracing (Jaeger)**
- Distributed request tracing
- Service dependency mapping
- Performance bottleneck identification

### **Dashboards (Grafana)**
- System health overview
- Application metrics
- Business intelligence dashboards
- Real-time alerting

## 🔒 Security Implementation

### **Authentication & Authorization**
- JWT access tokens (15min TTL)
- Refresh tokens in HttpOnly cookies
- Token rotation on refresh
- Redis-based token blacklist

### **API Security**
- Rate limiting (100 req/min per IP)
- CORS with strict origin policy
- Helmet.js security headers
- Request payload size limits
- Input validation with Zod schemas

### **Data Protection**
- PII field masking in logs
- Encrypted sensitive data at rest
- Secure communication (TLS)
- LGPD compliance ready

## 📚 Available Scripts

```bash
# Development
npm run dev              # Start with hot reload
npm run dev:docker       # Start with docker-compose

# Building
npm run build           # Production build
npm run start           # Start production server

# Testing
npm test                # Run all tests
npm run test:unit       # Unit tests only
npm run test:integration # Integration tests
npm run test:e2e        # End-to-end tests
npm run test:coverage   # Coverage report (target: 90%)

# Code Quality
npm run lint            # ESLint check
npm run lint:fix        # Fix linting issues
npm run format          # Prettier formatting
npm run type-check      # TypeScript compilation check

# Database
npm run migrate         # Run database migrations
npm run seed            # Seed development data
npm run db:reset        # Reset database (dev only)

# Docker
npm run docker:build    # Build Docker image
npm run docker:up       # Start services
npm run docker:down     # Stop services
```

## 🔧 Environment Configuration

### **Required Environment Variables**
```bash
# Application
NODE_ENV=development|test|production
PORT=3333
API_PREFIX=/api

# PostgreSQL (Write)
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=personal_finance
POSTGRES_USER=pfh_admin
POSTGRES_PASSWORD=secure_password

# MongoDB (Read)
MONGODB_URI=mongodb://localhost:27017/personal_finance_read

# Redis (Cache)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=redis_password

# Kafka (Events)
KAFKA_BROKERS=localhost:9092,localhost:9093,localhost:9094

# Security
JWT_SECRET=your_jwt_secret
JWT_REFRESH_SECRET=your_refresh_secret
ENCRYPTION_KEY=your_encryption_key

# Monitoring
PROMETHEUS_ENDPOINT=http://localhost:9090
JAEGER_ENDPOINT=http://localhost:14268/api/traces
```

## 🧪 Testing Strategy

### **Test Coverage: 90% Target**
- **Unit Tests**: Domain logic, services, utilities
- **Integration Tests**: Repository implementations, external services
- **E2E Tests**: Complete API workflows
- **Contract Tests**: External service mocks

### **Test Tools**
- **Jest**: Test framework with TypeScript support
- **Supertest**: HTTP endpoint testing
- **MongoDB Memory Server**: In-memory database for tests
- **Redis Mock**: In-memory cache for tests
- **Test Containers**: Real database testing (CI/CD)

## 🚀 Deployment

### **Production Architecture**
```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Nginx     │◄───│  Load       │◄───│   CDN       │
│  (Reverse   │    │ Balancer    │    │ (Static)    │
│   Proxy)    │    │             │    │             │
└─────────────┘    └─────────────┘    └─────────────┘
       │                   │
       ▼                   ▼
┌─────────────┐    ┌─────────────┐
│  Backend    │    │  Backend    │
│ Instance 1  │    │ Instance 2  │
└─────────────┘    └─────────────┘
       │                   │
       └───────┬───────────┘
               ▼
┌─────────────────────────────────┐
│        Database Cluster         │
│ • PostgreSQL Master/Replica     │
│ • MongoDB Replica Set          │
│ • Redis Cluster               │
│ • Kafka Cluster              │
└─────────────────────────────────┘
```

### **CI/CD Pipeline**
- **GitHub Actions**: Automated testing and deployment
- **Multi-stage builds**: Optimized Docker images
- **Health checks**: Zero-downtime deployments
- **Rollback strategy**: Quick recovery from failures

## 📝 API Documentation

### **Available Endpoints**
- **Health**: `GET /api/health` - Service health check
- **Metrics**: `GET /api/metrics` - Prometheus metrics
- **Docs**: `GET /api/docs` - OpenAPI/Swagger documentation

### **Authentication API**
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Token refresh
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Current user info

### **Dashboard API**
- `GET /api/dashboard` - Financial overview
- `GET /api/dashboard/summary` - Quick summary
- `GET /api/dashboard/categories` - Spending breakdown
- `GET /api/dashboard/trends` - Financial trends

### **Transaction API**
- `POST /api/transactions` - Create transaction
- `GET /api/transactions` - List transactions
- `GET /api/transactions/:id` - Get transaction
- `PUT /api/transactions/:id` - Update transaction
- `DELETE /api/transactions/:id` - Delete transaction
- `GET /api/transactions/stats/summary` - Transaction statistics

## 🤝 Contributing

### **Development Workflow**
1. Fork the repository
2. Create feature branch from `main`
3. Follow conventional commits
4. Add tests for new features
5. Ensure 90% test coverage
6. Submit pull request

### **Code Standards**
- **TypeScript**: Strict mode enabled
- **ESLint**: Airbnb configuration
- **Prettier**: Code formatting
- **Husky**: Pre-commit hooks
- **Conventional Commits**: Semantic versioning

## 🗺️ Roadmap

### **Q4 2024**
- Sprint 4: Transaction filters & CSV import
- Sprint 5: Account management & cash flow
- Sprint 6: Savings goals & planning

### **Q1 2025**
- Sprint 7: Interactive reports & PDF export
- Sprint 8: Net worth tracking
- Sprint 9: Financial simulators

### **Q2 2025**
- Sprint 10: Notifications & subscriptions
- Sprint 11: Data lake & advanced analytics
- Sprint 12: AI forecasting & NLP queries

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Built with ❤️ using Node.js, TypeScript, Fastify, PostgreSQL, MongoDB, Redis, and Kafka**
