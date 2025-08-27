#!/bin/bash

# =============================================================================
# PERSONAL FINANCE HUB - SETUP SCRIPT
# Automatiza a criação da estrutura de diretórios e configuração inicial
# =============================================================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions for colored output
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_header() {
    echo -e "\n${BLUE}=== $1 ===${NC}\n"
}

# Check if we're in the backend directory
if [[ ! -f "package.json" ]]; then
    print_error "Please run this script from the backend directory!"
    exit 1
fi

print_header "Personal Finance Hub - Backend Setup"

# Create directory structure
print_info "Creating directory structure..."

directories=(
    "src/api/routes"
    "src/infrastructure/monitoring"
    "src/infrastructure/database"
    "src/infrastructure/cache"
    "src/infrastructure/messaging"
    "src/infrastructure/storage"
    "src/application/services"
    "src/application/use-cases"
    "src/domain/entities"
    "src/domain/repositories"
    "src/domain/events"
    "src/shared/types"
    "src/shared/utils"
    "src/shared/constants"
    "src/config"
    "test/unit"
    "test/integration"
    "test/e2e"
    "logs"
)

for dir in "${directories[@]}"; do
    if [[ ! -d "$dir" ]]; then
        mkdir -p "$dir"
        print_success "Created directory: $dir"
    else
        print_warning "Directory already exists: $dir"
    fi
done

# Create .env file if it doesn't exist
if [[ ! -f ".env" ]]; then
    if [[ -f ".env.example" ]]; then
        cp .env.example .env
        print_success "Created .env file from .env.example"
        print_warning "Please update .env with your actual configuration values!"
    else
        print_warning ".env.example not found - you'll need to create .env manually"
    fi
else
    print_warning ".env file already exists - skipping"
fi

# Install dependencies if node_modules doesn't exist
if [[ ! -d "node_modules" ]]; then
    print_info "Installing dependencies..."

    if command -v npm &> /dev/null; then
        npm install
        print_success "Dependencies installed successfully!"
    else
        print_error "npm is not installed! Please install Node.js and npm first."
        exit 1
    fi
else
    print_warning "node_modules already exists - skipping dependency installation"
fi

# Create additional config files
print_info "Creating additional configuration files..."

# Create .gitignore if it doesn't exist
if [[ ! -f ".gitignore" ]]; then
    cat > .gitignore << EOF
# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Build output
dist/
build/

# Logs
logs/
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
lerna-debug.log*

# Runtime data
pids/
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/
*.lcov

# nyc test coverage
.nyc_output/

# Dependency directories
node_modules/
jspm_packages/

# TypeScript cache
*.tsbuildinfo

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

# Nuxt.js build / generate output
.nuxt
dist

# Storybook build outputs
.out
.storybook-out

# Temporary folders
tmp/
temp/

# Editor directories and files
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

# Docker
.dockerignore

# Database
*.db
*.sqlite
*.sqlite3

# Test
test-results/
playwright-report/
playwright/.cache/
EOF
    print_success "Created .gitignore"
fi

# Create .dockerignore if it doesn't exist
if [[ ! -f ".dockerignore" ]]; then
    cat > .dockerignore << EOF
node_modules
npm-debug.log
Dockerfile*
docker-compose*
.dockerignore
.git
.gitignore
README.md
.env
.nyc_output
coverage
.nyc_output
logs
*.log
dist
.cache
.parcel-cache
.next
.nuxt
.vscode
.idea
*.swp
*.swo
*~
.DS_Store
Thumbs.db
EOF
    print_success "Created .dockerignore"
fi

# Create eslint config if it doesn't exist
if [[ ! -f ".eslintrc.js" ]]; then
    cat > .eslintrc.js << 'EOF'
module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint/eslint-plugin'],
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended',
    'prettier'
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.js', 'dist/**/*'],
  rules: {
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'prefer-const': 'error',
    'no-console': 'warn'
  },
};
EOF
    print_success "Created .eslintrc.js"
fi

# Create prettier config if it doesn't exist
if [[ ! -f ".prettierrc" ]]; then
    cat > .prettierrc << EOF
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "arrowParens": "avoid",
  "endOfLine": "lf"
}
EOF
    print_success "Created .prettierrc"
fi

# Create Jest config if it doesn't exist
if [[ ! -f "jest.config.js" ]]; then
    cat > jest.config.js << 'EOF'
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/server.ts',
    '!src/**/*.interface.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  testTimeout: 10000,
  clearMocks: true,
  restoreMocks: true,
};
EOF
    print_success "Created jest.config.js"
fi

# Create test setup file
if [[ ! -f "test/setup.ts" ]]; then
    cat > test/setup.ts << 'EOF'
import 'reflect-metadata';

// Global test setup
beforeAll(() => {
  // Setup before all tests
});

afterAll(() => {
  // Cleanup after all tests
});

beforeEach(() => {
  // Setup before each test
});

afterEach(() => {
  // Cleanup after each test
});
EOF
    print_success "Created test/setup.ts"
fi

# Create README if it doesn't exist
if [[ ! -f "README.md" ]]; then
    cat > README.md << 'EOF'
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
EOF
    print_success "Created README.md"
fi

print_header "Setup Summary"

print_success "Backend setup completed successfully!"
print_info "Directory structure created"
print_info "Configuration files generated"
print_info "Dependencies installed"

print_header "Next Steps"

echo -e "${BLUE}1.${NC} Update your .env file with actual configuration values"
echo -e "${BLUE}2.${NC} Start the development server: ${GREEN}npm run dev${NC}"
echo -e "${BLUE}3.${NC} Visit http://localhost:3333 to test the API"
echo -e "${BLUE}4.${NC} Check the docs at http://localhost:3333/docs"

print_header "Test Credentials"

echo -e "${BLUE}Email:${NC} admin@pfh.com"
echo -e "${BLUE}Password:${NC} Admin@123"

print_success "Happy coding! 🚀"