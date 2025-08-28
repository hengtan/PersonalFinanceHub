// src/core/domain/events/journal-entry-reversed.event.ts
import { BaseDomainEvent } from './base-domain.event';

export interface JournalEntryReversedPayload {
    userId: string;
    originalJournalEntryId: string;
    reversingJournalEntryId: string;
    reversedBy: string;
    reason?: string;
    reversedAt: Date;
    originalAmount: {
        amount: number;
        currency: string;
    };
    metadata?: Record<string, any>;
}

export class JournalEntryReversedEvent extends BaseDomainEvent {
    constructor(
        journalEntryId: string,
        private readonly payload: JournalEntryReversedPayload
    ) {
        super(journalEntryId, 'JournalEntryReversed', 'JournalEntry');
        this.setUserId(payload.userId);
    }

    getPayload(): JournalEntryReversedPayload {
        return {
            ...this.payload,
            reversedAt: new Date(this.payload.reversedAt)
        };
    }

    get originalJournalEntryId(): string {
        return this.payload.originalJournalEntryId;
    }

    get reversingJournalEntryId(): string {
        return this.payload.reversingJournalEntryId;
    }

    get reversedBy(): string {
        return this.payload.reversedBy;
    }

    get reason(): string | undefined {
        return this.payload.reason;
    }

    get reversedAt(): Date {
        return this.payload.reversedAt;
    }

    get originalAmount() {
        return this.payload.originalAmount;
    }

    get metadata(): Record<string, any> | undefined {
        return this.payload.metadata ? { ...this.payload.metadata } : undefined;
    }
}