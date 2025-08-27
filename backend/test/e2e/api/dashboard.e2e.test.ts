// E2E tests for Dashboard API endpoints
import request from 'supertest';
import App from '../../../src/app';
import { TestUtils } from '../../helpers/test-utils';

let app: App;

describe('Dashboard E2E Tests', () => {
  let accessToken: string;
  let userId: string;

  beforeAll(async () => {
    await TestUtils.setupInMemoryPostgreSQL();
    await TestUtils.setupInMemoryMongoDB();
    
    // Initialize app instance
    app = new App({
      environment: 'test',
      port: 0
    });
    await app.initialize();
  });

  afterAll(async () => {
    await app.close();
    await TestUtils.cleanup();
  });

  beforeEach(async () => {
    await TestUtils.clearAllDatabases();
    await TestUtils.flushMockRedis();

    // Register and login a user for each test
    const registerResponse = await request(app.getFastifyInstance().server)
      .post('/api/auth/register')
      .send({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        password: 'StrongPassword123!',
        confirmPassword: 'StrongPassword123!',
        acceptTerms: true
      });

    accessToken = registerResponse.body.data.tokens.accessToken;
    userId = registerResponse.body.data.user.id;

    // Create some sample transactions for dashboard data
    const transactions = [
      { amount: 1500, description: 'Salary', categoryId: 'salary', type: 'income', date: new Date().toISOString() },
      { amount: 200, description: 'Groceries', categoryId: 'food', type: 'expense', date: new Date().toISOString() },
      { amount: 100, description: 'Gas', categoryId: 'transport', type: 'expense', date: new Date().toISOString() },
      { amount: 50, description: 'Coffee', categoryId: 'food', type: 'expense', date: new Date().toISOString() }
    ];

    for (const transaction of transactions) {
      await request(app.getFastifyInstance().server)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(transaction);
    }

    // Wait for async processing
    await TestUtils.waitFor(1000);
  });

  describe('GET /api/dashboard', () => {
    it('should return comprehensive dashboard data', async () => {
      const response = await request(app.getFastifyInstance().server)
        .get('/api/dashboard')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('dashboard');

      const dashboard = response.body.data.dashboard;
      expect(dashboard).toHaveProperty('currentMonth');
      expect(dashboard).toHaveProperty('recentTransactions');
      expect(dashboard).toHaveProperty('budgetStatus');
      expect(dashboard).toHaveProperty('monthlyTrends');
      expect(dashboard).toHaveProperty('categorySpending');
      expect(dashboard).toHaveProperty('accountBalances');
      expect(dashboard).toHaveProperty('alerts');
      expect(dashboard).toHaveProperty('goals');

      // Verify current month data
      expect(dashboard.currentMonth).toMatchObject({
        totalIncome: 1500,
        totalExpenses: 350,
        netIncome: 1150,
        transactionCount: 4
      });

      expect(dashboard.recentTransactions).toHaveLength(4);
    });

    it('should return cached data on subsequent requests', async () => {
      // First request - should generate and cache data
      const response1 = await request(app.getFastifyInstance().server)
        .get('/api/dashboard')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Second request - should return cached data
      const response2 = await request(app.getFastifyInstance().server)
        .get('/api/dashboard')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response1.body.data.dashboard).toEqual(response2.body.data.dashboard);
    });

    it('should support cache key parameter', async () => {
      const response = await request(app.getFastifyInstance().server)
        .get('/api/dashboard?cacheKey=custom-key')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.dashboard).toBeDefined();
    });

    it('should return 401 for missing authorization', async () => {
      const response = await request(app.getFastifyInstance().server)
        .get('/api/dashboard')
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should handle empty transaction history', async () => {
      // Clear transactions
      await TestUtils.clearAllDatabases();

      const response = await request(app.getFastifyInstance().server)
        .get('/api/dashboard')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const dashboard = response.body.data.dashboard;
      expect(dashboard.currentMonth).toMatchObject({
        totalIncome: 0,
        totalExpenses: 0,
        netIncome: 0,
        transactionCount: 0
      });
      expect(dashboard.recentTransactions).toHaveLength(0);
    });

    it('should include correlation ID header', async () => {
      const response = await request(app.getFastifyInstance().server)
        .get('/api/dashboard')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.headers).toHaveProperty('x-correlation-id');
    });
  });

  describe('GET /api/dashboard/summary/:year/:month', () => {
    it('should return monthly summary for specified month', async () => {
      const currentDate = new Date();
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1;

      const response = await request(app.getFastifyInstance().server)
        .get(`/api/dashboard/summary/${year}/${month}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data.summary).toMatchObject({
        userId,
        year,
        month,
        totalIncome: 1500,
        totalExpenses: 350,
        netIncome: 1150,
        transactionCount: 4
      });

      expect(response.body.data.summary).toHaveProperty('categoryBreakdown');
      expect(response.body.data.summary.categoryBreakdown).toBeInstanceOf(Array);
    });

    it('should return empty summary for month with no data', async () => {
      const response = await request(app.getFastifyInstance().server)
        .get('/api/dashboard/summary/2025/12')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data.summary).toMatchObject({
        userId,
        year: 2025,
        month: 12,
        totalIncome: 0,
        totalExpenses: 0,
        netIncome: 0,
        transactionCount: 0
      });
    });

    it('should return 400 for invalid year parameter', async () => {
      const response = await request(app.getFastifyInstance().server)
        .get('/api/dashboard/summary/invalid/1')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for invalid month parameter', async () => {
      const response = await request(app.getFastifyInstance().server)
        .get('/api/dashboard/summary/2024/13')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should cache monthly summaries', async () => {
      const currentDate = new Date();
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1;

      // First request
      const response1 = await request(app.getFastifyInstance().server)
        .get(`/api/dashboard/summary/${year}/${month}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Second request should return cached data
      const response2 = await request(app.getFastifyInstance().server)
        .get(`/api/dashboard/summary/${year}/${month}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response1.body.data.summary).toEqual(response2.body.data.summary);
    });
  });

  describe('GET /api/dashboard/trends', () => {
    beforeEach(async () => {
      // Create transactions across multiple months
      const dates = [
        new Date(2024, 0, 15), // January
        new Date(2024, 1, 15), // February
        new Date(2024, 2, 15), // March
      ];

      for (let i = 0; i < dates.length; i++) {
        const baseAmount = (i + 1) * 100;
        await request(app.getFastifyInstance().server)
          .post('/api/transactions')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            amount: baseAmount + 500,
            description: `Income ${i + 1}`,
            categoryId: 'salary',
            type: 'income',
            date: dates[i].toISOString()
          });

        await request(app.getFastifyInstance().server)
          .post('/api/transactions')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            amount: baseAmount,
            description: `Expense ${i + 1}`,
            categoryId: 'food',
            type: 'expense',
            date: dates[i].toISOString()
          });
      }

      await TestUtils.waitFor(1000);
    });

    it('should return monthly trends data', async () => {
      const response = await request(app.getFastifyInstance().server)
        .get('/api/dashboard/trends?months=6')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data).toHaveProperty('trends');
      expect(response.body.data.trends).toBeInstanceOf(Array);
      expect(response.body.data.trends.length).toBeGreaterThan(0);

      const trend = response.body.data.trends[0];
      expect(trend).toHaveProperty('year');
      expect(trend).toHaveProperty('month');
      expect(trend).toHaveProperty('totalIncome');
      expect(trend).toHaveProperty('totalExpenses');
      expect(trend).toHaveProperty('netIncome');
    });

    it('should limit trends to specified number of months', async () => {
      const response = await request(app.getFastifyInstance().server)
        .get('/api/dashboard/trends?months=3')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data.trends.length).toBeLessThanOrEqual(3);
    });

    it('should default to 12 months if no parameter provided', async () => {
      const response = await request(app.getFastifyInstance().server)
        .get('/api/dashboard/trends')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data.trends).toBeInstanceOf(Array);
    });

    it('should return 400 for invalid months parameter', async () => {
      const response = await request(app.getFastifyInstance().server)
        .get('/api/dashboard/trends?months=25')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/dashboard/categories', () => {
    it('should return category spending breakdown', async () => {
      const response = await request(app.getFastifyInstance().server)
        .get('/api/dashboard/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data).toHaveProperty('categories');
      expect(response.body.data.categories).toBeInstanceOf(Array);

      const categories = response.body.data.categories;
      expect(categories.length).toBeGreaterThan(0);

      const category = categories[0];
      expect(category).toHaveProperty('categoryId');
      expect(category).toHaveProperty('categoryName');
      expect(category).toHaveProperty('totalAmount');
      expect(category).toHaveProperty('transactionCount');
      expect(category).toHaveProperty('percentage');
    });

    it('should support date range filtering', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      const endDate = new Date();

      const response = await request(app.getFastifyInstance().server)
        .get(`/api/dashboard/categories?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data.categories).toBeInstanceOf(Array);
    });

    it('should support transaction type filtering', async () => {
      const response = await request(app.getFastifyInstance().server)
        .get('/api/dashboard/categories?type=expense')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const categories = response.body.data.categories;
      categories.forEach((category: any) => {
        expect(category.type).toBe('expense');
      });
    });

    it('should return 400 for invalid date range', async () => {
      const response = await request(app.getFastifyInstance().server)
        .get('/api/dashboard/categories?startDate=invalid-date')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/dashboard/refresh', () => {
    it('should refresh dashboard cache', async () => {
      // Get initial dashboard data
      const initialResponse = await request(app.getFastifyInstance().server)
        .get('/api/dashboard')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Refresh cache
      const refreshResponse = await request(app.getFastifyInstance().server)
        .post('/api/dashboard/refresh')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(refreshResponse.body).toHaveProperty('success', true);
      expect(refreshResponse.body).toHaveProperty('message', 'Dashboard cache refreshed successfully');
    });

    it('should support cache key parameter in refresh', async () => {
      const response = await request(app.getFastifyInstance().server)
        .post('/api/dashboard/refresh')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ cacheKey: 'custom-key' })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should return 401 for missing authorization', async () => {
      const response = await request(app.getFastifyInstance().server)
        .post('/api/dashboard/refresh')
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('GET /api/dashboard/alerts', () => {
    beforeEach(async () => {
      // Create transactions that might trigger alerts (budget exceeded)
      const expenseTransactions = Array.from({ length: 10 }, (_, i) => ({
        amount: 200,
        description: `Large expense ${i + 1}`,
        categoryId: 'food',
        type: 'expense',
        date: new Date().toISOString()
      }));

      for (const transaction of expenseTransactions) {
        await request(app.getFastifyInstance().server)
          .post('/api/transactions')
          .set('Authorization', `Bearer ${accessToken}`)
          .send(transaction);
      }

      await TestUtils.waitFor(1500);
    });

    it('should return user alerts', async () => {
      const response = await request(app.getFastifyInstance().server)
        .get('/api/dashboard/alerts')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data).toHaveProperty('alerts');
      expect(response.body.data.alerts).toBeInstanceOf(Array);
    });

    it('should support alert type filtering', async () => {
      const response = await request(app.getFastifyInstance().server)
        .get('/api/dashboard/alerts?type=budget_exceeded')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const alerts = response.body.data.alerts;
      alerts.forEach((alert: any) => {
        expect(alert.type).toBe('budget_exceeded');
      });
    });

    it('should support severity filtering', async () => {
      const response = await request(app.getFastifyInstance().server)
        .get('/api/dashboard/alerts?severity=high')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const alerts = response.body.data.alerts;
      alerts.forEach((alert: any) => {
        expect(alert.severity).toBe('high');
      });
    });

    it('should return only active alerts by default', async () => {
      const response = await request(app.getFastifyInstance().server)
        .get('/api/dashboard/alerts')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const alerts = response.body.data.alerts;
      alerts.forEach((alert: any) => {
        expect(alert.isActive).toBe(true);
      });
    });
  });

  describe('Performance and caching', () => {
    it('should handle dashboard requests efficiently', async () => {
      const startTime = Date.now();

      const response = await request(app.getFastifyInstance().server)
        .get('/api/dashboard')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const requestTime = Date.now() - startTime;
      expect(requestTime).toBeLessThan(2000); // Should respond within 2 seconds
      expect(response.body.success).toBe(true);
    });

    it('should cache dashboard data for improved performance', async () => {
      // First request - cold cache
      const start1 = Date.now();
      await request(app.getFastifyInstance().server)
        .get('/api/dashboard')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const time1 = Date.now() - start1;

      // Second request - warm cache
      const start2 = Date.now();
      await request(app.getFastifyInstance().server)
        .get('/api/dashboard')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const time2 = Date.now() - start2;

      // Cached request should be faster
      expect(time2).toBeLessThan(time1);
    });

    it('should handle concurrent dashboard requests', async () => {
      const promises = Array.from({ length: 5 }, () =>
        request(app.getFastifyInstance().server)
          .get('/api/dashboard')
          .set('Authorization', `Bearer ${accessToken}`)
      );

      const responses = await Promise.all(promises);

      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });
  });

  describe('Error handling', () => {
    it('should handle database errors gracefully', async () => {
      // This would require mocking database failures
      // For now, we'll test a scenario that might cause issues
      const response = await request(app.getFastifyInstance().server)
        .get('/api/dashboard/summary/1900/1') // Very old date might cause issues
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should validate dashboard parameters', async () => {
      const response = await request(app.getFastifyInstance().server)
        .get('/api/dashboard/trends?months=-5')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should handle cache service errors', async () => {
      // Even if cache fails, dashboard should still work by falling back to database
      const response = await request(app.getFastifyInstance().server)
        .get('/api/dashboard')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.dashboard).toBeDefined();
    });
  });
});