// Database setup utilities for tests
import { Pool } from 'pg';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, Db } from 'mongodb';
import { createClient, RedisClientType } from 'redis';

export class DatabaseSetup {
  private static postgresPool: Pool | null = null;
  private static mongoServer: MongoMemoryServer | null = null;
  private static mongoClient: MongoClient | null = null;
  private static mongoDb: Db | null = null;
  private static redisClient: RedisClientType | null = null;

  // PostgreSQL setup
  static async setupPostgreSQL(): Promise<Pool> {
    if (this.postgresPool) {
      return this.postgresPool;
    }

    // Use test database configuration
    const config = {
      host: process.env.TEST_POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.TEST_POSTGRES_PORT || '5432'),
      database: process.env.TEST_POSTGRES_DB || 'personal_finance_test',
      user: process.env.TEST_POSTGRES_USER || 'postgres',
      password: process.env.TEST_POSTGRES_PASSWORD || 'postgres123',
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    };

    this.postgresPool = new Pool(config);

    // Test connection
    try {
      const client = await this.postgresPool.connect();
      await client.query('SELECT NOW()');
      client.release();
      console.log('✅ PostgreSQL test database connected');
    } catch (error) {
      console.error('❌ Failed to connect to PostgreSQL test database:', error);
      throw error;
    }

    return this.postgresPool;
  }

  static async setupInMemoryPostgreSQL(): Promise<Pool> {
    // For true isolation, we could use pg-mem here
    // For now, we'll use the regular test database with cleanup
    return this.setupPostgreSQL();
  }

  // MongoDB setup
  static async setupInMemoryMongoDB(): Promise<{ uri: string; db: Db }> {
    if (this.mongoServer && this.mongoDb) {
      return {
        uri: this.mongoServer.getUri(),
        db: this.mongoDb
      };
    }

    // Create in-memory MongoDB instance
    this.mongoServer = await MongoMemoryServer.create({
      instance: {
        dbName: 'personal_finance_test'
      }
    });

    const uri = this.mongoServer.getUri();
    this.mongoClient = new MongoClient(uri);
    await this.mongoClient.connect();
    this.mongoDb = this.mongoClient.db('personal_finance_test');

    console.log('✅ In-memory MongoDB test database connected');

    return {
      uri,
      db: this.mongoDb
    };
  }

  // Redis setup (mock for tests)
  static async setupRedis(): Promise<RedisClientType> {
    if (this.redisClient) {
      return this.redisClient;
    }

    // Use Redis mock for tests to avoid external dependencies
    this.redisClient = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      exists: jest.fn().mockResolvedValue(0),
      ttl: jest.fn().mockResolvedValue(-1),
      expire: jest.fn().mockResolvedValue(1),
      flushdb: jest.fn().mockResolvedValue('OK'),
      keys: jest.fn().mockResolvedValue([]),
      scan: jest.fn().mockResolvedValue({ cursor: 0, keys: [] }),
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      isOpen: true,
      isReady: true
    } as any;

    console.log('✅ Mock Redis client initialized for tests');

    return this.redisClient;
  }

  // Database cleanup
  static async clearPostgreSQL(): Promise<void> {
    if (!this.postgresPool) return;

    const client = await this.postgresPool.connect();
    try {
      // Drop and recreate all test tables
      await client.query('TRUNCATE TABLE transactions CASCADE');
      await client.query('TRUNCATE TABLE users CASCADE'); 
      await client.query('TRUNCATE TABLE budgets CASCADE');
      await client.query('TRUNCATE TABLE categories CASCADE');
      // Add other tables as needed
    } catch (error) {
      console.warn('Warning: Error clearing PostgreSQL test data:', error);
    } finally {
      client.release();
    }
  }

  static async clearMongoDB(): Promise<void> {
    if (!this.mongoDb) return;

    try {
      const collections = await this.mongoDb.listCollections().toArray();
      for (const collection of collections) {
        await this.mongoDb.collection(collection.name).deleteMany({});
      }
    } catch (error) {
      console.warn('Warning: Error clearing MongoDB test data:', error);
    }
  }

  static async clearRedis(): Promise<void> {
    if (!this.redisClient) return;

    try {
      // Reset all mock functions
      if (jest.isMockFunction(this.redisClient.get)) {
        (this.redisClient.get as jest.Mock).mockResolvedValue(null);
      }
      if (jest.isMockFunction(this.redisClient.keys)) {
        (this.redisClient.keys as jest.Mock).mockResolvedValue([]);
      }
      // Reset other mocks as needed
    } catch (error) {
      console.warn('Warning: Error clearing Redis test data:', error);
    }
  }

  static async clearAllDatabases(): Promise<void> {
    await Promise.all([
      this.clearPostgreSQL(),
      this.clearMongoDB(), 
      this.clearRedis()
    ]);
  }

  // Database seeding for tests
  static async seedTestData(): Promise<void> {
    await this.seedCategories();
    await this.seedUsers();
  }

  private static async seedCategories(): Promise<void> {
    if (!this.postgresPool) return;

    const client = await this.postgresPool.connect();
    try {
      const categories = [
        { id: 'food', name: 'Food & Dining', type: 'expense', color: '#FF5722' },
        { id: 'transport', name: 'Transportation', type: 'expense', color: '#2196F3' },
        { id: 'entertainment', name: 'Entertainment', type: 'expense', color: '#9C27B0' },
        { id: 'salary', name: 'Salary', type: 'income', color: '#4CAF50' },
        { id: 'freelance', name: 'Freelance', type: 'income', color: '#8BC34A' },
        { id: 'investment', name: 'Investments', type: 'income', color: '#FF9800' }
      ];

      for (const category of categories) {
        await client.query(`
          INSERT INTO categories (id, name, type, color, created_at, updated_at)
          VALUES ($1, $2, $3, $4, NOW(), NOW())
          ON CONFLICT (id) DO NOTHING
        `, [category.id, category.name, category.type, category.color]);
      }
    } finally {
      client.release();
    }
  }

  private static async seedUsers(): Promise<void> {
    if (!this.postgresPool) return;

    const client = await this.postgresPool.connect();
    try {
      // Create a test user for tests that need it
      await client.query(`
        INSERT INTO users (id, first_name, last_name, email, password_hash, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        ON CONFLICT (email) DO NOTHING
      `, [
        'test-user-id',
        'Test',
        'User', 
        'test@example.com',
        '$2b$12$hash', // Pre-hashed password
        true
      ]);
    } finally {
      client.release();
    }
  }

  // Connection cleanup
  static async closeConnections(): Promise<void> {
    const promises: Promise<void>[] = [];

    if (this.postgresPool) {
      promises.push(
        this.postgresPool.end().then(() => {
          this.postgresPool = null;
          console.log('✅ PostgreSQL test database disconnected');
        })
      );
    }

    if (this.mongoClient) {
      promises.push(
        this.mongoClient.close().then(() => {
          this.mongoClient = null;
          this.mongoDb = null;
          console.log('✅ MongoDB test database disconnected');
        })
      );
    }

    if (this.mongoServer) {
      promises.push(
        this.mongoServer.stop().then(() => {
          this.mongoServer = null;
          console.log('✅ MongoDB memory server stopped');
        })
      );
    }

    // Redis mock doesn't need cleanup
    if (this.redisClient) {
      this.redisClient = null;
      console.log('✅ Redis mock client cleared');
    }

    await Promise.all(promises);
  }

  // Health check
  static async healthCheck(): Promise<{
    postgres: boolean;
    mongodb: boolean;
    redis: boolean;
  }> {
    const health = {
      postgres: false,
      mongodb: false,
      redis: false
    };

    // Check PostgreSQL
    if (this.postgresPool) {
      try {
        const client = await this.postgresPool.connect();
        await client.query('SELECT 1');
        client.release();
        health.postgres = true;
      } catch (error) {
        console.warn('PostgreSQL health check failed:', error);
      }
    }

    // Check MongoDB
    if (this.mongoDb) {
      try {
        await this.mongoDb.admin().ping();
        health.mongodb = true;
      } catch (error) {
        console.warn('MongoDB health check failed:', error);
      }
    }

    // Redis mock is always healthy
    if (this.redisClient) {
      health.redis = true;
    }

    return health;
  }

  // Get database instances
  static getPostgresPool(): Pool | null {
    return this.postgresPool;
  }

  static getMongoDb(): Db | null {
    return this.mongoDb;
  }

  static getRedisClient(): RedisClientType | null {
    return this.redisClient;
  }
}