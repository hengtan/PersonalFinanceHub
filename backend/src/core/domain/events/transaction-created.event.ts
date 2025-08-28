// backend/src/core/domain/events/transaction-created.event.ts
import { BaseDomainEvent } from './base-domain.event';
import { TransactionType, PaymentMethod } from '../entities/transaction.entity';

export interface TransactionCreatedPayload {
    userId: string;
    accountId: string;
    categoryId: string;
    description: string;
    amount: number;
    currency: string;
    type: TransactionType;
    paymentMethod: PaymentMethod;
    transactionDate: Date;
    tags: string[];
}

export class TransactionCreatedEvent extends BaseDomainEvent {
    constructor(
        transactionId: string,
        private readonly payload: TransactionCreatedPayload
    ) {
        super(transactionId, 'TransactionCreated', 'Transaction');
        this.setUserId(payload.userId);
    }

    getPayload(): TransactionCreatedPayload {
        return {
            ...this.payload,
            transactionDate: new Date(this.payload.transactionDate)
        };
    }

    get userId(): string {
        return this.payload.userId;
    }

    get accountId(): string {
        return this.payload.accountId;
    }

    get categoryId(): string {
        return this.payload.categoryId;
    }

    get description(): string {
        return this.payload.description;
    }

    get amount(): number {
        return this.payload.amount;
    }

    get currency(): string {
        return this.payload.currency;
    }

    get type(): TransactionType {
        return this.payload.type;
    }

    get paymentMethod(): PaymentMethod {
        return this.payload.paymentMethod;
    }

    get transactionDate(): Date {
        return this.payload.transactionDate;
    }

    get tags(): string[] {
        return [...this.payload.tags];
    }
}