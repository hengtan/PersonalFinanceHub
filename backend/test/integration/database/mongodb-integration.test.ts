// Integration tests for MongoDB repositories and cache patterns
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, Db } from 'mongodb';
import { DashboardMongoRepository } from '../../../src/infrastructure/database/mongodb/repositories/dashboard.repository';
import { CacheService } from '../../../src/infrastructure/cache/cache.service';
import { TestUtils } from '../../helpers/test-utils';

// Mock Redis for cache service
jest.mock('../../../src/infrastructure/database/redis/connection', () => ({
  getRedisClient: () => TestUtils.getMockRedisClient()
}));

describe('MongoDB Integration Tests', () => {
  let mongoServer: MongoMemoryServer;
  let mongoClient: MongoClient;
  let db: Db;
  let dashboardRepo: DashboardMongoRepository;
  let cacheService: CacheService;

  beforeAll(async () => {
    // Start in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();

    // Connect to MongoDB
    mongoClient = new MongoClient(uri);
    await mongoClient.connect();
    db = mongoClient.db('test_db');

    // Mock getMongoDb to return our test database
    jest.doMock('../../../src/infrastructure/database/mongodb/connection', () => ({
      getMongoDb: async () => db
    }));

    // Initialize services
    dashboardRepo = new DashboardMongoRepository();
    cacheService = CacheService.getInstance();

    // Initialize cache service with mock Redis
    await cacheService.initialize();
  }, 30000);

  afterAll(async () => {
    await mongoClient.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear collections before each test
    const collections = await db.listCollections().toArray();
    for (const collection of collections) {
      await db.collection(collection.name).deleteMany({});
    }

    // Clear Redis mock
    await TestUtils.flushMockRedis();
  });

  describe('DashboardMongoRepository', () => {
    describe('Cache-aside pattern', () => {
      const userId = 'test-user-123';
      const cacheKey = 'main';
      const testDashboardData = {
        currentMonth: {
          totalIncome: 3000,
          totalExpenses: 2200,
          netIncome: 800,
          budgetUtilization: 73.3,
          transactionCount: 45
        },
        recentTransactions: [
          TestUtils.generateTransaction({ id: 'tx1' }),
          TestUtils.generateTransaction({ id: 'tx2' })
        ],
        budgetStatus: [],
        monthlyTrends: [],
        categorySpending: [],
        accountBalances: [],
        alerts: [],
        goals: []
      };

      it('should return null on cache miss', async () => {
        const result = await dashboardRepo.getDashboardData(userId, cacheKey);
        expect(result).toBeNull();
      });

      it('should store and retrieve dashboard data via MongoDB', async () => {
        // Set dashboard cache
        await dashboardRepo.setDashboardCache(userId, testDashboardData, cacheKey, 15);

        // Retrieve from MongoDB (should hit MongoDB, not Redis due to timing)
        const result = await dashboardRepo.getDashboardData(userId, cacheKey);

        expect(result).toEqual(testDashboardData);
      });

      it('should implement cache-aside pattern: Redis -> MongoDB -> Compute', async () => {
        // 1. Cache miss - should return null
        let result = await dashboardRepo.getDashboardData(userId, cacheKey);
        expect(result).toBeNull();

        // 2. Set data in MongoDB and Redis
        await dashboardRepo.setDashboardCache(userId, testDashboardData, cacheKey, 15);

        // 3. Should retrieve from Redis cache
        result = await dashboardRepo.getDashboardData(userId, cacheKey);
        expect(result).toEqual(testDashboardData);

        // 4. Clear Redis, should retrieve from MongoDB
        await TestUtils.flushMockRedis();
        result = await dashboardRepo.getDashboardData(userId, cacheKey);
        expect(result).toEqual(testDashboardData);
      });

      it('should handle cache expiration', async () => {
        // Set cache with very short TTL
        await dashboardRepo.setDashboardCache(userId, testDashboardData, cacheKey, 0.01); // 0.6 seconds

        // Wait for expiration
        await TestUtils.waitFor(1000);

        // Should not return expired data
        const result = await dashboardRepo.getDashboardData(userId, cacheKey);
        expect(result).toBeNull();
      });

      it('should invalidate cache correctly', async () => {
        // Set dashboard cache
        await dashboardRepo.setDashboardCache(userId, testDashboardData, cacheKey, 15);

        // Verify data exists
        let result = await dashboardRepo.getDashboardData(userId, cacheKey);
        expect(result).not.toBeNull();

        // Invalidate specific cache
        await dashboardRepo.invalidateDashboardCache(userId, cacheKey);

        // Should return null after invalidation
        result = await dashboardRepo.getDashboardData(userId, cacheKey);
        expect(result).toBeNull();
      });

      it('should invalidate all user caches', async () => {
        const cacheKey1 = 'main';
        const cacheKey2 = 'secondary';

        // Set multiple caches for same user
        await dashboardRepo.setDashboardCache(userId, testDashboardData, cacheKey1, 15);
        await dashboardRepo.setDashboardCache(userId, testDashboardData, cacheKey2, 15);

        // Invalidate all user caches
        await dashboardRepo.invalidateDashboardCache(userId);

        // Both should be null
        const result1 = await dashboardRepo.getDashboardData(userId, cacheKey1);
        const result2 = await dashboardRepo.getDashboardData(userId, cacheKey2);

        expect(result1).toBeNull();
        expect(result2).toBeNull();
      });

      it('should handle concurrent access correctly', async () => {
        const concurrentUsers = ['user1', 'user2', 'user3', 'user4', 'user5'];
        
        // Set data for multiple users concurrently
        const setPromises = concurrentUsers.map(uid =>
          dashboardRepo.setDashboardCache(
            uid,
            { ...testDashboardData, userId: uid },
            cacheKey,
            15
          )
        );

        await Promise.all(setPromises);

        // Retrieve data for all users concurrently
        const getPromises = concurrentUsers.map(uid =>
          dashboardRepo.getDashboardData(uid, cacheKey)
        );

        const results = await Promise.all(getPromises);

        // Each user should get their own data
        results.forEach((result, index) => {
          expect(result).not.toBeNull();
          expect((result as any).userId).toBe(concurrentUsers[index]);
        });
      });

      it('should generate consistent cache hash', async () => {
        const data1 = { ...testDashboardData };
        const data2 = { ...testDashboardData };

        await dashboardRepo.setDashboardCache(userId, data1, 'hash-test-1', 15);
        await dashboardRepo.setDashboardCache(userId, data2, 'hash-test-2', 15);

        // Retrieve documents from MongoDB directly to check hash
        const doc1 = await db.collection('dashboard_cache').findOne({ 
          userId, 
          cacheKey: 'hash-test-1' 
        });
        const doc2 = await db.collection('dashboard_cache').findOne({ 
          userId, 
          cacheKey: 'hash-test-2' 
        });

        expect(doc1?.hash).toBe(doc2?.hash);
        expect(doc1?.hash).toBeDefined();
      });
    });

    describe('Monthly summaries', () => {
      const userId = 'test-user-456';
      const year = 2024;
      const month = 3;
      const testSummary = TestUtils.generateMonthlySummary({ userId, year, month });

      it('should store and retrieve monthly summary', async () => {
        await dashboardRepo.setMonthlySummary(testSummary);

        const result = await dashboardRepo.getMonthlySummary(userId, year, month);

        expect(result).toEqual(expect.objectContaining({
          userId,
          year,
          month,
          totalIncome: testSummary.totalIncome,
          totalExpenses: testSummary.totalExpenses
        }));
      });

      it('should cache monthly summary in Redis', async () => {
        await dashboardRepo.setMonthlySummary(testSummary);

        // First call - should hit MongoDB and cache in Redis
        let result = await dashboardRepo.getMonthlySummary(userId, year, month);
        expect(result).not.toBeNull();

        // Clear MongoDB but keep Redis
        await db.collection('monthly_summaries').deleteMany({});

        // Second call - should hit Redis cache
        result = await dashboardRepo.getMonthlySummary(userId, year, month);
        expect(result).toEqual(expect.objectContaining({
          userId,
          year,
          month
        }));
      });

      it('should update version on summary updates', async () => {
        const initialSummary = { ...testSummary, version: 1 };
        await dashboardRepo.setMonthlySummary(initialSummary);

        const updatedSummary = { ...testSummary, totalIncome: 4000 };
        await dashboardRepo.setMonthlySummary(updatedSummary);

        const result = await dashboardRepo.getMonthlySummary(userId, year, month);
        expect(result?.version).toBe(2);
        expect(result?.totalIncome).toBe(4000);
      });

      it('should retrieve multiple monthly summaries for date range', async () => {
        const summaries = [
          TestUtils.generateMonthlySummary({ userId, year: 2024, month: 1 }),
          TestUtils.generateMonthlySummary({ userId, year: 2024, month: 2 }),
          TestUtils.generateMonthlySummary({ userId, year: 2024, month: 3 }),
          TestUtils.generateMonthlySummary({ userId, year: 2024, month: 4 })
        ];

        // Store all summaries
        for (const summary of summaries) {
          await dashboardRepo.setMonthlySummary(summary);
        }

        // Retrieve range
        const results = await dashboardRepo.getUserMonthlySummaries(
          userId, 
          2024, 2, // Start: Feb 2024
          2024, 4  // End: Apr 2024
        );

        expect(results).toHaveLength(3); // Feb, Mar, Apr
        expect(results[0].month).toBe(4); // Should be sorted desc
        expect(results[1].month).toBe(3);
        expect(results[2].month).toBe(2);
      });

      it('should handle invalid date ranges gracefully', async () => {
        const results = await dashboardRepo.getUserMonthlySummaries(
          'non-existent-user',
          2024, 1,
          2024, 12
        );

        expect(results).toHaveLength(0);
      });
    });

    describe('Cache cleanup', () => {
      it('should clean up expired dashboard caches', async () => {
        const userId1 = 'user-1';
        const userId2 = 'user-2';

        // Set cache that expires immediately
        await dashboardRepo.setDashboardCache(
          userId1, 
          TestUtils.generateMonthlySummary(), 
          'expired', 
          0.01
        );

        // Set cache that doesn't expire
        await dashboardRepo.setDashboardCache(
          userId2, 
          TestUtils.generateMonthlySummary(), 
          'valid', 
          60
        );

        // Wait for expiration
        await TestUtils.waitFor(1000);

        // Run cleanup
        const result = await dashboardRepo.cleanupExpiredCaches();

        expect(result.deletedCount).toBe(1);

        // Verify only expired cache was deleted
        const validCache = await dashboardRepo.getDashboardData(userId2, 'valid');
        expect(validCache).not.toBeNull();

        const expiredCache = await dashboardRepo.getDashboardData(userId1, 'expired');
        expect(expiredCache).toBeNull();
      });

      it('should handle cleanup with no expired caches', async () => {
        // Set cache that doesn't expire
        await dashboardRepo.setDashboardCache(
          'user-test', 
          TestUtils.generateMonthlySummary(), 
          'valid', 
          60
        );

        const result = await dashboardRepo.cleanupExpiredCaches();
        expect(result.deletedCount).toBe(0);
      });
    });

    describe('Error handling', () => {
      it('should handle MongoDB connection errors gracefully', async () => {
        // Close MongoDB connection to simulate error
        await mongoClient.close();

        await expect(dashboardRepo.getDashboardData('user', 'key'))
          .rejects
          .toThrow('Failed to retrieve dashboard data');

        // Reconnect for cleanup
        await mongoClient.connect();
      });

      it('should handle cache service errors gracefully', async () => {
        // Mock cache service to throw error
        const originalGet = cacheService.get;
        cacheService.get = jest.fn().mockRejectedValue(new Error('Redis error'));

        // Should still work by falling back to MongoDB
        await dashboardRepo.setDashboardCache(
          'test-user',
          TestUtils.generateMonthlySummary(),
          'error-test',
          15
        );

        const result = await dashboardRepo.getDashboardData('test-user', 'error-test');
        expect(result).not.toBeNull();

        // Restore cache service
        cacheService.get = originalGet;
      });
    });
  });

  describe('Performance tests', () => {
    it('should handle high-volume cache operations', async () => {
      const operationCount = 100;
      const promises: Promise<any>[] = [];

      const startTime = Date.now();

      // Perform concurrent cache operations
      for (let i = 0; i < operationCount; i++) {
        const userId = `user-${i}`;
        const data = TestUtils.generateMonthlySummary({ userId });
        
        promises.push(dashboardRepo.setDashboardCache(userId, data, 'perf-test', 15));
      }

      await Promise.all(promises);

      const setTime = Date.now() - startTime;
      expect(setTime).toBeLessThan(10000); // Should complete within 10 seconds

      // Retrieve all data
      const retrieveStartTime = Date.now();
      const retrievePromises: Promise<any>[] = [];

      for (let i = 0; i < operationCount; i++) {
        const userId = `user-${i}`;
        retrievePromises.push(dashboardRepo.getDashboardData(userId, 'perf-test'));
      }

      const results = await Promise.all(retrievePromises);
      const retrieveTime = Date.now() - retrieveStartTime;

      expect(retrieveTime).toBeLessThan(5000); // Should retrieve within 5 seconds
      expect(results.filter(r => r !== null)).toHaveLength(operationCount);

      console.log(`Set ${operationCount} cache entries in ${setTime}ms`);
      console.log(`Retrieved ${operationCount} cache entries in ${retrieveTime}ms`);
    });

    it('should maintain reasonable memory usage', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Create large amount of data
      for (let i = 0; i < 50; i++) {
        const largeData = {
          ...TestUtils.generateMonthlySummary(),
          largeArray: new Array(1000).fill(0).map((_, idx) => ({
            id: idx,
            data: `item-${idx}`,
            metadata: { processed: true, timestamp: new Date() }
          }))
        };

        await dashboardRepo.setDashboardCache(`bulk-user-${i}`, largeData, 'memory-test', 15);
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 100MB)
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);

      console.log(`Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
    });
  });
});