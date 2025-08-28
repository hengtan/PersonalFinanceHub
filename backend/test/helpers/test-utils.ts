// Test utilities and helpers
import { MongoMemoryServer } from 'mongodb-memory-server';
import * as redisMock from 'redis-mock';
import { Kafka } from 'kafkajs';

export class TestUtils {
  private static mongoServer: MongoMemoryServer | null = null;
  private static redisClient: any = null;

  // MongoDB test helpers
  static async setupInMemoryMongoDB(): Promise<string> {
    if (!this.mongoServer) {
      this.mongoServer = await MongoMemoryServer.create();
    }
    return this.mongoServer.getUri();
  }

  static async teardownInMemoryMongoDB(): Promise<void> {
    if (this.mongoServer) {
      await this.mongoServer.stop();
      this.mongoServer = null;
    }
  }

  // Redis mock helpers
  static getMockRedisClient() {
    if (!this.redisClient) {
      // Create in-memory store to simulate Redis behavior
      const store = new Map<string, { value: any; expiry?: number }>();
      
      // Create a more complete Redis mock
      this.redisClient = {
        get: jest.fn().mockImplementation((key: string) => {
          const item = store.get(key);
          if (!item) return Promise.resolve(null);
          if (item.expiry && Date.now() > item.expiry) {
            store.delete(key);
            return Promise.resolve(null);
          }
          return Promise.resolve(item.value);
        }),
        set: jest.fn().mockImplementation((key: string, value: any) => {
          store.set(key, { value });
          return Promise.resolve('OK');
        }),
        setEx: jest.fn().mockImplementation((key: string, ttl: number, value: any) => {
          const expiry = Date.now() + (ttl * 1000);
          store.set(key, { value, expiry });
          return Promise.resolve('OK');
        }),
        del: jest.fn().mockImplementation((key: string | string[]) => {
          if (Array.isArray(key)) {
            let count = 0;
            for (const k of key) {
              if (store.has(k)) {
                store.delete(k);
                count++;
              }
            }
            return Promise.resolve(count);
          } else {
            const existed = store.has(key);
            store.delete(key);
            return Promise.resolve(existed ? 1 : 0);
          }
        }),
        exists: jest.fn().mockImplementation((key: string) => {
          const item = store.get(key);
          if (!item) return Promise.resolve(0);
          if (item.expiry && Date.now() > item.expiry) {
            store.delete(key);
            return Promise.resolve(0);
          }
          return Promise.resolve(1);
        }),
        ttl: jest.fn().mockImplementation((key: string) => {
          const item = store.get(key);
          if (!item) return Promise.resolve(-2);
          if (!item.expiry) return Promise.resolve(-1);
          const remaining = Math.max(0, Math.floor((item.expiry - Date.now()) / 1000));
          return Promise.resolve(remaining);
        }),
        expire: jest.fn().mockResolvedValue(1),
        flushdb: jest.fn().mockImplementation(() => {
          store.clear();
          return Promise.resolve('OK');
        }),
        flushall: jest.fn().mockImplementation(() => {
          store.clear();
          return Promise.resolve('OK');
        }),
        keys: jest.fn().mockImplementation((pattern: string) => {
          const allKeys = Array.from(store.keys());
          if (pattern === '*') {
            return Promise.resolve(allKeys);
          }
          // Convert Redis pattern to regex
          const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
          const matchedKeys = allKeys.filter(key => regex.test(key));
          return Promise.resolve(matchedKeys);
        }),
        scan: jest.fn().mockResolvedValue({ cursor: 0, keys: [] }),
        mget: jest.fn().mockResolvedValue([]),
        mset: jest.fn().mockResolvedValue('OK'),
        incr: jest.fn().mockResolvedValue(1),
        decr: jest.fn().mockResolvedValue(-1),
        connect: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn().mockResolvedValue(undefined),
        quit: jest.fn().mockResolvedValue('OK'),
        ping: jest.fn().mockResolvedValue('PONG'),
        isOpen: true,
        isReady: true,
        on: jest.fn(),
        off: jest.fn(),
        emit: jest.fn(),
        _store: store // Internal reference for testing
      };
    }
    return this.redisClient;
  }

  static async flushMockRedis(): Promise<void> {
    if (this.redisClient && this.redisClient._store) {
      this.redisClient._store.clear();
      await this.redisClient.flushall();
    }
  }

  // Kafka mock helpers
  static createMockKafkaProducer() {
    return {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      send: jest.fn().mockResolvedValue(undefined),
      sendBatch: jest.fn().mockResolvedValue(undefined),
    };
  }

  static createMockKafkaConsumer() {
    return {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockResolvedValue(undefined),
      run: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
    };
  }

  // Data generators
  static generateUser(overrides: Partial<any> = {}): any {
    return {
      id: 'test-user-id',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      isActive: true,
      isEmailVerified: false,
      role: 'user',
      preferences: {
        language: 'pt-BR',
        currency: 'BRL',
        timezone: 'America/Sao_Paulo',
        dateFormat: 'DD/MM/YYYY',
        theme: 'light',
        notifications: {
          email: true,
          push: true,
          sms: false,
          budgetAlerts: true,
          transactionAlerts: true
        }
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides
    };
  }

  static generateTransaction(overrides: Partial<any> = {}): any {
    const baseDate = new Date('2025-08-28T16:27:18.634Z');
    return {
      id: 'test-transaction-id',
      userId: 'test-user-id',
      amount: 100.00,
      description: 'Test transaction',
      categoryId: 'test-category-id',
      categoryName: 'Test Category',
      type: 'expense',
      accountId: 'test-account-id',
      paymentMethod: 'DEBIT_CARD',
      date: baseDate.toISOString(),
      tags: ['test'],
      metadata: {},
      createdAt: baseDate.toISOString(),
      updatedAt: baseDate.toISOString(),
      ...overrides
    };
  }

  static generateBudget(overrides: Partial<any> = {}): any {
    return {
      id: 'test-budget-id',
      userId: 'test-user-id',
      categoryId: 'test-category-id',
      categoryName: 'Test Category',
      amount: 1000.00,
      period: 'monthly',
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear(),
      spentAmount: 500.00,
      remainingAmount: 500.00,
      alerts: {
        enabled: true,
        threshold: 80
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides
    };
  }

  static generateMonthlySummary(overrides: Partial<any> = {}): any {
    return {
      userId: 'test-user-id',
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear(),
      totalIncome: 3000.00,
      totalExpenses: 2200.00,
      netIncome: 800.00,
      transactionCount: 45,
      categoryBreakdown: [
        {
          categoryId: 'food',
          categoryName: 'Food',
          amount: 800,
          percentage: 36.4,
          transactionCount: 12
        }
      ],
      budgetComparison: [],
      averageTransactionValue: 48.89,
      highestExpense: {
        amount: 200,
        description: 'Weekly groceries',
        date: new Date()
      },
      topCategories: [],
      comparedToPreviousMonth: {
        incomeChange: 5.5,
        expenseChange: -2.3,
        netIncomeChange: 15.2,
        changePercentage: 15.2
      },
      trends: {
        dailyAverages: [100, 120, 90],
        weeklyTotals: [800, 750, 900, 680],
        peakSpendingDay: 'Saturday'
      },
      lastUpdated: new Date(),
      version: 1,
      ...overrides
    };
  }

  // Mock factories
  static createMockLogger() {
    return {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
      createChildLogger: jest.fn(() => ({
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        verbose: jest.fn()
      }))
    };
  }

  static createMockRepository<T = any>() {
    return {
      findById: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      save: jest.fn(),
      findByEmail: jest.fn(),
      findByCpf: jest.fn(),
      findMany: jest.fn()
    } as jest.Mocked<T>;
  }

  static createMockCacheService() {
    return {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      exists: jest.fn(),
      keys: jest.fn(),
      clearNamespace: jest.fn(),
      flushAll: jest.fn(),
      getTtl: jest.fn(),
      expire: jest.fn(),
      getInstance: jest.fn()
    };
  }

  static createMockSyncService() {
    return {
      getInstance: jest.fn(),
      initialize: jest.fn(),
      syncTransactionToMongo: jest.fn(),
      syncBudgetToMongo: jest.fn(),
      syncUserToMongo: jest.fn(),
      invalidateCache: jest.fn(),
      onTransactionCreated: jest.fn(),
      onTransactionUpdated: jest.fn(),
      onTransactionDeleted: jest.fn(),
      onBudgetExceeded: jest.fn(),
      isHealthy: jest.fn().mockReturnValue(true),
      shutdown: jest.fn()
    };
  }

  static createMockSagaService() {
    return {
      startTransactionSaga: jest.fn().mockResolvedValue('test-saga-id'),
      getSagaStatus: jest.fn(),
      getActiveSagas: jest.fn().mockReturnValue([]),
      cancelSaga: jest.fn()
    };
  }

  // Async test helpers
  static async waitFor(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static async waitForCondition(
    condition: () => boolean | Promise<boolean>,
    timeout = 5000,
    interval = 100
  ): Promise<void> {
    const start = Date.now();
    
    while (Date.now() - start < timeout) {
      const result = await condition();
      if (result) {
        return;
      }
      await this.waitFor(interval);
    }
    
    throw new Error(`Condition not met within ${timeout}ms`);
  }

  // HTTP test helpers
  static createMockRequest(overrides: Partial<any> = {}) {
    return {
      body: {},
      params: {},
      query: {},
      headers: {},
      user: null,
      ip: '127.0.0.1',
      ...overrides
    };
  }

  static createMockReply() {
    const reply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      header: jest.fn().mockReturnThis(),
      setCookie: jest.fn().mockReturnThis(),
      status: 200,
      sent: false
    };
    return reply;
  }

  // Error simulation helpers
  static createNetworkError(message = 'Network error') {
    const error = new Error(message);
    (error as any).code = 'ECONNREFUSED';
    return error;
  }

  static createTimeoutError(message = 'Timeout error') {
    const error = new Error(message);
    (error as any).code = 'ETIMEDOUT';
    return error;
  }

  static createDatabaseError(message = 'Database error') {
    const error = new Error(message);
    (error as any).code = '23505'; // Unique constraint violation
    return error;
  }

  // PostgreSQL test helpers (using in-memory or test database)
  static async setupInMemoryPostgreSQL(): Promise<void> {
    // For now, we'll use environment variables for test database
    // In a real implementation, you might use a test database
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  }

  // Database cleanup helpers
  static async clearAllDatabases(): Promise<void> {
    // Clear MongoDB collections (if using memory server)
    // Clear Redis mock data
    await this.flushMockRedis();
    // PostgreSQL cleanup would happen here in real implementation
  }

  // Cleanup helper
  static async cleanup(): Promise<void> {
    await this.flushMockRedis();
    await this.teardownInMemoryMongoDB();
    jest.clearAllMocks();
    jest.resetModules();
  }
}

// Custom Jest matchers
expect.extend({
  toBeWithinTimeRange(received: Date, start: Date, end: Date) {
    const pass = received >= start && received <= end;
    if (pass) {
      return {
        message: () =>
          `expected ${received} not to be within time range ${start} - ${end}`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected ${received} to be within time range ${start} - ${end}`,
        pass: false,
      };
    }
  },

  toHaveBeenCalledWithObjectContaining(received: jest.Mock, expected: any) {
    const pass = received.mock.calls.some(call =>
      call.some(arg => 
        typeof arg === 'object' && 
        Object.keys(expected).every(key => 
          arg[key] === expected[key]
        )
      )
    );

    if (pass) {
      return {
        message: () =>
          `expected mock not to have been called with object containing ${JSON.stringify(expected)}`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected mock to have been called with object containing ${JSON.stringify(expected)}`,
        pass: false,
      };
    }
  }
});

declare global {
  namespace jest {
    interface Matchers<R> {
      toBeWithinTimeRange(start: Date, end: Date): R;
      toHaveBeenCalledWithObjectContaining(expected: any): R;
    }
  }
}