import { TransactionEntity, TransactionType, TransactionStatus } from '../../../domain/entities/transaction.entity';
import { TransactionFactory } from '../../../domain/factories/transaction.factory';
import { TransactionRepository, TransactionFilter } from '../../../domain/repositories/transaction.repository';
import { logger } from '../../../../infrastructure/monitoring/logger.service';
import { ValidationException } from '../../../../shared/exceptions/validation.exception';
import { BusinessException } from '../../../../shared/exceptions/business.exception';
import { PaginationOptions, PaginatedResult } from '../../../../shared/types/common.types';

export interface ListTransactionsUseCaseRequest {
    userId: string;
    accountId?: string;
    categoryId?: string;
    type?: TransactionType;
    status?: TransactionStatus;
    startDate?: Date;
    endDate?: Date;
    searchTerm?: string;
    tags?: string[];
    pagination?: PaginationOptions;
}

export interface ListTransactionsUseCaseResponse {
    transactions: TransactionEntity[];
    pagination: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
    };
    summary: {
        totalIncome: number;
        totalExpenses: number;
        netAmount: number;
        transactionCount: number;
    };
}

export class ListTransactionsUseCase {
    constructor(
        private readonly transactionRepository: TransactionRepository
    ) {}

    async execute(request: ListTransactionsUseCaseRequest): Promise<ListTransactionsUseCaseResponse> {
        try {
            logger.info('Listing transactions', {
                userId: request.userId,
                filters: {
                    accountId: request.accountId,
                    type: request.type,
                    dateRange: request.startDate && request.endDate ? 
                        `${request.startDate.toISOString()} - ${request.endDate.toISOString()}` : undefined
                }
            });

            // Validate request
            this.validateRequest(request);

            // Prepare filters
            const filter: TransactionFilter = {
                userId: request.userId,
                categoryId: request.categoryId,
                type: request.type,
                dateFrom: request.startDate,
                dateTo: request.endDate
            };

            // Prepare pagination with validation
            const requestPage = request.pagination?.page ?? 1;
            const requestLimit = request.pagination?.limit ?? 20;
            
            const pagination: PaginationOptions = {
                page: Math.max(requestPage, 1), // Ensure minimum of 1
                limit: Math.min(Math.max(requestLimit, 1), 100), // Ensure between 1 and 100
                sortBy: request.pagination?.sortBy || 'transactionDate',
                sortOrder: request.pagination?.sortOrder || 'desc'
            };

            // Get transactions
            const transactions = await this.transactionRepository.findMany(filter, pagination);

            // Convert to entities
            const transactionEntities = transactions.map(tx => 
                TransactionFactory.fromDatabase(tx)
            );

            // Calculate summary
            const summary = this.calculateSummary(transactionEntities);

            // Calculate pagination info
            const totalCount = await this.getTransactionCount(filter);
            const totalPages = Math.ceil(totalCount / pagination.limit);
            const hasNext = pagination.page < totalPages;
            const hasPrev = pagination.page > 1;

            logger.info('Transactions listed successfully', {
                userId: request.userId,
                count: transactionEntities.length,
                totalCount,
                summary
            });

            return {
                transactions: transactionEntities,
                pagination: {
                    total: totalCount,
                    page: pagination.page,
                    limit: pagination.limit,
                    totalPages,
                    hasNext,
                    hasPrev
                },
                summary
            };

        } catch (error) {
            logger.error('Failed to list transactions', error as Error, {
                userId: request.userId
            });

            if (error instanceof ValidationException || error instanceof BusinessException) {
                throw error;
            }

            throw new BusinessException('Failed to list transactions', 'TRANSACTION_LIST_FAILED', 500);
        }
    }

    private validateRequest(request: ListTransactionsUseCaseRequest): void {
        const errors: Array<{ field: string; message: string }> = [];

        if (!request.userId || request.userId.trim() === '') {
            errors.push({ field: 'userId', message: 'User ID is required' });
        }

        if (request.type && !Object.values(TransactionType).includes(request.type)) {
            errors.push({ field: 'type', message: 'Invalid transaction type' });
        }

        if (request.startDate && request.endDate && request.startDate > request.endDate) {
            errors.push({ field: 'dateRange', message: 'Start date cannot be after end date' });
        }

        // Pagination values are automatically corrected, so no validation needed for them

        if (request.tags && request.tags.length > 10) {
            errors.push({ field: 'tags', message: 'Maximum 10 tags allowed in filter' });
        }

        if (errors.length > 0) {
            throw new ValidationException('Validation failed', errors);
        }
    }

    private calculateSummary(transactions: TransactionEntity[]) {
        let totalIncome = 0;
        let totalExpenses = 0;

        for (const transaction of transactions) {
            if (transaction.type === TransactionType.INCOME) {
                totalIncome += transaction.amount.amount;
            } else if (transaction.type === TransactionType.EXPENSE) {
                totalExpenses += transaction.amount.amount;
            }
            // Transfers are neutral in the summary as they don't change total wealth
        }

        return {
            totalIncome,
            totalExpenses,
            netAmount: totalIncome - totalExpenses,
            transactionCount: transactions.length
        };
    }

    private async getTransactionCount(filter: TransactionFilter): Promise<number> {
        // This would need to be implemented in the repository
        // For now, return a mock count
        // TODO: Implement proper count query in repository
        return 0;
    }
}