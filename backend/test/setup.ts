import 'reflect-metadata';
import { config } from 'dotenv';
import { TestUtils } from './helpers/test-utils';

// Load test environment variables
config({ path: '.env.test' });

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.KAFKA_BROKERS = 'localhost:9092';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.MONGODB_URI = 'mongodb://localhost:27017/personal_finance_test';

// Mock Redis connection for all tests
jest.mock('../src/infrastructure/database/redis/connection', () => ({
  getRedisClient: jest.fn(() => Promise.resolve(TestUtils.getMockRedisClient())),
  connectRedis: jest.fn(() => Promise.resolve(TestUtils.getMockRedisClient())),
  disconnectRedis: jest.fn(() => Promise.resolve()),
  isRedisConnected: jest.fn(() => true)
}));

// Global test setup
beforeAll(async () => {
  // Increase timeout for async operations
  jest.setTimeout(30000);
});

afterAll(async () => {
  // Cleanup after all tests
  await new Promise(resolve => setTimeout(resolve, 1000));
});

beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();
});

afterEach(() => {
  // Reset module registry to avoid state leakage between tests
  jest.resetModules();
});
