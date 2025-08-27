// Simple dashboard routes for testing
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../../infrastructure/monitoring/logger.service';

export default async function dashboardRoutes(fastify: FastifyInstance) {
    // Dashboard endpoint
    fastify.get('/', {
        schema: {
            tags: ['Dashboard'],
            description: 'Get dashboard data with financial summary',
            headers: {
                type: 'object',
                properties: {
                    authorization: { type: 'string', description: 'Bearer token' }
                }
            }
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            // Mock authentication check
            const authHeader = request.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return reply.code(401).send({
                    success: false,
                    message: 'Authentication required'
                });
            }

            logger.info('Dashboard accessed');

            // Mock dashboard data
            const mockDashboard = {
                summary: {
                    totalBalance: 5000.00,
                    totalIncome: 3000.00,
                    totalExpenses: 1500.00,
                    transactionCount: 25
                },
                recentTransactions: [
                    {
                        id: 'tx-1',
                        description: 'Salary',
                        amount: 3000.00,
                        type: 'income',
                        date: new Date().toISOString()
                    },
                    {
                        id: 'tx-2',
                        description: 'Groceries',
                        amount: -150.00,
                        type: 'expense',
                        date: new Date().toISOString()
                    }
                ],
                monthlyStats: {
                    currentMonth: {
                        income: 3000.00,
                        expenses: 1500.00,
                        net: 1500.00
                    },
                    previousMonth: {
                        income: 2800.00,
                        expenses: 1400.00,
                        net: 1400.00
                    }
                }
            };

            return reply.code(200).send({
                success: true,
                data: mockDashboard
            });

        } catch (error) {
            logger.error('Dashboard error', error as Error);
            return reply.code(500).send({
                success: false,
                message: 'Internal server error'
            });
        }
    });

    logger.info('Simple dashboard routes registered successfully');
}