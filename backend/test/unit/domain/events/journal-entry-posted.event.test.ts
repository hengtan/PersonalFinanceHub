// test/unit/domain/events/journal-entry-posted.event.test.ts
import { JournalEntryPostedEvent } from '@/core/domain/events/journal-entry-posted.event';

describe('JournalEntryPostedEvent', () => {
    const mockPayload = {
        userId: 'user-001',
        transactionId: 'tx-001',
        description: 'Test journal entry',
        totalAmount: {
            amount: 100,
            currency: 'BRL'
        },
        entries: [
            {
                accountId: 'acc-001',
                accountType: 'ASSET',
                entryType: 'DEBIT' as const,
                amount: {
                    amount: 100,
                    currency: 'BRL'
                },
                description: 'Debit entry'
            },
            {
                accountId: 'acc-002',
                accountType: 'REVENUE',
                entryType: 'CREDIT' as const,
                amount: {
                    amount: 100,
                    currency: 'BRL'
                },
                description: 'Credit entry'
            }
        ],
        postedAt: new Date('2024-01-01T10:00:00Z'),
        reference: 'REF-001',
        metadata: { source: 'test' }
    };

    it('should create event with correct properties', () => {
        const event = new JournalEntryPostedEvent('je-001', mockPayload);

        expect(event.eventType).toBe('JournalEntryPosted');
        expect(event.aggregateType).toBe('JournalEntry');
        expect(event.aggregateId).toBe('je-001');
        expect(event.userId).toBe('user-001');
    });

    it('should return correct payload', () => {
        const event = new JournalEntryPostedEvent('je-001', mockPayload);
        const payload = event.getPayload();

        expect(payload.userId).toBe('user-001');
        expect(payload.transactionId).toBe('tx-001');
        expect(payload.description).toBe('Test journal entry');
        expect(payload.totalAmount.amount).toBe(100);
        expect(payload.entries).toHaveLength(2);
        expect(payload.postedAt).toBeInstanceOf(Date);
    });

    it('should serialize to JSON correctly', () => {
        const event = new JournalEntryPostedEvent('je-001', mockPayload);
        const json = event.toJSON();

        expect(json.eventId).toBeDefined();
        expect(json.eventType).toBe('JournalEntryPosted');
        expect(json.aggregateId).toBe('je-001');
        expect(json.aggregateType).toBe('JournalEntry');
        expect(json.userId).toBe('user-001');
        expect(json.data).toEqual(event.getPayload());
    });

    it('should have unique event ID', () => {
        const event1 = new JournalEntryPostedEvent('je-001', mockPayload);
        const event2 = new JournalEntryPostedEvent('je-001', mockPayload);

        expect(event1.eventId).not.toBe(event2.eventId);
    });

    it('should have getter methods', () => {
        const event = new JournalEntryPostedEvent('je-001', mockPayload);

        expect(event.transactionId).toBe('tx-001');
        expect(event.description).toBe('Test journal entry');
        expect(event.totalAmount.amount).toBe(100);
        expect(event.entries).toHaveLength(2);
        expect(event.reference).toBe('REF-001');
        expect(event.metadata).toEqual({ source: 'test' });
    });
});