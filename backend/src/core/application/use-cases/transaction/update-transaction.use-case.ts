import { TransactionEntity, TransactionType, TransactionStatus, PaymentMethod } from '../../../domain/entities/transaction.entity';
import { TransactionFactory } from '../../../domain/factories/transaction.factory';
import { TransactionRepository } from '../../../domain/repositories/transaction.repository';
import { logger } from '../../../../infrastructure/monitoring/logger.service';
import { ValidationException } from '../../../../shared/exceptions/validation.exception';
import { BusinessException } from '../../../../shared/exceptions/business.exception';

export interface UpdateTransactionUseCaseRequest {
    transactionId: string;
    userId: string;
    categoryId?: string;
    description?: string;
    amount?: number;
    currency?: string;
    paymentMethod?: PaymentMethod;
    transactionDate?: Date;
    dueDate?: Date;
    tags?: string[];
    notes?: string;
    metadata?: Record<string, any>;
}

export interface UpdateTransactionUseCaseResponse {
    transaction: TransactionEntity;
    message: string;
}

export class UpdateTransactionUseCase {
    constructor(
        private readonly transactionRepository: TransactionRepository
    ) {}

    async execute(request: UpdateTransactionUseCaseRequest): Promise<UpdateTransactionUseCaseResponse> {
        try {
            logger.info('Updating transaction', {
                transactionId: request.transactionId,
                userId: request.userId
            });

            // Validate request
            this.validateRequest(request);

            // Find existing transaction
            const existingTransaction = await this.transactionRepository.findById(request.transactionId);
            if (!existingTransaction) {
                throw new BusinessException('Transaction not found', 'TRANSACTION_NOT_FOUND', 404);
            }

            const transactionEntity = TransactionFactory.fromDatabase(existingTransaction);

            // Verify ownership
            if (transactionEntity.userId !== request.userId) {
                throw new BusinessException('Transaction does not belong to user', 'TRANSACTION_NOT_OWNED', 403);
            }

            // Check if transaction can be updated
            if (transactionEntity.status === TransactionStatus.CANCELLED) {
                throw new BusinessException('Cannot update cancelled transaction', 'TRANSACTION_CANCELLED', 400);
            }

            if (transactionEntity.status === TransactionStatus.COMPLETED && transactionEntity.isPaid) {
                throw new BusinessException('Cannot update completed and paid transaction', 'TRANSACTION_COMPLETED', 400);
            }

            // Prepare update data
            const updateData: any = {
                id: request.transactionId
            };

            if (request.categoryId !== undefined) {
                updateData.categoryId = request.categoryId;
            }

            if (request.description !== undefined) {
                updateData.description = request.description.trim();
            }

            if (request.amount !== undefined) {
                updateData.amount = request.amount;
                if (request.currency) {
                    updateData.currency = request.currency;
                }
            }

            if (request.paymentMethod !== undefined) {
                updateData.paymentMethod = request.paymentMethod;
            }

            if (request.transactionDate !== undefined) {
                updateData.transactionDate = request.transactionDate;
            }

            if (request.dueDate !== undefined) {
                updateData.dueDate = request.dueDate;
            }

            if (request.tags !== undefined) {
                updateData.tags = request.tags;
            }

            if (request.notes !== undefined) {
                updateData.notes = request.notes;
            }

            if (request.metadata !== undefined) {
                updateData.metadata = request.metadata;
            }

            updateData.updatedAt = new Date();

            // Update in repository
            const updatedTransaction = await this.transactionRepository.update(request.transactionId, updateData);
            if (!updatedTransaction) {
                throw new BusinessException('Failed to update transaction', 'TRANSACTION_UPDATE_FAILED', 500);
            }

            const updatedEntity = TransactionFactory.fromDatabase(updatedTransaction);

            logger.info('Transaction updated successfully', {
                transactionId: request.transactionId,
                userId: request.userId
            });

            return {
                transaction: updatedEntity,
                message: 'Transaction updated successfully'
            };

        } catch (error) {
            logger.error('Failed to update transaction', error as Error, {
                transactionId: request.transactionId,
                userId: request.userId
            });

            if (error instanceof ValidationException || error instanceof BusinessException) {
                throw error;
            }

            throw new BusinessException('Failed to update transaction', 'TRANSACTION_UPDATE_FAILED', 500);
        }
    }

    private validateRequest(request: UpdateTransactionUseCaseRequest): void {
        const errors: Array<{ field: string; message: string }> = [];

        if (!request.transactionId || request.transactionId.trim() === '') {
            errors.push({ field: 'transactionId', message: 'Transaction ID is required' });
        }

        if (!request.userId || request.userId.trim() === '') {
            errors.push({ field: 'userId', message: 'User ID is required' });
        }

        if (request.description !== undefined) {
            if (request.description.trim() === '') {
                errors.push({ field: 'description', message: 'Description cannot be empty' });
            } else if (request.description.length > 500) {
                errors.push({ field: 'description', message: 'Description must be less than 500 characters' });
            }
        }

        if (request.amount !== undefined && request.amount <= 0) {
            errors.push({ field: 'amount', message: 'Amount must be greater than zero' });
        }

        if (request.paymentMethod !== undefined && !Object.values(PaymentMethod).includes(request.paymentMethod)) {
            errors.push({ field: 'paymentMethod', message: 'Invalid payment method' });
        }

        if (request.transactionDate !== undefined && request.dueDate !== undefined && request.transactionDate > request.dueDate) {
            errors.push({ field: 'dueDate', message: 'Due date cannot be before transaction date' });
        }

        if (request.tags !== undefined && request.tags.length > 20) {
            errors.push({ field: 'tags', message: 'Maximum 20 tags allowed' });
        }

        if (request.notes !== undefined && request.notes.length > 1000) {
            errors.push({ field: 'notes', message: 'Notes must be less than 1000 characters' });
        }

        if (errors.length > 0) {
            throw new ValidationException('Validation failed', errors);
        }
    }
}