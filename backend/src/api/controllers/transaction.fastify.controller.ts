// backend/src/api/controllers/transaction.fastify.controller.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import { CreateTransactionUseCase, CreateTransactionUseCaseRequest } from '../../core/application/use-cases/transaction/create-transaction.use-case';
import { ListTransactionsUseCase, ListTransactionsUseCaseRequest } from '../../core/application/use-cases/transaction/list-transactions.use-case';
import { UpdateTransactionUseCase, UpdateTransactionUseCaseRequest } from '../../core/application/use-cases/transaction/update-transaction.use-case';
import { TransactionRepositoryImpl } from '../../infrastructure/database/postgres/repositories/transaction.repository.impl';
import { TransactionType, PaymentMethod } from '../../core/domain/entities/transaction.entity';
import { logger } from '../../infrastructure/monitoring/logger.service';
import { ValidationException } from '../../shared/exceptions/validation.exception';
import { BusinessException } from '../../shared/exceptions/business.exception';

// Interfaces para requests
interface CreateTransactionRequest {
    accountId: string;
    destinationAccountId?: string;
    categoryId: string;
    description: string;
    amount: number;
    currency?: string;
    type: TransactionType;
    paymentMethod: PaymentMethod;
    transactionDate?: string;
    dueDate?: string;
    tags?: string[];
    notes?: string;
    attachments?: string[];
    metadata?: Record<string, any>;
}

interface ListTransactionsRequest {
    accountId?: string;
    categoryId?: string;
    type?: TransactionType;
    startDate?: string;
    endDate?: string;
    searchTerm?: string;
    tags?: string[];
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}

interface UpdateTransactionRequest {
    categoryId?: string;
    description?: string;
    amount?: number;
    currency?: string;
    paymentMethod?: PaymentMethod;
    transactionDate?: string;
    dueDate?: string;
    tags?: string[];
    notes?: string;
    metadata?: Record<string, any>;
}

interface TransactionParams {
    id: string;
}

export class TransactionFastifyController {
    private readonly createTransactionUseCase: CreateTransactionUseCase;
    private readonly listTransactionsUseCase: ListTransactionsUseCase;
    private readonly updateTransactionUseCase: UpdateTransactionUseCase;

    constructor() {
        // Initialize repository and use cases
        const transactionRepository = new TransactionRepositoryImpl();
        this.createTransactionUseCase = new CreateTransactionUseCase(transactionRepository);
        this.listTransactionsUseCase = new ListTransactionsUseCase(transactionRepository);
        this.updateTransactionUseCase = new UpdateTransactionUseCase(transactionRepository);
    }

    /**
     * Cria nova transação
     * POST /transactions
     */
    async create(
        request: FastifyRequest<{ Body: CreateTransactionRequest }>,
        reply: FastifyReply
    ): Promise<void> {
        try {
            // Get user from JWT token (would be set by auth middleware)
            const userId = (request as any).user?.id;
            if (!userId) {
                reply.code(401).send({
                    success: false,
                    message: 'Authentication required',
                    error: 'AUTHENTICATION_REQUIRED'
                });
                return;
            }

            logger.info('Creating transaction', {
                userId,
                type: request.body.type,
                amount: request.body.amount
            });

            const useCaseRequest: CreateTransactionUseCaseRequest = {
                userId,
                accountId: request.body.accountId,
                destinationAccountId: request.body.destinationAccountId,
                categoryId: request.body.categoryId,
                description: request.body.description,
                amount: request.body.amount,
                currency: request.body.currency,
                type: request.body.type,
                paymentMethod: request.body.paymentMethod,
                transactionDate: request.body.transactionDate ? new Date(request.body.transactionDate) : undefined,
                dueDate: request.body.dueDate ? new Date(request.body.dueDate) : undefined,
                tags: request.body.tags,
                notes: request.body.notes,
                attachments: request.body.attachments,
                metadata: request.body.metadata
            };

            const result = await this.createTransactionUseCase.execute(useCaseRequest);

            reply.code(201).send({
                success: true,
                data: {
                    transaction: result.transaction.toJSON()
                },
                message: result.message
            });

        } catch (error) {
            this.handleError(error, reply, 'Failed to create transaction');
        }
    }

    /**
     * Lista transações com filtros e paginação
     * GET /transactions
     */
    async list(
        request: FastifyRequest<{ Querystring: ListTransactionsRequest }>,
        reply: FastifyReply
    ): Promise<void> {
        try {
            // Get user from JWT token
            const userId = (request as any).user?.id;
            if (!userId) {
                reply.code(401).send({
                    success: false,
                    message: 'Authentication required',
                    error: 'AUTHENTICATION_REQUIRED'
                });
                return;
            }

            logger.info('Listing transactions', {
                userId,
                filters: request.query
            });

            const useCaseRequest: ListTransactionsUseCaseRequest = {
                userId,
                accountId: request.query.accountId,
                categoryId: request.query.categoryId,
                type: request.query.type,
                startDate: request.query.startDate ? new Date(request.query.startDate) : undefined,
                endDate: request.query.endDate ? new Date(request.query.endDate) : undefined,
                searchTerm: request.query.searchTerm,
                tags: request.query.tags,
                pagination: {
                    page: request.query.page || 1,
                    limit: request.query.limit || 20,
                    sortBy: request.query.sortBy || 'transactionDate',
                    sortOrder: request.query.sortOrder || 'desc'
                }
            };

            const result = await this.listTransactionsUseCase.execute(useCaseRequest);

            reply.code(200).send({
                success: true,
                data: {
                    transactions: result.transactions.map(tx => tx.toJSON()),
                    pagination: result.pagination,
                    summary: result.summary
                }
            });

        } catch (error) {
            this.handleError(error, reply, 'Failed to list transactions');
        }
    }

    /**
     * Obtém transação por ID
     * GET /transactions/:id
     */
    async getById(
        request: FastifyRequest<{ Params: TransactionParams }>,
        reply: FastifyReply
    ): Promise<void> {
        try {
            const userId = (request as any).user?.id;
            if (!userId) {
                reply.code(401).send({
                    success: false,
                    message: 'Authentication required',
                    error: 'AUTHENTICATION_REQUIRED'
                });
                return;
            }

            const { id } = request.params;

            logger.info('Getting transaction by ID', {
                transactionId: id,
                userId
            });

            // TODO: Implement GetTransactionByIdUseCase
            // For now, return a mock response
            reply.code(501).send({
                success: false,
                message: 'Get transaction by ID not implemented yet',
                error: 'NOT_IMPLEMENTED'
            });

        } catch (error) {
            this.handleError(error, reply, 'Failed to get transaction');
        }
    }

    /**
     * Atualiza transação existente
     * PUT /transactions/:id
     */
    async update(
        request: FastifyRequest<{ Params: TransactionParams; Body: UpdateTransactionRequest }>,
        reply: FastifyReply
    ): Promise<void> {
        try {
            const userId = (request as any).user?.id;
            if (!userId) {
                reply.code(401).send({
                    success: false,
                    message: 'Authentication required',
                    error: 'AUTHENTICATION_REQUIRED'
                });
                return;
            }

            const { id } = request.params;

            logger.info('Updating transaction', {
                transactionId: id,
                userId
            });

            const useCaseRequest: UpdateTransactionUseCaseRequest = {
                transactionId: id,
                userId,
                categoryId: request.body.categoryId,
                description: request.body.description,
                amount: request.body.amount,
                currency: request.body.currency,
                paymentMethod: request.body.paymentMethod,
                transactionDate: request.body.transactionDate ? new Date(request.body.transactionDate) : undefined,
                dueDate: request.body.dueDate ? new Date(request.body.dueDate) : undefined,
                tags: request.body.tags,
                notes: request.body.notes,
                metadata: request.body.metadata
            };

            const result = await this.updateTransactionUseCase.execute(useCaseRequest);

            reply.code(200).send({
                success: true,
                data: {
                    transaction: result.transaction.toJSON()
                },
                message: result.message
            });

        } catch (error) {
            this.handleError(error, reply, 'Failed to update transaction');
        }
    }

    /**
     * Marca transação como paga
     * PATCH /transactions/:id/pay
     */
    async markAsPaid(
        request: FastifyRequest<{ Params: TransactionParams }>,
        reply: FastifyReply
    ): Promise<void> {
        try {
            const userId = (request as any).user?.id;
            if (!userId) {
                reply.code(401).send({
                    success: false,
                    message: 'Authentication required',
                    error: 'AUTHENTICATION_REQUIRED'
                });
                return;
            }

            const { id } = request.params;

            logger.info('Marking transaction as paid', {
                transactionId: id,
                userId
            });

            // TODO: Implement MarkTransactionAsPaidUseCase
            reply.code(501).send({
                success: false,
                message: 'Mark as paid not implemented yet',
                error: 'NOT_IMPLEMENTED'
            });

        } catch (error) {
            this.handleError(error, reply, 'Failed to mark transaction as paid');
        }
    }

    /**
     * Cancela transação
     * PATCH /transactions/:id/cancel
     */
    async cancel(
        request: FastifyRequest<{ Params: TransactionParams }>,
        reply: FastifyReply
    ): Promise<void> {
        try {
            const userId = (request as any).user?.id;
            if (!userId) {
                reply.code(401).send({
                    success: false,
                    message: 'Authentication required',
                    error: 'AUTHENTICATION_REQUIRED'
                });
                return;
            }

            const { id } = request.params;

            logger.info('Cancelling transaction', {
                transactionId: id,
                userId
            });

            // TODO: Implement CancelTransactionUseCase
            reply.code(501).send({
                success: false,
                message: 'Cancel transaction not implemented yet',
                error: 'NOT_IMPLEMENTED'
            });

        } catch (error) {
            this.handleError(error, reply, 'Failed to cancel transaction');
        }
    }

    /**
     * Exclui transação
     * DELETE /transactions/:id
     */
    async delete(
        request: FastifyRequest<{ Params: TransactionParams }>,
        reply: FastifyReply
    ): Promise<void> {
        try {
            const userId = (request as any).user?.id;
            if (!userId) {
                reply.code(401).send({
                    success: false,
                    message: 'Authentication required',
                    error: 'AUTHENTICATION_REQUIRED'
                });
                return;
            }

            const { id } = request.params;

            logger.info('Deleting transaction', {
                transactionId: id,
                userId
            });

            // TODO: Implement DeleteTransactionUseCase
            reply.code(501).send({
                success: false,
                message: 'Delete transaction not implemented yet',
                error: 'NOT_IMPLEMENTED'
            });

        } catch (error) {
            this.handleError(error, reply, 'Failed to delete transaction');
        }
    }

    /**
     * Obtém resumo de transações por período
     * GET /transactions/summary
     */
    async getSummary(
        request: FastifyRequest<{ Querystring: { startDate?: string; endDate?: string; accountId?: string } }>,
        reply: FastifyReply
    ): Promise<void> {
        try {
            const userId = (request as any).user?.id;
            if (!userId) {
                reply.code(401).send({
                    success: false,
                    message: 'Authentication required',
                    error: 'AUTHENTICATION_REQUIRED'
                });
                return;
            }

            logger.info('Getting transaction summary', {
                userId,
                params: request.query
            });

            // TODO: Implement GetTransactionSummaryUseCase
            reply.code(501).send({
                success: false,
                message: 'Transaction summary not implemented yet',
                error: 'NOT_IMPLEMENTED'
            });

        } catch (error) {
            this.handleError(error, reply, 'Failed to get transaction summary');
        }
    }

    private handleError(error: unknown, reply: FastifyReply, defaultMessage: string): void {
        logger.error(defaultMessage, error as Error);

        if (error instanceof ValidationException) {
            reply.code(400).send({
                success: false,
                message: error.message,
                error: 'VALIDATION_ERROR',
                details: error.validationErrors
            });
        } else if (error instanceof BusinessException) {
            reply.code(error.statusCode).send({
                success: false,
                message: error.message,
                error: error.code
            });
        } else {
            reply.code(500).send({
                success: false,
                message: defaultMessage,
                error: 'INTERNAL_SERVER_ERROR'
            });
        }
    }
}

// Singleton instance
export const transactionController = new TransactionFastifyController();