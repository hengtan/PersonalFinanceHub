// backend/src/api/routes/transaction.routes.ts - Fastify version
import { FastifyInstance } from 'fastify';
import { logger } from '../../infrastructure/monitoring/logger.service';
import { transactionController } from '../controllers/transaction.controller';
import {
    createTransactionSchema,
    updateTransactionSchema,
    transactionQuerySchema,
} from '../validators/transaction.validator';

export default async function transactionRoutes(fastify: FastifyInstance) {
    const routeContext = logger.child({ module: 'transaction-routes' });

    // Create transaction
    fastify.post('/', {
        schema: {
            tags: ['Transactions'],
            description: 'Create a new transaction',
            headers: {
                type: 'object',
                properties: {
                    authorization: { type: 'string', description: 'Bearer token' }
                }
            },
            body: {
                type: 'object',
                required: ['description', 'amount', 'type', 'accountId'],
                properties: {
                    description: { type: 'string', minLength: 1, maxLength: 500 },
                    amount: { type: 'number', minimum: 0.01 },
                    type: { type: 'string', enum: ['income', 'expense', 'transfer'] },
                    accountId: { type: 'string' },
                    destinationAccountId: { type: 'string' },
                    category: { type: 'string' },
                    paymentMethod: { type: 'string', enum: ['cash', 'debit_card', 'credit_card', 'bank_transfer', 'pix'] },
                    tags: { type: 'array', items: { type: 'string' } },
                    notes: { type: 'string' }
                }
            },
            response: {
                201: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        message: { type: 'string' },
                        data: {
                            type: 'object',
                            properties: {
                                transaction: {
                                    type: 'object',
                                    properties: {
                                        id: { type: 'string' },
                                        description: { type: 'string' },
                                        amount: { type: 'number' },
                                        type: { type: 'string' },
                                        status: { type: 'string' }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }, transactionController.create.bind(transactionController));

    // List transactions
    fastify.get('/', {
        schema: {
            tags: ['Transactions'],
            description: 'List user transactions with pagination and filtering',
            headers: {
                type: 'object',
                properties: {
                    authorization: { type: 'string', description: 'Bearer token' }
                }
            },
            querystring: {
                type: 'object',
                properties: {
                    page: { type: 'integer', minimum: 1, default: 1 },
                    limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
                    type: { type: 'string', enum: ['income', 'expense', 'transfer'] },
                    category: { type: 'string' },
                    startDate: { type: 'string', format: 'date' },
                    endDate: { type: 'string', format: 'date' },
                    minAmount: { type: 'number', minimum: 0 },
                    maxAmount: { type: 'number', minimum: 0 },
                    status: { type: 'string', enum: ['pending', 'completed', 'cancelled', 'failed'] },
                    search: { type: 'string' }
                }
            }
        }
    }, transactionController.list.bind(transactionController));

    // Get transaction by ID
    fastify.get('/:id', {
        schema: {
            tags: ['Transactions'],
            description: 'Get transaction details by ID',
            headers: {
                type: 'object',
                properties: {
                    authorization: { type: 'string', description: 'Bearer token' }
                }
            },
            params: {
                type: 'object',
                required: ['id'],
                properties: {
                    id: { type: 'string' }
                }
            }
        }
    }, transactionController.getById.bind(transactionController));

    // Update transaction
    fastify.put('/:id', {
        schema: {
            tags: ['Transactions'],
            description: 'Update transaction by ID',
            headers: {
                type: 'object',
                properties: {
                    authorization: { type: 'string', description: 'Bearer token' }
                }
            },
            params: {
                type: 'object',
                required: ['id'],
                properties: {
                    id: { type: 'string' }
                }
            },
            body: {
                type: 'object',
                properties: {
                    description: { type: 'string', minLength: 1, maxLength: 500 },
                    amount: { type: 'number', minimum: 0.01 },
                    type: { type: 'string', enum: ['income', 'expense', 'transfer'] },
                    category: { type: 'string' },
                    paymentMethod: { type: 'string', enum: ['cash', 'debit_card', 'credit_card', 'bank_transfer', 'pix'] },
                    tags: { type: 'array', items: { type: 'string' } },
                    notes: { type: 'string' }
                }
            }
        }
    }, transactionController.update.bind(transactionController));

    // Delete transaction
    fastify.delete('/:id', {
        schema: {
            tags: ['Transactions'],
            description: 'Delete transaction by ID',
            headers: {
                type: 'object',
                properties: {
                    authorization: { type: 'string', description: 'Bearer token' }
                }
            },
            params: {
                type: 'object',
                required: ['id'],
                properties: {
                    id: { type: 'string' }
                }
            }
        }
    }, transactionController.delete.bind(transactionController));

    // Transaction statistics
    fastify.get('/stats/summary', {
        schema: {
            tags: ['Transactions'],
            description: 'Get transaction statistics summary',
            headers: {
                type: 'object',
                properties: {
                    authorization: { type: 'string', description: 'Bearer token' }
                }
            },
            querystring: {
                type: 'object',
                properties: {
                    startDate: { type: 'string', format: 'date' },
                    endDate: { type: 'string', format: 'date' },
                    groupBy: { type: 'string', enum: ['day', 'week', 'month', 'year'] }
                }
            }
        }
    }, async (request, reply) => {
        try {
            // Mock stats for now
            const stats = {
                summary: {
                    totalTransactions: 156,
                    totalIncome: 12500.00,
                    totalExpenses: 8750.25,
                    netIncome: 3749.75,
                    averageTransaction: 80.13
                },
                byType: {
                    income: { count: 45, amount: 12500.00 },
                    expense: { count: 98, amount: 8750.25 },
                    transfer: { count: 13, amount: 2100.50 }
                },
                trends: {
                    lastWeek: { income: 3000.00, expenses: 1200.30 },
                    thisWeek: { income: 2800.00, expenses: 1450.75 }
                }
            };

            return reply.code(200).send({
                success: true,
                data: stats
            });

        } catch (error) {
            routeContext.error('Transaction stats error', error as Error);
            return reply.code(500).send({
                success: false,
                message: 'Internal server error'
            });
        }
    });

    routeContext.info('Transaction routes registered successfully');
}

export default transactionRoutes;