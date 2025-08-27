// backend/src/core/domain/events/transaction-events.ts
import { BaseDomainEvent } from './base-domain.event';
import { TransactionEntity, TransactionType } from '../entities/transaction.entity';

// Transaction Created Event
export class TransactionCreatedEvent extends BaseDomainEvent {
    public readonly eventType = 'TransactionCreated';
    
    constructor(
        public readonly transaction: TransactionEntity,
        public readonly userId: string,
        public readonly metadata?: Record<string, any>
    ) {
        super();
    }

    toJSON() {
        return {
            eventId: this.eventId,
            eventType: this.eventType,
            aggregateId: this.transaction.id,
            aggregateType: 'Transaction',
            version: this.version,
            occurredOn: this.occurredOn,
            userId: this.userId,
            data: {
                transaction: this.transaction.toJSON(),
                metadata: this.metadata
            }
        };
    }
}

// Transaction Updated Event
export class TransactionUpdatedEvent extends BaseDomainEvent {
    public readonly eventType = 'TransactionUpdated';
    
    constructor(
        public readonly transactionId: string,
        public readonly oldTransaction: TransactionEntity,
        public readonly newTransaction: TransactionEntity,
        public readonly userId: string,
        public readonly changedFields: string[],
        public readonly metadata?: Record<string, any>
    ) {
        super();
    }

    toJSON() {
        return {
            eventId: this.eventId,
            eventType: this.eventType,
            aggregateId: this.transactionId,
            aggregateType: 'Transaction',
            version: this.version,
            occurredOn: this.occurredOn,
            userId: this.userId,
            data: {
                oldTransaction: this.oldTransaction.toJSON(),
                newTransaction: this.newTransaction.toJSON(),
                changedFields: this.changedFields,
                metadata: this.metadata
            }
        };
    }
}

// Transaction Deleted Event
export class TransactionDeletedEvent extends BaseDomainEvent {
    public readonly eventType = 'TransactionDeleted';
    
    constructor(
        public readonly transactionId: string,
        public readonly transaction: TransactionEntity,
        public readonly userId: string,
        public readonly reason?: string,
        public readonly metadata?: Record<string, any>
    ) {
        super();
    }

    toJSON() {
        return {
            eventId: this.eventId,
            eventType: this.eventType,
            aggregateId: this.transactionId,
            aggregateType: 'Transaction',
            version: this.version,
            occurredOn: this.occurredOn,
            userId: this.userId,
            data: {
                transaction: this.transaction.toJSON(),
                reason: this.reason,
                metadata: this.metadata
            }
        };
    }
}

// Transaction Paid Event
export class TransactionPaidEvent extends BaseDomainEvent {
    public readonly eventType = 'TransactionPaid';
    
    constructor(
        public readonly transactionId: string,
        public readonly transaction: TransactionEntity,
        public readonly userId: string,
        public readonly paidAt: Date,
        public readonly paymentReference?: string,
        public readonly metadata?: Record<string, any>
    ) {
        super();
    }

    toJSON() {
        return {
            eventId: this.eventId,
            eventType: this.eventType,
            aggregateId: this.transactionId,
            aggregateType: 'Transaction',
            version: this.version,
            occurredOn: this.occurredOn,
            userId: this.userId,
            data: {
                transaction: this.transaction.toJSON(),
                paidAt: this.paidAt,
                paymentReference: this.paymentReference,
                metadata: this.metadata
            }
        };
    }
}

// Transaction Cancelled Event
export class TransactionCancelledEvent extends BaseDomainEvent {
    public readonly eventType = 'TransactionCancelled';
    
    constructor(
        public readonly transactionId: string,
        public readonly transaction: TransactionEntity,
        public readonly userId: string,
        public readonly reason: string,
        public readonly metadata?: Record<string, any>
    ) {
        super();
    }

    toJSON() {
        return {
            eventId: this.eventId,
            eventType: this.eventType,
            aggregateId: this.transactionId,
            aggregateType: 'Transaction',
            version: this.version,
            occurredOn: this.occurredOn,
            userId: this.userId,
            data: {
                transaction: this.transaction.toJSON(),
                reason: this.reason,
                metadata: this.metadata
            }
        };
    }
}

// Budget Exceeded Event (triggered by transactions)
export class BudgetExceededEvent extends BaseDomainEvent {
    public readonly eventType = 'BudgetExceeded';
    
    constructor(
        public readonly budgetId: string,
        public readonly categoryId: string,
        public readonly userId: string,
        public readonly budgetLimit: number,
        public readonly currentSpent: number,
        public readonly exceedingTransaction: TransactionEntity,
        public readonly metadata?: Record<string, any>
    ) {
        super();
    }

    toJSON() {
        return {
            eventId: this.eventId,
            eventType: this.eventType,
            aggregateId: this.budgetId,
            aggregateType: 'Budget',
            version: this.version,
            occurredOn: this.occurredOn,
            userId: this.userId,
            data: {
                budgetId: this.budgetId,
                categoryId: this.categoryId,
                budgetLimit: this.budgetLimit,
                currentSpent: this.currentSpent,
                exceedingAmount: this.currentSpent - this.budgetLimit,
                exceedingTransaction: this.exceedingTransaction.toJSON(),
                metadata: this.metadata
            }
        };
    }
}

// Suspicious Transaction Event (for fraud detection)
export class SuspiciousTransactionEvent extends BaseDomainEvent {
    public readonly eventType = 'SuspiciousTransaction';
    
    constructor(
        public readonly transactionId: string,
        public readonly transaction: TransactionEntity,
        public readonly userId: string,
        public readonly suspiciousFactors: string[],
        public readonly riskScore: number,
        public readonly metadata?: Record<string, any>
    ) {
        super();
    }

    toJSON() {
        return {
            eventId: this.eventId,
            eventType: this.eventType,
            aggregateId: this.transactionId,
            aggregateType: 'Transaction',
            version: this.version,
            occurredOn: this.occurredOn,
            userId: this.userId,
            data: {
                transaction: this.transaction.toJSON(),
                suspiciousFactors: this.suspiciousFactors,
                riskScore: this.riskScore,
                metadata: this.metadata
            }
        };
    }
}

// Recurring Transaction Processed Event
export class RecurringTransactionProcessedEvent extends BaseDomainEvent {
    public readonly eventType = 'RecurringTransactionProcessed';
    
    constructor(
        public readonly recurringTransactionId: string,
        public readonly newTransaction: TransactionEntity,
        public readonly userId: string,
        public readonly nextDueDate?: Date,
        public readonly metadata?: Record<string, any>
    ) {
        super();
    }

    toJSON() {
        return {
            eventId: this.eventId,
            eventType: this.eventType,
            aggregateId: this.recurringTransactionId,
            aggregateType: 'RecurringTransaction',
            version: this.version,
            occurredOn: this.occurredOn,
            userId: this.userId,
            data: {
                recurringTransactionId: this.recurringTransactionId,
                newTransaction: this.newTransaction.toJSON(),
                nextDueDate: this.nextDueDate,
                metadata: this.metadata
            }
        };
    }
}