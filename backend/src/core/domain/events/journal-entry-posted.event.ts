// src/core/domain/events/journal-entry-posted.event.ts
import { BaseDomainEvent } from './base-domain.event';

export interface JournalEntryPostedPayload {
    userId: string;
    transactionId: string;
    description: string;
    totalAmount: {
        amount: number;
        currency: string;
    };
    entries: Array<{
        accountId: string;
        accountType: string;
        entryType: 'DEBIT' | 'CREDIT';
        amount: {
            amount: number;
            currency: string;
        };
        description: string;
    }>;
    postedAt: Date;
    reference?: string;
    metadata?: Record<string, any>;
}

export class JournalEntryPostedEvent extends BaseDomainEvent {
    constructor(
        journalEntryId: string,
        private readonly payload: JournalEntryPostedPayload
    ) {
        super(journalEntryId, 'JournalEntryPosted', 'JournalEntry');
        this.setUserId(payload.userId);
    }

    getPayload(): JournalEntryPostedPayload {
        return {
            ...this.payload,
            postedAt: new Date(this.payload.postedAt)
        };
    }

    get transactionId(): string {
        return this.payload.transactionId;
    }

    get description(): string {
        return this.payload.description;
    }

    get totalAmount() {
        return this.payload.totalAmount;
    }

    get entries() {
        return [...this.payload.entries];
    }

    get postedAt(): Date {
        return this.payload.postedAt;
    }

    get reference(): string | undefined {
        return this.payload.reference;
    }

    get metadata(): Record<string, any> | undefined {
        return this.payload.metadata ? { ...this.payload.metadata } : undefined;
    }
}