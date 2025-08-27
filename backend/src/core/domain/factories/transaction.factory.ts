// backend/src/core/domain/factories/transaction.factory.ts
import { TransactionEntity, TransactionEntityProps, TransactionType, TransactionStatus, PaymentMethod, RecurringConfig } from '../entities/transaction.entity';
import { Money } from '../value-objects/money.vo';
import { Currency } from '../../../shared/types/common.types';
import { v4 as uuidv4 } from 'uuid';

export interface CreateTransactionRequest {
    userId: string;
    accountId: string;
    destinationAccountId?: string;
    categoryId: string;
    description: string;
    amount: number;
    currency?: Currency;
    type: TransactionType;
    paymentMethod: PaymentMethod;
    transactionDate?: Date;
    dueDate?: Date;
    tags?: string[];
    notes?: string;
    attachments?: string[];
    isRecurring?: boolean;
    recurringConfig?: RecurringConfig;
    metadata?: Record<string, any>;
}

export class TransactionFactory {
    static create(request: CreateTransactionRequest): TransactionEntity {
        const now = new Date();
        const transactionId = uuidv4();

        const props: TransactionEntityProps = {
            id: transactionId,
            userId: request.userId,
            accountId: request.accountId,
            destinationAccountId: request.destinationAccountId,
            categoryId: request.categoryId,
            description: request.description.trim(),
            amount: new Money(request.amount, request.currency || 'BRL'),
            type: request.type,
            status: TransactionStatus.PENDING,
            paymentMethod: request.paymentMethod,
            transactionDate: request.transactionDate || now,
            dueDate: request.dueDate,
            isPaid: false,
            isRecurring: request.isRecurring || false,
            recurringConfig: request.recurringConfig,
            tags: request.tags || [],
            notes: request.notes,
            attachments: request.attachments || [],
            metadata: request.metadata,
            createdAt: now,
            updatedAt: now
        };

        return new TransactionEntity(props);
    }

    static createIncome(request: Omit<CreateTransactionRequest, 'type' | 'destinationAccountId'>): TransactionEntity {
        return this.create({
            ...request,
            type: TransactionType.INCOME
        });
    }

    static createExpense(request: Omit<CreateTransactionRequest, 'type' | 'destinationAccountId'>): TransactionEntity {
        return this.create({
            ...request,
            type: TransactionType.EXPENSE
        });
    }

    static createTransfer(request: Omit<CreateTransactionRequest, 'type'> & { destinationAccountId: string }): TransactionEntity {
        return this.create({
            ...request,
            type: TransactionType.TRANSFER
        });
    }

    static createRecurring(
        request: Omit<CreateTransactionRequest, 'isRecurring' | 'recurringConfig'> & {
            recurringConfig: RecurringConfig
        }
    ): TransactionEntity {
        return this.create({
            ...request,
            isRecurring: true,
            recurringConfig: request.recurringConfig
        });
    }

    static fromDatabase(dbData: any): TransactionEntity {
        const props: TransactionEntityProps = {
            id: dbData.id,
            userId: dbData.user_id || dbData.userId,
            accountId: dbData.account_id || dbData.accountId,
            destinationAccountId: dbData.destination_account_id || dbData.destinationAccountId,
            categoryId: dbData.category_id || dbData.categoryId,
            description: dbData.description,
            amount: new Money(
                parseFloat(dbData.amount || dbData.amount_value),
                dbData.currency || dbData.amount_currency || 'BRL'
            ),
            type: dbData.type,
            status: dbData.status,
            paymentMethod: dbData.payment_method || dbData.paymentMethod,
            transactionDate: new Date(dbData.transaction_date || dbData.transactionDate),
            dueDate: dbData.due_date ? new Date(dbData.due_date) : undefined,
            isPaid: dbData.is_paid || dbData.isPaid || false,
            isRecurring: dbData.is_recurring || dbData.isRecurring || false,
            recurringConfig: dbData.recurring_config || dbData.recurringConfig,
            tags: Array.isArray(dbData.tags) 
                ? dbData.tags 
                : (typeof dbData.tags === 'string' ? JSON.parse(dbData.tags || '[]') : []),
            notes: dbData.notes,
            attachments: Array.isArray(dbData.attachments) 
                ? dbData.attachments 
                : (typeof dbData.attachments === 'string' ? JSON.parse(dbData.attachments || '[]') : []),
            metadata: typeof dbData.metadata === 'string' 
                ? JSON.parse(dbData.metadata || '{}') 
                : (dbData.metadata || {}),
            createdAt: new Date(dbData.created_at || dbData.createdAt),
            updatedAt: new Date(dbData.updated_at || dbData.updatedAt),
            deletedAt: dbData.deleted_at ? new Date(dbData.deleted_at) : undefined
        };

        return new TransactionEntity(props);
    }

    static createBulk(requests: CreateTransactionRequest[]): TransactionEntity[] {
        return requests.map(request => this.create(request));
    }

    static clone(transaction: TransactionEntity, overrides: Partial<CreateTransactionRequest> = {}): TransactionEntity {
        const originalData = transaction.toJSON();
        
        const request: CreateTransactionRequest = {
            userId: overrides.userId || originalData.userId,
            accountId: overrides.accountId || originalData.accountId,
            destinationAccountId: overrides.destinationAccountId || originalData.destinationAccountId,
            categoryId: overrides.categoryId || originalData.categoryId,
            description: overrides.description || originalData.description,
            amount: overrides.amount || originalData.amount.amount,
            currency: overrides.currency || originalData.amount.currency,
            type: overrides.type || originalData.type,
            paymentMethod: overrides.paymentMethod || originalData.paymentMethod,
            transactionDate: overrides.transactionDate || originalData.transactionDate,
            dueDate: overrides.dueDate || originalData.dueDate,
            tags: overrides.tags || originalData.tags,
            notes: overrides.notes || originalData.notes,
            attachments: overrides.attachments || originalData.attachments,
            isRecurring: overrides.isRecurring !== undefined ? overrides.isRecurring : originalData.isRecurring,
            recurringConfig: overrides.recurringConfig || originalData.recurringConfig,
            metadata: overrides.metadata || originalData.metadata
        };

        return this.create(request);
    }

    static generateNextRecurringTransaction(baseTransaction: TransactionEntity): TransactionEntity | null {
        if (!baseTransaction.isRecurring || !baseTransaction.recurringConfig) {
            return null;
        }

        const config = baseTransaction.recurringConfig;
        let nextDate = new Date(baseTransaction.transactionDate);

        switch (config.frequency) {
            case 'DAILY':
                nextDate.setDate(nextDate.getDate() + config.interval);
                break;
            case 'WEEKLY':
                nextDate.setDate(nextDate.getDate() + (config.interval * 7));
                break;
            case 'MONTHLY':
                nextDate.setMonth(nextDate.getMonth() + config.interval);
                break;
            case 'YEARLY':
                nextDate.setFullYear(nextDate.getFullYear() + config.interval);
                break;
            default:
                return null;
        }

        // Check if we've passed the end date
        if (config.endDate && nextDate > config.endDate) {
            return null;
        }

        const originalData = baseTransaction.toJSON();
        const request: CreateTransactionRequest = {
            userId: originalData.userId,
            accountId: originalData.accountId,
            destinationAccountId: originalData.destinationAccountId,
            categoryId: originalData.categoryId,
            description: originalData.description,
            amount: originalData.amount.amount,
            currency: originalData.amount.currency,
            type: originalData.type,
            paymentMethod: originalData.paymentMethod,
            transactionDate: nextDate,
            dueDate: originalData.dueDate ? new Date(nextDate.getTime() + (new Date(originalData.dueDate).getTime() - baseTransaction.transactionDate.getTime())) : undefined,
            tags: originalData.tags,
            notes: originalData.notes,
            attachments: [], // Don't copy attachments to new transactions
            isRecurring: true,
            recurringConfig: {
                ...config,
                nextDate: nextDate
            },
            metadata: originalData.metadata
        };

        return this.create(request);
    }
}