// src/core/domain/events/transaction-ledger-processed.event.ts
import { BaseDomainEvent } from './base-domain.event';
import { TransactionType } from '../entities/transaction.entity';

export interface TransactionLedgerProcessedPayload {
    userId: string;
    transactionId: string;
    transactionType: TransactionType;
    amount: {
        amount: number;
        currency: string;
    };
    description: string;
    journalEntryIds: string[];
    processedAt: Date;
    accountsAffected: Array<{
        accountId: string;
        accountType: string;
        entryType: 'DEBIT' | 'CREDIT';
        amount: {
            amount: number;
            currency: string;
        };
    }>;
    metadata?: Record<string, any>;
}

export class TransactionLedgerProcessedEvent extends BaseDomainEvent {
    constructor(
        transactionId: string,
        private readonly payload: TransactionLedgerProcessedPayload
    ) {
        super(transactionId, 'TransactionLedgerProcessed', 'Transaction');
        this.setUserId(payload.userId);
    }

    getPayload(): TransactionLedgerProcessedPayload {
        return {
            ...this.payload,
            processedAt: new Date(this.payload.processedAt),
            accountsAffected: this.payload.accountsAffected.map(acc => ({ ...acc }))
        };
    }

    get transactionId(): string {
        return this.payload.transactionId;
    }

    get transactionType(): TransactionType {
        return this.payload.transactionType;
    }

    get amount() {
        return this.payload.amount;
    }

    get description(): string {
        return this.payload.description;
    }

    get journalEntryIds(): string[] {
        return [...this.payload.journalEntryIds];
    }

    get processedAt(): Date {
        return this.payload.processedAt;
    }

    get accountsAffected() {
        return this.payload.accountsAffected.map(acc => ({ ...acc }));
    }

    get metadata(): Record<string, any> | undefined {
        return this.payload.metadata ? { ...this.payload.metadata } : undefined;
    }
}