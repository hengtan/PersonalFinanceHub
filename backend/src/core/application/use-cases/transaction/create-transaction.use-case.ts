import { TransactionEntity, TransactionType, PaymentMethod } from '../../../domain/entities/transaction.entity';
import { TransactionFactory, CreateTransactionRequest } from '../../../domain/factories/transaction.factory';
import { TransactionRepository } from '../../../domain/repositories/transaction.repository';
import { logger } from '../../../../infrastructure/monitoring/logger.service';
import { ValidationException } from '../../../../shared/exceptions/validation.exception';
import { BusinessException } from '../../../../shared/exceptions/business.exception';
import { TransactionCreatedEvent } from '../../../domain/events/transaction-events';
import { EventPublisher } from '../../../../infrastructure/events/event-publisher';

export interface CreateTransactionUseCaseRequest {
    userId: string;
    accountId: string;
    destinationAccountId?: string;
    categoryId: string;
    description: string;
    amount: number;
    currency?: string;
    type: TransactionType;
    paymentMethod: PaymentMethod;
    transactionDate?: Date;
    dueDate?: Date;
    tags?: string[];
    notes?: string;
    attachments?: string[];
    metadata?: Record<string, any>;
}

export interface CreateTransactionUseCaseResponse {
    transaction: TransactionEntity;
    message: string;
}

export class CreateTransactionUseCase {
    constructor(
        private readonly transactionRepository: TransactionRepository,
        private readonly eventPublisher?: EventPublisher
    ) {}

    async execute(request: CreateTransactionUseCaseRequest): Promise<CreateTransactionUseCaseResponse> {
        try {
            logger.info('Creating new transaction', {
                userId: request.userId,
                type: request.type,
                amount: request.amount
            });

            // Validate request
            this.validateRequest(request);

            // TODO: Validate user exists and account belongs to user
            // await this.validateUser(request.userId);
            // await this.validateAccount(request.accountId, request.userId);

            // Create transaction entity
            const factoryRequest: CreateTransactionRequest = {
                userId: request.userId,
                accountId: request.accountId,
                destinationAccountId: request.destinationAccountId,
                categoryId: request.categoryId,
                description: request.description,
                amount: request.amount,
                currency: request.currency as any,
                type: request.type,
                paymentMethod: request.paymentMethod,
                transactionDate: request.transactionDate,
                dueDate: request.dueDate,
                tags: request.tags,
                notes: request.notes,
                attachments: request.attachments,
                metadata: request.metadata
            };

            const transaction = TransactionFactory.create(factoryRequest);

            // Save to repository
            const savedTransaction = await this.transactionRepository.create(transaction.toJSON());

            const createdEntity = TransactionFactory.fromDatabase(savedTransaction);

            logger.info('Transaction created successfully', {
                transactionId: savedTransaction.id,
                userId: request.userId,
                amount: request.amount
            });

            // Publish domain event
            if (this.eventPublisher) {
                const event = new TransactionCreatedEvent(
                    createdEntity,
                    request.userId,
                    {
                        source: 'CreateTransactionUseCase',
                        userAgent: 'API'
                    }
                );
                
                try {
                    await this.eventPublisher.publish(event);
                } catch (eventError) {
                    // Log but don't fail the transaction creation
                    logger.error('Failed to publish transaction created event', eventError as Error, {
                        transactionId: savedTransaction.id
                    });
                }
            }

            return {
                transaction: createdEntity,
                message: 'Transaction created successfully'
            };

        } catch (error) {
            logger.error('Failed to create transaction', error as Error, {
                userId: request.userId,
                type: request.type
            });

            if (error instanceof ValidationException || error instanceof BusinessException) {
                throw error;
            }

            throw new BusinessException('Failed to create transaction', 'TRANSACTION_CREATION_FAILED', 500);
        }
    }

    private validateRequest(request: CreateTransactionUseCaseRequest): void {
        const errors: Array<{ field: string; message: string }> = [];

        if (!request.userId || request.userId.trim() === '') {
            errors.push({ field: 'userId', message: 'User ID is required' });
        }

        if (!request.accountId || request.accountId.trim() === '') {
            errors.push({ field: 'accountId', message: 'Account ID is required' });
        }

        if (!request.categoryId || request.categoryId.trim() === '') {
            errors.push({ field: 'categoryId', message: 'Category ID is required' });
        }

        if (!request.description || request.description.trim() === '') {
            errors.push({ field: 'description', message: 'Description is required' });
        } else if (request.description.length > 500) {
            errors.push({ field: 'description', message: 'Description must be less than 500 characters' });
        }

        if (!request.amount || request.amount <= 0) {
            errors.push({ field: 'amount', message: 'Amount must be greater than zero' });
        }

        if (!Object.values(TransactionType).includes(request.type)) {
            errors.push({ field: 'type', message: 'Invalid transaction type' });
        }

        if (!Object.values(PaymentMethod).includes(request.paymentMethod)) {
            errors.push({ field: 'paymentMethod', message: 'Invalid payment method' });
        }

        if (request.type === TransactionType.TRANSFER && !request.destinationAccountId) {
            errors.push({ field: 'destinationAccountId', message: 'Destination account is required for transfers' });
        }

        if (request.type === TransactionType.TRANSFER && request.accountId === request.destinationAccountId) {
            errors.push({ field: 'destinationAccountId', message: 'Source and destination accounts cannot be the same' });
        }

        if (request.transactionDate && request.dueDate && request.transactionDate > request.dueDate) {
            errors.push({ field: 'dueDate', message: 'Due date cannot be before transaction date' });
        }

        if (request.tags && request.tags.length > 20) {
            errors.push({ field: 'tags', message: 'Maximum 20 tags allowed' });
        }

        if (request.notes && request.notes.length > 1000) {
            errors.push({ field: 'notes', message: 'Notes must be less than 1000 characters' });
        }

        if (errors.length > 0) {
            throw new ValidationException('Validation failed', errors);
        }
    }

    // TODO: Implement when user/account repositories are available
    /*
    private async validateUser(userId: string): Promise<void> {
        const user = await this.userRepository.findById(userId);
        if (!user) {
            throw new BusinessException('User not found', 'USER_NOT_FOUND', 404);
        }
        if (!user.isActive) {
            throw new BusinessException('User account is not active', 'USER_NOT_ACTIVE', 403);
        }
    }

    private async validateAccount(accountId: string, userId: string): Promise<void> {
        const account = await this.accountRepository.findById(accountId);
        if (!account) {
            throw new BusinessException('Account not found', 'ACCOUNT_NOT_FOUND', 404);
        }
        if (account.userId !== userId) {
            throw new BusinessException('Account does not belong to user', 'ACCOUNT_NOT_OWNED', 403);
        }
    }
    */
}