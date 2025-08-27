// E2E tests for Transaction API endpoints
import request from 'supertest';
import App from '../../../src/app';
import { TestUtils } from '../../helpers/test-utils';

let app: App;

describe('Transactions E2E Tests', () => {
  let accessToken: string;
  let userId: string;

  beforeAll(async () => {
    await TestUtils.setupInMemoryPostgreSQL();
    await TestUtils.setupInMemoryMongoDB();
    
    // Initialize app for testing
    app = new App({
      environment: 'test',
      port: 0 // Use random port for testing
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
  });

  describe('POST /api/transactions', () => {
    const validTransactionData = {
      amount: 150.75,
      description: 'Grocery shopping at Whole Foods',
      categoryId: 'food-groceries',
      type: 'expense',
      date: new Date().toISOString(),
      paymentMethod: 'credit_card',
      currency: 'USD',
      tags: ['groceries', 'food'],
      location: {
        name: 'Whole Foods Market',
        address: '123 Main St, City, State',
        coordinates: { lat: 40.7128, lng: -74.0060 }
      }
    };

    it('should create a transaction with valid data', async () => {
      const response = await request(app.getFastifyInstance().server)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(validTransactionData)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('transactionId');
      expect(response.body.data).toHaveProperty('sagaId');
      expect(response.body.data.transaction).toMatchObject({
        amount: validTransactionData.amount,
        description: validTransactionData.description,
        categoryId: validTransactionData.categoryId,
        type: validTransactionData.type,
        userId
      });
    });

    it('should return 400 for missing required fields', async () => {
      const incompleteData = {
        description: 'Test transaction'
        // Missing amount, categoryId, type
      };

      const response = await request(app.getFastifyInstance().server)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(incompleteData)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.validationErrors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'amount' }),
          expect.objectContaining({ field: 'categoryId' }),
          expect.objectContaining({ field: 'type' })
        ])
      );
    });

    it('should return 400 for invalid amount', async () => {
      const invalidAmountData = {
        ...validTransactionData,
        amount: -50 // Negative amount for expense
      };

      const response = await request(app.getFastifyInstance().server)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(invalidAmountData)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.validationErrors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ 
            field: 'amount',
            message: expect.stringMatching(/positive/i)
          })
        ])
      );
    });

    it('should return 400 for invalid transaction type', async () => {
      const invalidTypeData = {
        ...validTransactionData,
        type: 'invalid-type'
      };

      const response = await request(app.getFastifyInstance().server)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(invalidTypeData)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.validationErrors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ 
            field: 'type',
            message: expect.stringMatching(/income.*expense.*transfer/i)
          })
        ])
      );
    });

    it('should return 400 for invalid date format', async () => {
      const invalidDateData = {
        ...validTransactionData,
        date: 'invalid-date-format'
      };

      const response = await request(app.getFastifyInstance().server)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(invalidDateData)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 401 for missing authorization', async () => {
      const response = await request(app.getFastifyInstance().server)
        .post('/api/transactions')
        .send(validTransactionData)
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should set correlation ID header', async () => {
      const response = await request(app.getFastifyInstance().server)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(validTransactionData);

      expect(response.headers).toHaveProperty('x-correlation-id');
    });

    it('should validate currency codes', async () => {
      const invalidCurrencyData = {
        ...validTransactionData,
        currency: 'INVALID'
      };

      const response = await request(app.getFastifyInstance().server)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(invalidCurrencyData)
        .expect(400);

      expect(response.body.error.validationErrors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ 
            field: 'currency',
            message: expect.stringMatching(/valid.*currency/i)
          })
        ])
      );
    });
  });

  describe('GET /api/transactions', () => {
    beforeEach(async () => {
      // Create some test transactions
      const transactions = [
        {
          amount: 100,
          description: 'Transaction 1',
          categoryId: 'food',
          type: 'expense',
          date: new Date('2024-01-15').toISOString()
        },
        {
          amount: 200,
          description: 'Transaction 2',
          categoryId: 'transport',
          type: 'expense',
          date: new Date('2024-01-16').toISOString()
        },
        {
          amount: 1000,
          description: 'Salary',
          categoryId: 'salary',
          type: 'income',
          date: new Date('2024-01-01').toISOString()
        }
      ];

      for (const transaction of transactions) {
        await request(app.getFastifyInstance().server)
          .post('/api/transactions')
          .set('Authorization', `Bearer ${accessToken}`)
          .send(transaction);
      }

      // Wait for async processing
      await TestUtils.waitFor(500);
    });

    it('should return user transactions with default pagination', async () => {
      const response = await request(app.getFastifyInstance().server)
        .get('/api/transactions')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data).toHaveProperty('transactions');
      expect(response.body.data).toHaveProperty('pagination');
      expect(response.body.data.transactions).toHaveLength(3);
      expect(response.body.data.pagination).toMatchObject({
        page: 1,
        limit: 20,
        total: 3,
        totalPages: 1
      });
    });

    it('should support pagination parameters', async () => {
      const response = await request(app.getFastifyInstance().server)
        .get('/api/transactions?page=1&limit=2')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data.transactions).toHaveLength(2);
      expect(response.body.data.pagination).toMatchObject({
        page: 1,
        limit: 2,
        total: 3,
        totalPages: 2
      });
    });

    it('should filter by transaction type', async () => {
      const response = await request(app.getFastifyInstance().server)
        .get('/api/transactions?type=expense')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data.transactions).toHaveLength(2);
      response.body.data.transactions.forEach((tx: any) => {
        expect(tx.type).toBe('expense');
      });
    });

    it('should filter by category', async () => {
      const response = await request(app.getFastifyInstance().server)
        .get('/api/transactions?categoryId=food')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data.transactions).toHaveLength(1);
      expect(response.body.data.transactions[0].categoryId).toBe('food');
    });

    it('should filter by date range', async () => {
      const response = await request(app.getFastifyInstance().server)
        .get('/api/transactions?startDate=2024-01-15&endDate=2024-01-16')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data.transactions).toHaveLength(2);
    });

    it('should return empty array for different user', async () => {
      // Create another user
      const anotherUserResponse = await request(app.getFastifyInstance().server)
        .post('/api/auth/register')
        .send({
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane.smith@example.com',
          password: 'StrongPassword123!',
          confirmPassword: 'StrongPassword123!',
          acceptTerms: true
        });

      const anotherUserToken = anotherUserResponse.body.data.tokens.accessToken;

      const response = await request(app.getFastifyInstance().server)
        .get('/api/transactions')
        .set('Authorization', `Bearer ${anotherUserToken}`)
        .expect(200);

      expect(response.body.data.transactions).toHaveLength(0);
    });

    it('should return 401 for missing authorization', async () => {
      const response = await request(app.getFastifyInstance().server)
        .get('/api/transactions')
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should validate pagination parameters', async () => {
      const response = await request(app.getFastifyInstance().server)
        .get('/api/transactions?page=0&limit=1000')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should sort transactions by date descending by default', async () => {
      const response = await request(app.getFastifyInstance().server)
        .get('/api/transactions')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const transactions = response.body.data.transactions;
      expect(new Date(transactions[0].date).getTime())
        .toBeGreaterThan(new Date(transactions[1].date).getTime());
    });
  });

  describe('GET /api/transactions/:id', () => {
    let transactionId: string;

    beforeEach(async () => {
      const createResponse = await request(app.getFastifyInstance().server)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          amount: 150.75,
          description: 'Test transaction',
          categoryId: 'food',
          type: 'expense'
        });

      transactionId = createResponse.body.data.transactionId;
    });

    it('should return transaction by ID', async () => {
      const response = await request(app.getFastifyInstance().server)
        .get(`/api/transactions/${transactionId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data.transaction).toMatchObject({
        id: transactionId,
        amount: 150.75,
        description: 'Test transaction',
        categoryId: 'food',
        type: 'expense',
        userId
      });
    });

    it('should return 404 for non-existent transaction', async () => {
      const response = await request(app.getFastifyInstance().server)
        .get('/api/transactions/non-existent-id')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);

      expect(response.body.error.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('should return 403 for transaction belonging to another user', async () => {
      // Create another user
      const anotherUserResponse = await request(app.getFastifyInstance().server)
        .post('/api/auth/register')
        .send({
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane.smith@example.com',
          password: 'StrongPassword123!',
          confirmPassword: 'StrongPassword123!',
          acceptTerms: true
        });

      const anotherUserToken = anotherUserResponse.body.data.tokens.accessToken;

      const response = await request(app.getFastifyInstance().server)
        .get(`/api/transactions/${transactionId}`)
        .set('Authorization', `Bearer ${anotherUserToken}`)
        .expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('should return 401 for missing authorization', async () => {
      const response = await request(app.getFastifyInstance().server)
        .get(`/api/transactions/${transactionId}`)
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('PUT /api/transactions/:id', () => {
    let transactionId: string;

    beforeEach(async () => {
      const createResponse = await request(app.getFastifyInstance().server)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          amount: 150.75,
          description: 'Original description',
          categoryId: 'food',
          type: 'expense'
        });

      transactionId = createResponse.body.data.transactionId;
    });

    it('should update transaction with valid data', async () => {
      const updateData = {
        amount: 200.50,
        description: 'Updated description',
        categoryId: 'transport'
      };

      const response = await request(app.getFastifyInstance().server)
        .put(`/api/transactions/${transactionId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data.transaction).toMatchObject({
        id: transactionId,
        amount: updateData.amount,
        description: updateData.description,
        categoryId: updateData.categoryId,
        userId
      });
    });

    it('should return 400 for invalid update data', async () => {
      const invalidData = {
        amount: -100 // Invalid negative amount for expense
      };

      const response = await request(app.getFastifyInstance().server)
        .put(`/api/transactions/${transactionId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(invalidData)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 404 for non-existent transaction', async () => {
      const response = await request(app.getFastifyInstance().server)
        .put('/api/transactions/non-existent-id')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ description: 'Updated' })
        .expect(404);

      expect(response.body.error.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('should return 403 for transaction belonging to another user', async () => {
      const anotherUserResponse = await request(app.getFastifyInstance().server)
        .post('/api/auth/register')
        .send({
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane.smith@example.com',
          password: 'StrongPassword123!',
          confirmPassword: 'StrongPassword123!',
          acceptTerms: true
        });

      const anotherUserToken = anotherUserResponse.body.data.tokens.accessToken;

      const response = await request(app.getFastifyInstance().server)
        .put(`/api/transactions/${transactionId}`)
        .set('Authorization', `Bearer ${anotherUserToken}`)
        .send({ description: 'Updated' })
        .expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('DELETE /api/transactions/:id', () => {
    let transactionId: string;

    beforeEach(async () => {
      const createResponse = await request(app.getFastifyInstance().server)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          amount: 150.75,
          description: 'Transaction to delete',
          categoryId: 'food',
          type: 'expense'
        });

      transactionId = createResponse.body.data.transactionId;
    });

    it('should delete transaction successfully', async () => {
      const response = await request(app.getFastifyInstance().server)
        .delete(`/api/transactions/${transactionId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', 'Transaction deleted successfully');

      // Verify transaction is deleted
      const getResponse = await request(app.getFastifyInstance().server)
        .get(`/api/transactions/${transactionId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('should return 404 for non-existent transaction', async () => {
      const response = await request(app.getFastifyInstance().server)
        .delete('/api/transactions/non-existent-id')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);

      expect(response.body.error.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('should return 403 for transaction belonging to another user', async () => {
      const anotherUserResponse = await request(app.getFastifyInstance().server)
        .post('/api/auth/register')
        .send({
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane.smith@example.com',
          password: 'StrongPassword123!',
          confirmPassword: 'StrongPassword123!',
          acceptTerms: true
        });

      const anotherUserToken = anotherUserResponse.body.data.tokens.accessToken;

      const response = await request(app.getFastifyInstance().server)
        .delete(`/api/transactions/${transactionId}`)
        .set('Authorization', `Bearer ${anotherUserToken}`)
        .expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('GET /api/transactions/summary', () => {
    beforeEach(async () => {
      // Create transactions for summary testing
      const transactions = [
        { amount: 100, description: 'Expense 1', categoryId: 'food', type: 'expense', date: '2024-01-15T00:00:00Z' },
        { amount: 200, description: 'Expense 2', categoryId: 'transport', type: 'expense', date: '2024-01-16T00:00:00Z' },
        { amount: 1500, description: 'Salary', categoryId: 'salary', type: 'income', date: '2024-01-01T00:00:00Z' }
      ];

      for (const transaction of transactions) {
        await request(app.getFastifyInstance().server)
          .post('/api/transactions')
          .set('Authorization', `Bearer ${accessToken}`)
          .send(transaction);
      }

      await TestUtils.waitFor(1000); // Wait for processing
    });

    it('should return monthly transaction summary', async () => {
      const response = await request(app.getFastifyInstance().server)
        .get('/api/transactions/summary?year=2024&month=1')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data.summary).toMatchObject({
        userId,
        year: 2024,
        month: 1,
        totalIncome: 1500,
        totalExpenses: 300,
        netIncome: 1200,
        transactionCount: 3
      });

      expect(response.body.data.summary).toHaveProperty('categoryBreakdown');
      expect(response.body.data.summary.categoryBreakdown).toHaveLength(3);
    });

    it('should return empty summary for month with no transactions', async () => {
      const response = await request(app.getFastifyInstance().server)
        .get('/api/transactions/summary?year=2024&month=12')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data.summary).toMatchObject({
        userId,
        year: 2024,
        month: 12,
        totalIncome: 0,
        totalExpenses: 0,
        netIncome: 0,
        transactionCount: 0
      });
    });

    it('should return 400 for invalid date parameters', async () => {
      const response = await request(app.getFastifyInstance().server)
        .get('/api/transactions/summary?year=invalid&month=13')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should default to current month if no parameters provided', async () => {
      const response = await request(app.getFastifyInstance().server)
        .get('/api/transactions/summary')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const currentDate = new Date();
      expect(response.body.data.summary.year).toBe(currentDate.getFullYear());
      expect(response.body.data.summary.month).toBe(currentDate.getMonth() + 1);
    });
  });

  describe('POST /api/transactions/bulk', () => {
    it('should create multiple transactions in bulk', async () => {
      const bulkData = {
        transactions: [
          { amount: 100, description: 'Transaction 1', categoryId: 'food', type: 'expense' },
          { amount: 200, description: 'Transaction 2', categoryId: 'transport', type: 'expense' },
          { amount: 1000, description: 'Income', categoryId: 'salary', type: 'income' }
        ]
      };

      const response = await request(app.getFastifyInstance().server)
        .post('/api/transactions/bulk')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(bulkData)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('created');
      expect(response.body.data).toHaveProperty('failed');
      expect(response.body.data.created).toHaveLength(3);
      expect(response.body.data.failed).toHaveLength(0);
    });

    it('should handle partial failures in bulk creation', async () => {
      const bulkData = {
        transactions: [
          { amount: 100, description: 'Valid transaction', categoryId: 'food', type: 'expense' },
          { amount: -100, description: 'Invalid transaction', categoryId: 'food', type: 'expense' }, // Invalid negative amount
          { description: 'Missing amount', categoryId: 'food', type: 'expense' } // Missing required field
        ]
      };

      const response = await request(app.getFastifyInstance().server)
        .post('/api/transactions/bulk')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(bulkData)
        .expect(207); // Multi-status

      expect(response.body.data.created).toHaveLength(1);
      expect(response.body.data.failed).toHaveLength(2);
      expect(response.body.data.failed[0]).toHaveProperty('error');
      expect(response.body.data.failed[1]).toHaveProperty('error');
    });

    it('should return 400 for empty bulk data', async () => {
      const response = await request(app.getFastifyInstance().server)
        .post('/api/transactions/bulk')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ transactions: [] })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should enforce bulk operation limits', async () => {
      const transactions = Array.from({ length: 101 }, (_, i) => ({
        amount: 100,
        description: `Transaction ${i}`,
        categoryId: 'food',
        type: 'expense'
      }));

      const response = await request(app.getFastifyInstance().server)
        .post('/api/transactions/bulk')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ transactions })
        .expect(400);

      expect(response.body.error.message).toMatch(/limit.*100/i);
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle database connection errors gracefully', async () => {
      // This would require mocking database connection failures
      // For now, we'll test a scenario that might trigger database errors
      const invalidData = {
        amount: Number.MAX_SAFE_INTEGER + 1, // Potentially problematic number
        description: 'A'.repeat(10000), // Very long description
        categoryId: 'food',
        type: 'expense'
      };

      const response = await request(app.getFastifyInstance().server)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(invalidData)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should handle concurrent transaction creation', async () => {
      const transactionData = {
        amount: 100,
        description: 'Concurrent transaction',
        categoryId: 'food',
        type: 'expense'
      };

      // Create multiple transactions concurrently
      const promises = Array.from({ length: 5 }, () =>
        request(app.getFastifyInstance().server)
          .post('/api/transactions')
          .set('Authorization', `Bearer ${accessToken}`)
          .send(transactionData)
      );

      const responses = await Promise.all(promises);

      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
      });

      // All should have unique transaction IDs
      const transactionIds = responses.map(r => r.body.data.transactionId);
      const uniqueIds = new Set(transactionIds);
      expect(uniqueIds.size).toBe(5);
    });
  });
});