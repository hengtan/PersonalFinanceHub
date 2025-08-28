// test/e2e/api/budget.e2e.test.ts
import { FastifyInstance } from 'fastify';
import { App } from '@/app';
import { TestUtils } from '@test/helpers/test-utils';

describe('Budget API E2E Tests', () => {
    let app: FastifyInstance;
    let testApp: App;

    beforeAll(async () => {
        // Initialize test app
        testApp = new App({
            environment: 'test',
            port: 0, // Let the system assign a port
            cors: {
                origin: true,
                credentials: true
            }
        });

        app = testApp.getFastifyInstance();
        await testApp.initialize();
        await testApp.start();
    });

    afterAll(async () => {
        if (testApp) {
            await testApp.stop();
        }
    });

    beforeEach(async () => {
        // Clean up test data before each test
        await TestUtils.clearAllDatabases();
    });

    const createAuthHeaders = (userId: string = 'test-user-1') => ({
        'Authorization': `Bearer ${generateTestJWT(userId)}`,
        'Content-Type': 'application/json'
    });

    // Mock JWT generation for testing
    const generateTestJWT = (userId: string) => {
        // In a real test, you'd use your actual JWT library
        return `test-jwt-${userId}`;
    };

    // Mock authentication middleware for tests
    beforeAll(() => {
        jest.mock('@/api/middlewares/auth.middleware', () => ({
            authenticateUser: async (request: any, reply: any) => {
                const authHeader = request.headers.authorization;
                if (!authHeader || !authHeader.startsWith('Bearer ')) {
                    return reply.code(401).send({ success: false, error: 'Unauthorized' });
                }
                const token = authHeader.split(' ')[1];
                const userId = token.replace('test-jwt-', '');
                request.user = { id: userId, email: `${userId}@test.com` };
            }
        }));
    });

    describe('POST /api/budgets', () => {
        const validBudgetData = {
            name: 'Monthly Budget',
            description: 'Test budget for the month',
            totalAmount: 1000.00,
            currency: 'BRL',
            period: 'MONTHLY',
            startDate: '2023-01-01T00:00:00.000Z',
            endDate: '2023-01-31T23:59:59.999Z',
            categories: [
                {
                    categoryId: 'cat-1',
                    categoryName: 'Food',
                    percentage: 30.0,
                    allocatedAmount: 300.00,
                    description: 'Food expenses',
                    isEssential: true
                },
                {
                    categoryId: 'cat-2', 
                    categoryName: 'Entertainment',
                    percentage: 20.0,
                    allocatedAmount: 200.00,
                    description: 'Entertainment expenses',
                    isEssential: false
                },
                {
                    categoryId: 'cat-3',
                    categoryName: 'Transportation',
                    percentage: 50.0,
                    allocatedAmount: 500.00,
                    description: 'Transportation expenses',
                    isEssential: true
                }
            ],
            alertThreshold: 80,
            budgetType: 'percentage_based',
            isActive: true
        };

        it('should create a new budget successfully', async () => {
            const response = await app.inject({
                method: 'POST',
                url: '/api/budgets',
                headers: createAuthHeaders(),
                payload: validBudgetData
            });

            expect(response.statusCode).toBe(201);
            
            const body = JSON.parse(response.payload);
            expect(body.success).toBe(true);
            expect(body.data.budget).toBeDefined();
            expect(body.data.budget.name).toBe('Monthly Budget');
            expect(body.data.budget.totalAmount).toBe(1000.00);
            expect(body.data.budget.categories).toHaveLength(3);
        });

        it('should validate category percentages sum to 100%', async () => {
            const invalidData = {
                ...validBudgetData,
                categories: [
                    ...validBudgetData.categories,
                    {
                        categoryId: 'cat-4',
                        categoryName: 'Extra',
                        percentage: 10.0, // This makes total 110%
                        allocatedAmount: 100.00
                    }
                ]
            };

            const response = await app.inject({
                method: 'POST',
                url: '/api/budgets',
                headers: createAuthHeaders(),
                payload: invalidData
            });

            expect(response.statusCode).toBe(400);
            
            const body = JSON.parse(response.payload);
            expect(body.success).toBe(false);
            expect(body.error).toBe('Validation Error');
            expect(body.message).toContain('Category percentages must sum to exactly 100%');
        });

        it('should require authentication', async () => {
            const response = await app.inject({
                method: 'POST',
                url: '/api/budgets',
                payload: validBudgetData
            });

            expect(response.statusCode).toBe(401);
            
            const body = JSON.parse(response.payload);
            expect(body.success).toBe(false);
            expect(body.error).toBe('Unauthorized');
        });

        it('should validate required fields', async () => {
            const invalidData = {
                name: '', // Empty name
                totalAmount: -100, // Negative amount
                categories: [] // Empty categories
            };

            const response = await app.inject({
                method: 'POST',
                url: '/api/budgets',
                headers: createAuthHeaders(),
                payload: invalidData
            });

            expect(response.statusCode).toBe(400);
            
            const body = JSON.parse(response.payload);
            expect(body.success).toBe(false);
            expect(body.details).toBeDefined();
            expect(body.details.length).toBeGreaterThan(0);
        });

        it('should validate currency format', async () => {
            const invalidData = {
                ...validBudgetData,
                currency: 'INVALID' // Invalid currency code
            };

            const response = await app.inject({
                method: 'POST',
                url: '/api/budgets',
                headers: createAuthHeaders(),
                payload: invalidData
            });

            expect(response.statusCode).toBe(400);
            
            const body = JSON.parse(response.payload);
            expect(body.success).toBe(false);
        });

        it('should enforce rate limiting', async () => {
            const promises = [];
            
            // Send 12 requests quickly (exceeds limit of 10 per 5 minutes)
            for (let i = 0; i < 12; i++) {
                promises.push(
                    app.inject({
                        method: 'POST',
                        url: '/api/budgets',
                        headers: createAuthHeaders(),
                        payload: { ...validBudgetData, name: `Budget ${i}` }
                    })
                );
            }

            const responses = await Promise.all(promises);
            
            // Some requests should be rate limited
            const rateLimitedResponses = responses.filter(r => r.statusCode === 429);
            expect(rateLimitedResponses.length).toBeGreaterThan(0);
        });
    });

    describe('GET /api/budgets', () => {
        beforeEach(async () => {
            // Create test budgets
            await app.inject({
                method: 'POST',
                url: '/api/budgets',
                headers: createAuthHeaders(),
                payload: {
                    ...validBudgetData,
                    name: 'Active Budget',
                    isActive: true
                }
            });

            await app.inject({
                method: 'POST',
                url: '/api/budgets',
                headers: createAuthHeaders(),
                payload: {
                    ...validBudgetData,
                    name: 'Inactive Budget',
                    isActive: false
                }
            });
        });

        it('should list budgets with pagination', async () => {
            const response = await app.inject({
                method: 'GET',
                url: '/api/budgets?page=1&limit=10',
                headers: createAuthHeaders()
            });

            expect(response.statusCode).toBe(200);
            
            const body = JSON.parse(response.payload);
            expect(body.success).toBe(true);
            expect(body.data.budgets).toBeDefined();
            expect(Array.isArray(body.data.budgets)).toBe(true);
        });

        it('should filter budgets by active status', async () => {
            const response = await app.inject({
                method: 'GET',
                url: '/api/budgets?isActive=true',
                headers: createAuthHeaders()
            });

            expect(response.statusCode).toBe(200);
            
            const body = JSON.parse(response.payload);
            expect(body.success).toBe(true);
            
            // All returned budgets should be active
            body.data.budgets.forEach((budget: any) => {
                expect(budget.isActive).toBe(true);
            });
        });

        it('should filter budgets by period', async () => {
            const response = await app.inject({
                method: 'GET',
                url: '/api/budgets?period=MONTHLY',
                headers: createAuthHeaders()
            });

            expect(response.statusCode).toBe(200);
            
            const body = JSON.parse(response.payload);
            expect(body.success).toBe(true);
        });

        it('should search budgets by name', async () => {
            const response = await app.inject({
                method: 'GET',
                url: '/api/budgets?search=Active',
                headers: createAuthHeaders()
            });

            expect(response.statusCode).toBe(200);
            
            const body = JSON.parse(response.payload);
            expect(body.success).toBe(true);
            
            // Should find the "Active Budget"
            const activeBudget = body.data.budgets.find((b: any) => b.name === 'Active Budget');
            expect(activeBudget).toBeDefined();
        });

        it('should require authentication', async () => {
            const response = await app.inject({
                method: 'GET',
                url: '/api/budgets'
            });

            expect(response.statusCode).toBe(401);
        });
    });

    describe('GET /api/budgets/:id', () => {
        let budgetId: string;

        beforeEach(async () => {
            const createResponse = await app.inject({
                method: 'POST',
                url: '/api/budgets',
                headers: createAuthHeaders(),
                payload: validBudgetData
            });

            const body = JSON.parse(createResponse.payload);
            budgetId = body.data.budget.id;
        });

        it('should get budget by ID', async () => {
            const response = await app.inject({
                method: 'GET',
                url: `/api/budgets/${budgetId}`,
                headers: createAuthHeaders()
            });

            expect(response.statusCode).toBe(200);
            
            const body = JSON.parse(response.payload);
            expect(body.success).toBe(true);
            expect(body.data.budget.id).toBe(budgetId);
            expect(body.data.budget.name).toBe('Monthly Budget');
        });

        it('should return 404 for non-existent budget', async () => {
            const response = await app.inject({
                method: 'GET',
                url: '/api/budgets/non-existent-id',
                headers: createAuthHeaders()
            });

            expect(response.statusCode).toBe(404);
            
            const body = JSON.parse(response.payload);
            expect(body.success).toBe(false);
            expect(body.error).toBe('Not Found');
        });

        it('should validate UUID format', async () => {
            const response = await app.inject({
                method: 'GET',
                url: '/api/budgets/invalid-uuid',
                headers: createAuthHeaders()
            });

            expect(response.statusCode).toBe(400);
        });
    });

    describe('PUT /api/budgets/:id', () => {
        let budgetId: string;

        beforeEach(async () => {
            const createResponse = await app.inject({
                method: 'POST',
                url: '/api/budgets',
                headers: createAuthHeaders(),
                payload: validBudgetData
            });

            const body = JSON.parse(createResponse.payload);
            budgetId = body.data.budget.id;
        });

        it('should update budget successfully', async () => {
            const updateData = {
                name: 'Updated Budget Name',
                totalAmount: 1200.00,
                categories: [
                    {
                        categoryId: 'cat-1',
                        categoryName: 'Food',
                        percentage: 40.0,
                        allocatedAmount: 480.00
                    },
                    {
                        categoryId: 'cat-2',
                        categoryName: 'Entertainment',
                        percentage: 60.0,
                        allocatedAmount: 720.00
                    }
                ]
            };

            const response = await app.inject({
                method: 'PUT',
                url: `/api/budgets/${budgetId}`,
                headers: createAuthHeaders(),
                payload: updateData
            });

            expect(response.statusCode).toBe(200);
            
            const body = JSON.parse(response.payload);
            expect(body.success).toBe(true);
            expect(body.data.budget.name).toBe('Updated Budget Name');
            expect(body.data.budget.totalAmount).toBe(1200.00);
            expect(body.data.budget.categories).toHaveLength(2);
        });

        it('should validate updated category percentages', async () => {
            const invalidUpdate = {
                categories: [
                    {
                        categoryId: 'cat-1',
                        categoryName: 'Food',
                        percentage: 60.0
                    },
                    {
                        categoryId: 'cat-2',
                        categoryName: 'Entertainment', 
                        percentage: 50.0 // Total: 110%
                    }
                ]
            };

            const response = await app.inject({
                method: 'PUT',
                url: `/api/budgets/${budgetId}`,
                headers: createAuthHeaders(),
                payload: invalidUpdate
            });

            expect(response.statusCode).toBe(400);
            
            const body = JSON.parse(response.payload);
            expect(body.success).toBe(false);
            expect(body.message).toContain('Category percentages must sum to exactly 100%');
        });

        it('should return 404 for non-existent budget', async () => {
            const response = await app.inject({
                method: 'PUT',
                url: '/api/budgets/non-existent-id',
                headers: createAuthHeaders(),
                payload: { name: 'Updated Name' }
            });

            expect(response.statusCode).toBe(404);
        });
    });

    describe('DELETE /api/budgets/:id', () => {
        let budgetId: string;

        beforeEach(async () => {
            const createResponse = await app.inject({
                method: 'POST',
                url: '/api/budgets',
                headers: createAuthHeaders(),
                payload: validBudgetData
            });

            const body = JSON.parse(createResponse.payload);
            budgetId = body.data.budget.id;
        });

        it('should delete budget successfully', async () => {
            const response = await app.inject({
                method: 'DELETE',
                url: `/api/budgets/${budgetId}`,
                headers: createAuthHeaders()
            });

            expect(response.statusCode).toBe(200);
            
            const body = JSON.parse(response.payload);
            expect(body.success).toBe(true);
            expect(body.message).toContain('deleted successfully');
        });

        it('should return 404 for non-existent budget', async () => {
            const response = await app.inject({
                method: 'DELETE',
                url: '/api/budgets/non-existent-id',
                headers: createAuthHeaders()
            });

            expect(response.statusCode).toBe(404);
        });

        it('should not allow access to deleted budget', async () => {
            // Delete the budget
            await app.inject({
                method: 'DELETE',
                url: `/api/budgets/${budgetId}`,
                headers: createAuthHeaders()
            });

            // Try to access deleted budget
            const response = await app.inject({
                method: 'GET',
                url: `/api/budgets/${budgetId}`,
                headers: createAuthHeaders()
            });

            expect(response.statusCode).toBe(404);
        });
    });

    describe('POST /api/budgets/validate-percentages', () => {
        const validationData = {
            categories: [
                {
                    categoryId: 'cat-1',
                    categoryName: 'Food',
                    percentage: 30.0,
                    allocatedAmount: 300.00
                },
                {
                    categoryId: 'cat-2',
                    categoryName: 'Entertainment',
                    percentage: 70.0,
                    allocatedAmount: 700.00
                }
            ],
            totalAmount: 1000.00,
            currency: 'BRL'
        };

        it('should validate correct percentages', async () => {
            const response = await app.inject({
                method: 'POST',
                url: '/api/budgets/validate-percentages',
                headers: createAuthHeaders(),
                payload: validationData
            });

            expect(response.statusCode).toBe(200);
            
            const body = JSON.parse(response.payload);
            expect(body.success).toBe(true);
            expect(body.data.isValid).toBe(true);
            expect(body.data.totalPercentage).toBe(100.0);
            expect(body.data.variance).toBe(0.0);
            expect(body.data.categories).toHaveLength(2);
        });

        it('should detect invalid percentages', async () => {
            const invalidData = {
                ...validationData,
                categories: [
                    {
                        categoryId: 'cat-1',
                        categoryName: 'Food',
                        percentage: 30.0
                    },
                    {
                        categoryId: 'cat-2',
                        categoryName: 'Entertainment',
                        percentage: 80.0 // Total: 110%
                    }
                ]
            };

            const response = await app.inject({
                method: 'POST',
                url: '/api/budgets/validate-percentages',
                headers: createAuthHeaders(),
                payload: invalidData
            });

            expect(response.statusCode).toBe(200);
            
            const body = JSON.parse(response.payload);
            expect(body.success).toBe(true);
            expect(body.data.isValid).toBe(false);
            expect(body.data.totalPercentage).toBe(110.0);
            expect(body.data.variance).toBe(10.0);
        });

        it('should calculate allocated amounts correctly', async () => {
            const response = await app.inject({
                method: 'POST',
                url: '/api/budgets/validate-percentages',
                headers: createAuthHeaders(),
                payload: validationData
            });

            expect(response.statusCode).toBe(200);
            
            const body = JSON.parse(response.payload);
            expect(body.data.categories[0].allocatedAmount).toBe(300.00);
            expect(body.data.categories[1].allocatedAmount).toBe(700.00);
        });

        it('should handle missing total amount', async () => {
            const dataWithoutTotal = {
                categories: validationData.categories
                // totalAmount missing
            };

            const response = await app.inject({
                method: 'POST',
                url: '/api/budgets/validate-percentages',
                headers: createAuthHeaders(),
                payload: dataWithoutTotal
            });

            expect(response.statusCode).toBe(200);
            
            const body = JSON.parse(response.payload);
            expect(body.success).toBe(true);
            // Should still validate percentages even without total amount
        });
    });

    describe('error handling and edge cases', () => {
        it('should handle malformed JSON', async () => {
            const response = await app.inject({
                method: 'POST',
                url: '/api/budgets',
                headers: createAuthHeaders(),
                payload: 'invalid json'
            });

            expect(response.statusCode).toBe(400);
        });

        it('should handle very large budget amounts', async () => {
            const largeAmountData = {
                ...validBudgetData,
                totalAmount: 999999999.99
            };

            const response = await app.inject({
                method: 'POST',
                url: '/api/budgets',
                headers: createAuthHeaders(),
                payload: largeAmountData
            });

            expect(response.statusCode).toBe(201);
            
            const body = JSON.parse(response.payload);
            expect(body.data.budget.totalAmount).toBe(999999999.99);
        });

        it('should handle very small percentage values', async () => {
            const smallPercentageData = {
                ...validBudgetData,
                categories: [
                    {
                        categoryId: 'cat-1',
                        categoryName: 'Food',
                        percentage: 0.01 // Very small percentage
                    },
                    {
                        categoryId: 'cat-2',
                        categoryName: 'Other',
                        percentage: 99.99
                    }
                ]
            };

            const response = await app.inject({
                method: 'POST',
                url: '/api/budgets',
                headers: createAuthHeaders(),
                payload: smallPercentageData
            });

            expect(response.statusCode).toBe(201);
        });

        it('should handle budget with maximum categories', async () => {
            const categories = [];
            for (let i = 1; i <= 20; i++) { // Max 20 categories
                categories.push({
                    categoryId: `cat-${i}`,
                    categoryName: `Category ${i}`,
                    percentage: 5.0 // 20 * 5 = 100%
                });
            }

            const maxCategoriesData = {
                ...validBudgetData,
                categories
            };

            const response = await app.inject({
                method: 'POST',
                url: '/api/budgets',
                headers: createAuthHeaders(),
                payload: maxCategoriesData
            });

            expect(response.statusCode).toBe(201);
            
            const body = JSON.parse(response.payload);
            expect(body.data.budget.categories).toHaveLength(20);
        });

        it('should reject budget with too many categories', async () => {
            const categories = [];
            for (let i = 1; i <= 21; i++) { // Over the limit
                categories.push({
                    categoryId: `cat-${i}`,
                    categoryName: `Category ${i}`,
                    percentage: 100 / 21 // Will be unbalanced anyway
                });
            }

            const tooManyCategoriesData = {
                ...validBudgetData,
                categories
            };

            const response = await app.inject({
                method: 'POST',
                url: '/api/budgets',
                headers: createAuthHeaders(),
                payload: tooManyCategoriesData
            });

            expect(response.statusCode).toBe(400);
        });
    });

    describe('security and validation', () => {
        it('should prevent XSS in budget names', async () => {
            const xssData = {
                ...validBudgetData,
                name: '<script>alert("xss")</script>',
                description: '<img src=x onerror=alert("xss")>'
            };

            const response = await app.inject({
                method: 'POST',
                url: '/api/budgets',
                headers: createAuthHeaders(),
                payload: xssData
            });

            expect(response.statusCode).toBe(201);
            
            const body = JSON.parse(response.payload);
            // XSS should be sanitized or escaped
            expect(body.data.budget.name).not.toContain('<script>');
            expect(body.data.budget.description).not.toContain('<img');
        });

        it('should validate CORS headers', async () => {
            const response = await app.inject({
                method: 'OPTIONS',
                url: '/api/budgets',
                headers: {
                    'Origin': 'http://localhost:3000',
                    'Access-Control-Request-Method': 'POST'
                }
            });

            expect(response.headers['access-control-allow-origin']).toBeDefined();
            expect(response.headers['access-control-allow-methods']).toBeDefined();
        });

        it('should include security headers in responses', async () => {
            const response = await app.inject({
                method: 'GET',
                url: '/api/budgets',
                headers: createAuthHeaders()
            });

            expect(response.headers['x-api-version']).toBeDefined();
            expect(response.headers['x-environment']).toBe('test');
        });
    });
});