# Personal Finance Hub - Backend

A comprehensive financial management platform built with Node.js and TypeScript.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Start development server
npm run dev
```

## 📚 Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm test` - Run tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint errors
- `npm run format` - Format code with Prettier

## 🏗️ Architecture

This project follows Domain-Driven Design (DDD) and Clean Architecture principles:

```
src/
├── api/              # API routes and controllers
├── application/      # Application services and use cases
├── domain/          # Business logic and entities
├── infrastructure/  # External services and implementations
├── shared/          # Shared utilities and types
└── config/          # Configuration files
```

## 📊 Monitoring

- **Health Check**: `GET /health`
- **Metrics**: `GET /metrics` (Prometheus format)
- **API Docs**: `GET /docs` (Swagger UI - dev only)

## 🔧 Environment Variables

See `.env.example` for all available configuration options.

## 🧪 Testing

The project includes comprehensive testing setup:
- Unit tests with Jest
- Integration tests
- E2E tests

## 📝 API Documentation

When running in development mode, API documentation is available at `/docs`.

## 🐳 Docker

```bash
# Build image
docker build -t pfh-backend .

# Run container
docker run -p 3333:3333 pfh-backend
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📄 License

This project is licensed under the MIT License.
