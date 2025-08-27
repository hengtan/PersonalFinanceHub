// Simple transaction routes for testing
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../../infrastructure/monitoring/logger.service';

interface CreateTransactionRequest {
    description: string;
    amount: number;
    transactionType: 'income' | 'expense' | 'transfer';
    transactionDate: string;
    accountId: string;
}

export default async function transactionRoutes(fastify: FastifyInstance) {
    // Create transaction endpoint
    fastify.post<{ Body: CreateTransactionRequest }>('/', {
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
                required: ['description', 'amount', 'transactionType', 'transactionDate', 'accountId'],
                properties: {
                    description: { type: 'string' },
                    amount: { type: 'number' },
                    transactionType: { type: 'string', enum: ['income', 'expense', 'transfer'] },
                    transactionDate: { type: 'string', format: 'date-time' },
                    accountId: { type: 'string' }
                }
            }
        }
    }, async (request: FastifyRequest<{ Body: CreateTransactionRequest }>, reply: FastifyReply) => {
        try {
            // Mock authentication check
            const authHeader = request.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return reply.code(401).send({
                    success: false,
                    message: 'Authentication required'
                });
            }

            const { description, amount, transactionType, transactionDate, accountId } = request.body;

            logger.info('Transaction creation attempt', { 
                description, 
                amount, 
                transactionType,
                accountId 
            });

            // Mock account validation
            if (accountId === '00000000-0000-0000-0000-000000000001') {
                return reply.code(404).send({
                    success: false,
                    message: 'Account not found',
                    error: 'ACCOUNT_NOT_FOUND'
                });
            }

            // Mock transaction creation
            const mockTransaction = {
                id: 'tx-' + Date.now(),
                description,
                amount,
                type: transactionType,
                date: transactionDate,
                accountId,
                createdAt: new Date().toISOString()
            };

            return reply.code(201).send({
                success: true,
                message: 'Transaction created successfully',
                data: {
                    transaction: mockTransaction
                }
            });

        } catch (error) {
            logger.error('Transaction creation error', error as Error);
            return reply.code(500).send({
                success: false,
                message: 'Database connection error'
            });
        }
    });

    // Get transactions endpoint
    fastify.get('/', {
        schema: {
            tags: ['Transactions'],
            description: 'Get user transactions',
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

            logger.info('Transactions list requested');

            // Mock transactions
            const mockTransactions = [
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
            ];

            return reply.code(200).send({
                success: true,
                data: {
                    transactions: mockTransactions,
                    pagination: {
                        page: 1,
                        limit: 20,
                        total: 2,
                        totalPages: 1
                    }
                }
            });

        } catch (error) {
            logger.error('Transactions list error', error as Error);
            return reply.code(500).send({
                success: false,
                message: 'Internal server error'
            });
        }
    });

    logger.info('Simple transaction routes registered successfully');
}