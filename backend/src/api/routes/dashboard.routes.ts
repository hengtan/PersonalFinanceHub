// backend/src/api/routes/dashboard.routes.ts - Fastify version
import { FastifyInstance } from 'fastify';
import { logger } from '../../infrastructure/monitoring/logger.service';
import { CalculateDashboardUseCase } from '../../core/application/use-cases/dashboard/calculate-dashboard.use-case';

const dashboardUseCase = new CalculateDashboardUseCase();

export default async function dashboardRoutes(fastify: FastifyInstance) {
    const routeContext = logger.child({ module: 'dashboard-routes' });

    // Dashboard summary endpoint
    fastify.get('/', {
        schema: {
            tags: ['Dashboard'],
            description: 'Get dashboard summary with financial overview',
            headers: {
                type: 'object',
                properties: {
                    authorization: { type: 'string', description: 'Bearer token' }
                }
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        data: {
                            type: 'object',
                            properties: {
                                summary: {
                                    type: 'object',
                                    properties: {
                                        totalBalance: { type: 'number' },
                                        totalIncome: { type: 'number' },
                                        totalExpenses: { type: 'number' },
                                        transactionCount: { type: 'number' }
                                    }
                                },
                                recentTransactions: { type: 'array' },
                                monthlyStats: { type: 'object' }
                            }
                        }
                    }
                }
            }
        }
    }, async (request, reply) => {
        try {
            // Mock authentication check for now - replace with actual auth middleware
            const authHeader = request.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return reply.code(401).send({
                    success: false,
                    message: 'Authentication required'
                });
            }

            // Extract user ID from token (mock implementation)
            const userId = 'user-123'; // Would be extracted from JWT in real implementation

            routeContext.info('Dashboard requested', { userId });

            const dashboardData = await dashboardUseCase.execute({
                userId,
                period: {
                    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
                    endDate: new Date()
                }
            });

            return reply.code(200).send({
                success: true,
                data: dashboardData
            });

        } catch (error) {
            routeContext.error('Dashboard error', error as Error);
            return reply.code(500).send({
                success: false,
                message: 'Internal server error'
            });
        }
    });

    // Dashboard summary endpoint - quick overview
    fastify.get('/summary', {
        schema: {
            tags: ['Dashboard'],
            description: 'Get quick financial summary',
            headers: {
                type: 'object',
                properties: {
                    authorization: { type: 'string', description: 'Bearer token' }
                }
            }
        }
    }, async (request, reply) => {
        try {
            const authHeader = request.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return reply.code(401).send({
                    success: false,
                    message: 'Authentication required'
                });
            }

            const userId = 'user-123';
            
            const dashboardData = await dashboardUseCase.execute({ userId });
            
            return reply.code(200).send({
                success: true,
                data: {
                    summary: dashboardData.summary,
                    monthlyStats: dashboardData.monthlyStats
                }
            });

        } catch (error) {
            routeContext.error('Dashboard summary error', error as Error);
            return reply.code(500).send({
                success: false,
                message: 'Internal server error'
            });
        }
    });

    // Category spending breakdown
    fastify.get('/categories', {
        schema: {
            tags: ['Dashboard'],
            description: 'Get spending breakdown by categories',
            headers: {
                type: 'object',
                properties: {
                    authorization: { type: 'string', description: 'Bearer token' }
                }
            }
        }
    }, async (request, reply) => {
        try {
            const authHeader = request.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return reply.code(401).send({
                    success: false,
                    message: 'Authentication required'
                });
            }

            // Mock category spending data
            const categorySpending = [
                { name: 'Food & Dining', amount: 850.30, percentage: 35.4 },
                { name: 'Transportation', amount: 420.50, percentage: 17.5 },
                { name: 'Entertainment', amount: 315.25, percentage: 13.1 },
                { name: 'Utilities', amount: 280.00, percentage: 11.7 },
                { name: 'Shopping', amount: 425.80, percentage: 17.7 },
                { name: 'Other', amount: 108.15, percentage: 4.6 }
            ];

            return reply.code(200).send({
                success: true,
                data: {
                    categories: categorySpending,
                    totalSpent: categorySpending.reduce((sum, cat) => sum + cat.amount, 0)
                }
            });

        } catch (error) {
            routeContext.error('Category spending error', error as Error);
            return reply.code(500).send({
                success: false,
                message: 'Internal server error'
            });
        }
    });

    // Financial trends over time
    fastify.get('/trends', {
        schema: {
            tags: ['Dashboard'],
            description: 'Get financial trends and patterns',
            headers: {
                type: 'object',
                properties: {
                    authorization: { type: 'string', description: 'Bearer token' }
                }
            },
            querystring: {
                type: 'object',
                properties: {
                    period: { type: 'string', enum: ['7d', '30d', '90d', '1y'], default: '30d' }
                }
            }
        }
    }, async (request, reply) => {
        try {
            const authHeader = request.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return reply.code(401).send({
                    success: false,
                    message: 'Authentication required'
                });
            }

            const { period } = request.query as { period?: string };

            // Mock trends data based on period
            const trendsData = {
                '7d': {
                    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                    income: [0, 0, 0, 0, 3000, 0, 0],
                    expenses: [45.30, 67.80, 123.50, 89.20, 156.70, 203.45, 98.15]
                },
                '30d': {
                    period: 'Last 30 days',
                    totalIncome: 8500.00,
                    totalExpenses: 2850.75,
                    averageDaily: 95.02,
                    topSpendingDays: [
                        { date: '2024-03-15', amount: 234.80 },
                        { date: '2024-03-08', amount: 189.50 },
                        { date: '2024-03-22', amount: 167.30 }
                    ]
                }
            };

            return reply.code(200).send({
                success: true,
                data: trendsData[period as keyof typeof trendsData] || trendsData['30d']
            });

        } catch (error) {
            routeContext.error('Trends error', error as Error);
            return reply.code(500).send({
                success: false,
                message: 'Internal server error'
            });
        }
    });

    routeContext.info('Dashboard routes registered successfully');
}

// dashboardRoutes já é exportado como default na declaração da função