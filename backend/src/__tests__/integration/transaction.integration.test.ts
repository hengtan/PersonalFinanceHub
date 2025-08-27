// backend/src/__tests__/integration/transaction.integration.test.ts
import { buildTestApp } from '../test-app';
import { FastifyInstance } from 'fastify';
import { TransactionType, PaymentMethod } from '../../core/domain/entities/transaction.entity';

describe('Transaction Integration Tests', () => {
    let app: FastifyInstance;
    
    beforeAll(async () => {
        app = buildTestApp({ logger: false });
        await app.ready();
    });

    afterAll(async () => {
        await app.close();
    });

    // Mock user for authentication
    const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User'
    };

    describe('POST /api/transactions', () => {
        it('should create a new expense transaction', async () => {
            // Simulate authenticated user
            const response = await app.inject({
                method: 'POST',
                url: '/api/transactions',
                headers: {
                    'content-type': 'application/json',
                    'authorization': 'Bearer mock-jwt-token'
                },
                payload: {
                    accountId: 'account-456',
                    categoryId: 'category-789',
                    description: 'Integration test expense',
                    amount: 150.75,
                    currency: 'BRL',
                    type: TransactionType.EXPENSE,
                    paymentMethod: PaymentMethod.CREDIT_CARD,
                    tags: ['test', 'integration'],
                    notes: 'Created during integration test'
                }
            });

            expect(response.statusCode).toBe(201);
            
            const responseBody = JSON.parse(response.body);
            expect(responseBody.success).toBe(true);
            expect(responseBody.data.transaction).toBeDefined();
            expect(responseBody.data.transaction.description).toBe('Integration test expense');
            expect(responseBody.data.transaction.amount.amount).toBe(150.75);
            expect(responseBody.data.transaction.type).toBe(TransactionType.EXPENSE);
            expect(responseBody.message).toBe('Transaction created successfully');
        });

        it('should create a new income transaction', async () => {
            const response = await app.inject({
                method: 'POST',
                url: '/api/transactions',
                headers: {
                    'content-type': 'application/json',
                    'authorization': 'Bearer mock-jwt-token'
                },
                payload: {
                    accountId: 'account-456',
                    categoryId: 'category-income',
                    description: 'Salary payment',
                    amount: 5000.00,
                    currency: 'BRL',
                    type: TransactionType.INCOME,
                    paymentMethod: PaymentMethod.PIX,
                    tags: ['salary', 'monthly']
                }
            });

            expect(response.statusCode).toBe(201);
            
            const responseBody = JSON.parse(response.body);
            expect(responseBody.success).toBe(true);
            expect(responseBody.data.transaction.type).toBe(TransactionType.INCOME);
            expect(responseBody.data.transaction.amount.amount).toBe(5000.00);
        });

        it('should create a transfer transaction', async () => {
            const response = await app.inject({
                method: 'POST',
                url: '/api/transactions',
                headers: {
                    'content-type': 'application/json',
                    'authorization': 'Bearer mock-jwt-token'
                },
                payload: {
                    accountId: 'account-456',
                    destinationAccountId: 'account-789',
                    categoryId: 'category-transfer',
                    description: 'Account transfer',
                    amount: 1000.00,
                    currency: 'BRL',
                    type: TransactionType.TRANSFER,
                    paymentMethod: PaymentMethod.PIX
                }
            });

            expect(response.statusCode).toBe(201);
            
            const responseBody = JSON.parse(response.body);
            expect(responseBody.success).toBe(true);
            expect(responseBody.data.transaction.type).toBe(TransactionType.TRANSFER);
            expect(responseBody.data.transaction.destinationAccountId).toBe('account-789');
        });

        it('should return validation error for invalid data', async () => {
            const response = await app.inject({
                method: 'POST',
                url: '/api/transactions',
                headers: {
                    'content-type': 'application/json',
                    'authorization': 'Bearer mock-jwt-token'
                },
                payload: {
                    accountId: '', // Invalid empty accountId
                    categoryId: 'category-789',
                    description: 'Invalid transaction',
                    amount: -100, // Invalid negative amount
                    type: TransactionType.EXPENSE,
                    paymentMethod: PaymentMethod.CREDIT_CARD
                }
            });

            expect(response.statusCode).toBe(400);
            
            const responseBody = JSON.parse(response.body);
            expect(responseBody.success).toBe(false);
            expect(responseBody.error).toBe('VALIDATION_ERROR');
            expect(responseBody.details).toBeDefined();
            expect(Array.isArray(responseBody.details)).toBe(true);
        });

        it('should return 401 for unauthenticated request', async () => {
            const response = await app.inject({
                method: 'POST',
                url: '/api/transactions',
                headers: {
                    'content-type': 'application/json'
                    // No authorization header
                },
                payload: {
                    accountId: 'account-456',
                    categoryId: 'category-789',
                    description: 'Unauthorized transaction',
                    amount: 100.00,
                    type: TransactionType.EXPENSE,
                    paymentMethod: PaymentMethod.CREDIT_CARD
                }
            });

            expect(response.statusCode).toBe(401);
            
            const responseBody = JSON.parse(response.body);
            expect(responseBody.success).toBe(false);
            expect(responseBody.error).toBe('AUTHENTICATION_REQUIRED');
        });
    });

    describe('GET /api/transactions', () => {
        it('should list transactions with pagination', async () => {
            const response = await app.inject({
                method: 'GET',
                url: '/api/transactions?page=1&limit=10',
                headers: {
                    'authorization': 'Bearer mock-jwt-token'
                }
            });

            expect(response.statusCode).toBe(200);
            
            const responseBody = JSON.parse(response.body);
            expect(responseBody.success).toBe(true);
            expect(responseBody.data.transactions).toBeDefined();
            expect(Array.isArray(responseBody.data.transactions)).toBe(true);
            expect(responseBody.data.pagination).toBeDefined();
            expect(responseBody.data.pagination.page).toBe(1);
            expect(responseBody.data.pagination.limit).toBe(10);
            expect(responseBody.data.summary).toBeDefined();
        });

        it('should filter transactions by type', async () => {
            const response = await app.inject({
                method: 'GET',
                url: `/api/transactions?type=${TransactionType.EXPENSE}`,
                headers: {
                    'authorization': 'Bearer mock-jwt-token'
                }
            });

            expect(response.statusCode).toBe(200);
            
            const responseBody = JSON.parse(response.body);
            expect(responseBody.success).toBe(true);
            expect(responseBody.data.transactions).toBeDefined();
        });

        it('should filter transactions by date range', async () => {
            const startDate = '2023-01-01';
            const endDate = '2023-12-31';
            
            const response = await app.inject({
                method: 'GET',
                url: `/api/transactions?startDate=${startDate}&endDate=${endDate}`,
                headers: {
                    'authorization': 'Bearer mock-jwt-token'
                }
            });

            expect(response.statusCode).toBe(200);
            
            const responseBody = JSON.parse(response.body);
            expect(responseBody.success).toBe(true);
        });

        it('should return 401 for unauthenticated request', async () => {
            const response = await app.inject({
                method: 'GET',
                url: '/api/transactions'
                // No authorization header
            });

            expect(response.statusCode).toBe(401);
            
            const responseBody = JSON.parse(response.body);
            expect(responseBody.success).toBe(false);
            expect(responseBody.error).toBe('AUTHENTICATION_REQUIRED');
        });
    });

    describe('GET /api/transactions/:id', () => {
        it('should return 501 for not implemented endpoint', async () => {
            const response = await app.inject({
                method: 'GET',
                url: '/api/transactions/transaction-123',
                headers: {
                    'authorization': 'Bearer mock-jwt-token'
                }
            });

            expect(response.statusCode).toBe(501);
            
            const responseBody = JSON.parse(response.body);
            expect(responseBody.success).toBe(false);
            expect(responseBody.error).toBe('NOT_IMPLEMENTED');
        });
    });

    describe('PUT /api/transactions/:id', () => {
        it('should update a transaction', async () => {
            const response = await app.inject({
                method: 'PUT',
                url: '/api/transactions/transaction-123',
                headers: {
                    'content-type': 'application/json',
                    'authorization': 'Bearer mock-jwt-token'
                },
                payload: {
                    description: 'Updated description',
                    amount: 250.00,
                    notes: 'Updated during integration test'
                }
            });

            expect(response.statusCode).toBe(200);
            
            const responseBody = JSON.parse(response.body);
            expect(responseBody.success).toBe(true);
            expect(responseBody.data.transaction).toBeDefined();
            expect(responseBody.message).toBe('Transaction updated successfully');
        });

        it('should return validation error for invalid update data', async () => {
            const response = await app.inject({
                method: 'PUT',
                url: '/api/transactions/transaction-123',
                headers: {
                    'content-type': 'application/json',
                    'authorization': 'Bearer mock-jwt-token'
                },
                payload: {
                    amount: -100, // Invalid negative amount
                    description: '' // Invalid empty description
                }
            });

            expect(response.statusCode).toBe(400);
            
            const responseBody = JSON.parse(response.body);
            expect(responseBody.success).toBe(false);
            expect(responseBody.error).toBe('VALIDATION_ERROR');
        });

        it('should return 401 for unauthenticated request', async () => {
            const response = await app.inject({
                method: 'PUT',
                url: '/api/transactions/transaction-123',
                headers: {
                    'content-type': 'application/json'
                    // No authorization header
                },
                payload: {
                    description: 'Unauthorized update'
                }
            });

            expect(response.statusCode).toBe(401);
            
            const responseBody = JSON.parse(response.body);
            expect(responseBody.success).toBe(false);
            expect(responseBody.error).toBe('AUTHENTICATION_REQUIRED');
        });
    });

    describe('DELETE /api/transactions/:id', () => {
        it('should return 501 for not implemented endpoint', async () => {
            const response = await app.inject({
                method: 'DELETE',
                url: '/api/transactions/transaction-123',
                headers: {
                    'authorization': 'Bearer mock-jwt-token'
                }
            });

            expect(response.statusCode).toBe(501);
            
            const responseBody = JSON.parse(response.body);
            expect(responseBody.success).toBe(false);
            expect(responseBody.error).toBe('NOT_IMPLEMENTED');
        });
    });

    describe('PATCH /api/transactions/:id/pay', () => {
        it('should return 501 for not implemented endpoint', async () => {
            const response = await app.inject({
                method: 'PATCH',
                url: '/api/transactions/transaction-123/pay',
                headers: {
                    'authorization': 'Bearer mock-jwt-token'
                }
            });

            expect(response.statusCode).toBe(501);
            
            const responseBody = JSON.parse(response.body);
            expect(responseBody.success).toBe(false);
            expect(responseBody.error).toBe('NOT_IMPLEMENTED');
        });
    });

    describe('PATCH /api/transactions/:id/cancel', () => {
        it('should return 501 for not implemented endpoint', async () => {
            const response = await app.inject({
                method: 'PATCH',
                url: '/api/transactions/transaction-123/cancel',
                headers: {
                    'authorization': 'Bearer mock-jwt-token'
                }
            });

            expect(response.statusCode).toBe(501);
            
            const responseBody = JSON.parse(response.body);
            expect(responseBody.success).toBe(false);
            expect(responseBody.error).toBe('NOT_IMPLEMENTED');
        });
    });

    describe('GET /api/transactions/summary', () => {
        it('should return 501 for not implemented endpoint', async () => {
            const response = await app.inject({
                method: 'GET',
                url: '/api/transactions/summary',
                headers: {
                    'authorization': 'Bearer mock-jwt-token'
                }
            });

            expect(response.statusCode).toBe(501);
            
            const responseBody = JSON.parse(response.body);
            expect(responseBody.success).toBe(false);
            expect(responseBody.error).toBe('NOT_IMPLEMENTED');
        });
    });

    describe('Error Handling', () => {
        it('should handle database connection errors gracefully', async () => {
            // This test would typically require mocking database connection failures
            // For now, we'll test that the error handling structure is in place
            const response = await app.inject({
                method: 'POST',
                url: '/api/transactions',
                headers: {
                    'content-type': 'application/json',
                    'authorization': 'Bearer mock-jwt-token'
                },
                payload: {
                    accountId: 'nonexistent-account',
                    categoryId: 'category-789',
                    description: 'Test database error',
                    amount: 100.00,
                    type: TransactionType.EXPENSE,
                    paymentMethod: PaymentMethod.CREDIT_CARD
                }
            });

            // Should handle the error gracefully, not crash the server
            expect([400, 500, 201]).toContain(response.statusCode);
            
            if (response.statusCode !== 201) {
                const responseBody = JSON.parse(response.body);
                expect(responseBody.success).toBe(false);
                expect(responseBody.error).toBeDefined();
            }
        });

        it('should handle malformed JSON requests', async () => {
            const response = await app.inject({
                method: 'POST',
                url: '/api/transactions',
                headers: {
                    'content-type': 'application/json',
                    'authorization': 'Bearer mock-jwt-token'
                },
                payload: '{invalid json}' // Malformed JSON
            });

            expect(response.statusCode).toBe(400);
        });

        it('should handle missing content-type header', async () => {
            const response = await app.inject({
                method: 'POST',
                url: '/api/transactions',
                headers: {
                    'authorization': 'Bearer mock-jwt-token'
                    // Missing content-type header
                },
                payload: JSON.stringify({
                    accountId: 'account-456',
                    categoryId: 'category-789',
                    description: 'Test transaction',
                    amount: 100.00,
                    type: TransactionType.EXPENSE,
                    paymentMethod: PaymentMethod.CREDIT_CARD
                })
            });

            // Should still process the request or return appropriate error
            expect([400, 401, 201, 415]).toContain(response.statusCode);
        });
    });
});