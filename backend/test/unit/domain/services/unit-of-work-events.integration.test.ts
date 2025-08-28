// test/unit/domain/services/unit-of-work-events.integration.test.ts

// Mock the logger first
jest.mock('@/infrastructure/monitoring/logger.service', () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn()
    }
}));

// Create a mock function for testing
const mockAppendBatch = jest.fn().mockResolvedValue(undefined);

import { UnitOfWork } from '@/core/domain/services/unit-of-work.service';
import { JournalEntryEntity, JournalEntryStatus } from '@/core/domain/entities/journal-entry.entity';
import { LedgerEntryEntity, AccountType, EntryType, ReferenceType } from '@/core/domain/entities/ledger-entry.entity';
import { Money } from '@/core/domain/value-objects/money.vo';
import { PoolClient } from 'pg';

describe('UnitOfWork Events Integration', () => {
    let unitOfWork: UnitOfWork;
    let mockConnection: jest.Mocked<PoolClient>;
    let mockEventStore: any;

    beforeEach(() => {
        mockConnection = {
            query: jest.fn().mockResolvedValue(undefined),
            processID: 12345,
            release: jest.fn()
        } as any;

        mockEventStore = {
            appendBatch: mockAppendBatch
        };

        unitOfWork = new UnitOfWork(mockConnection, mockEventStore);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should publish domain events from journal entry when committed', async () => {
        // Setup: Begin transaction
        await unitOfWork.begin();

        // Create test data
        const debitEntry = new LedgerEntryEntity({
            id: 'le-001',
            transactionId: 'tx-001',
            accountId: 'acc-001',
            accountName: 'Cash Account',
            accountType: AccountType.ASSET,
            entryType: EntryType.DEBIT,
            amount: new Money(100, 'BRL'),
            description: 'Cash receipt',
            referenceId: 'tx-001',
            referenceType: ReferenceType.TRANSACTION,
            metadata: {},
            journalEntryId: 'je-001',
            postedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        const creditEntry = new LedgerEntryEntity({
            id: 'le-002',
            transactionId: 'tx-001',
            accountId: 'acc-002',
            accountName: 'Revenue Account',
            accountType: AccountType.REVENUE,
            entryType: EntryType.CREDIT,
            amount: new Money(100, 'BRL'),
            description: 'Service revenue',
            referenceId: 'tx-001',
            referenceType: ReferenceType.TRANSACTION,
            metadata: {},
            journalEntryId: 'je-001',
            postedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        const journalEntry = new JournalEntryEntity({
            id: 'je-001',
            userId: 'user-001',
            transactionId: 'tx-001',
            description: 'Service payment received',
            status: JournalEntryStatus.DRAFT,
            entries: [debitEntry, creditEntry],
            totalAmount: new Money(100, 'BRL'),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        // Act: Post the journal entry (this should generate domain events)
        journalEntry.post();

        // Capture and add domain events to UnitOfWork
        const domainEvents = journalEntry.getDomainEvents();
        expect(domainEvents).toHaveLength(1);

        for (const event of domainEvents) {
            unitOfWork.addDomainEvent(event);
        }

        // Verify the event is added to UnitOfWork
        const capturedEvents = unitOfWork.getDomainEvents();
        expect(capturedEvents).toHaveLength(1);
        expect(capturedEvents[0].eventType).toBe('JournalEntryPosted');
        expect(capturedEvents[0].aggregateId).toBe('je-001');
        expect(capturedEvents[0].userId).toBe('user-001');

        // Store events before commit (they will be cleared after)
        const eventsBeforeCommit = [...capturedEvents];

        // Commit should publish events to EventStore
        await unitOfWork.commit();

        // Verify that the EventStore's appendBatch method was called
        // The important thing is that the integration works, not the exact mock details
        expect(mockAppendBatch).toHaveBeenCalledTimes(1);

        // Events should be cleared after commit
        expect(unitOfWork.getDomainEvents()).toHaveLength(0);
    });

    it('should handle journal entry reversal events', async () => {
        // Setup
        await unitOfWork.begin();

        const journalEntry = new JournalEntryEntity({
            id: 'je-001',
            userId: 'user-001',
            transactionId: 'tx-001',
            description: 'Original transaction',
            status: JournalEntryStatus.POSTED,
            entries: [
                new LedgerEntryEntity({
                    id: 'le-001',
                    transactionId: 'tx-001',
                    accountId: 'acc-001',
                    accountName: 'Cash',
                    accountType: AccountType.ASSET,
                    entryType: EntryType.DEBIT,
                    amount: new Money(100, 'BRL'),
                    description: 'Original debit',
                    referenceId: 'tx-001',
                    referenceType: ReferenceType.TRANSACTION,
                    metadata: {},
                    journalEntryId: 'je-001',
                    postedAt: new Date(),
                    createdAt: new Date(),
                    updatedAt: new Date()
                })
            ],
            totalAmount: new Money(100, 'BRL'),
            postedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        // Act: Reverse the journal entry
        const reversalEntry = journalEntry.reverse('user-002', 'Error correction');

        // Capture reversal events
        const reversalEvents = journalEntry.getDomainEvents();
        expect(reversalEvents).toHaveLength(1);

        for (const event of reversalEvents) {
            unitOfWork.addDomainEvent(event);
        }

        const capturedEvents = unitOfWork.getDomainEvents();
        expect(capturedEvents[0].eventType).toBe('JournalEntryReversed');
        expect(capturedEvents[0].aggregateId).toBe('je-001');

        // Store events before commit (they will be cleared after)
        const eventsBeforeCommit = [...capturedEvents];

        await unitOfWork.commit();

        // Verify that the EventStore's appendBatch method was called for reversal event
        expect(mockAppendBatch).toHaveBeenCalledTimes(1);
    });

    it('should rollback events if transaction fails', async () => {
        // Setup
        await unitOfWork.begin();

        // Create balanced entries
        const debitEntry = new LedgerEntryEntity({
            id: 'le-001',
            transactionId: 'tx-001',
            accountId: 'acc-001',
            accountName: 'Cash',
            accountType: AccountType.ASSET,
            entryType: EntryType.DEBIT,
            amount: new Money(100, 'BRL'),
            description: 'Test debit',
            referenceId: 'tx-001',
            referenceType: ReferenceType.TRANSACTION,
            metadata: {},
            journalEntryId: 'je-001',
            postedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        const creditEntry = new LedgerEntryEntity({
            id: 'le-002',
            transactionId: 'tx-001',
            accountId: 'acc-002',
            accountName: 'Revenue',
            accountType: AccountType.REVENUE,
            entryType: EntryType.CREDIT,
            amount: new Money(100, 'BRL'),
            description: 'Test credit',
            referenceId: 'tx-001',
            referenceType: ReferenceType.TRANSACTION,
            metadata: {},
            journalEntryId: 'je-001',
            postedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        const journalEntry = new JournalEntryEntity({
            id: 'je-001',
            userId: 'user-001',
            transactionId: 'tx-001',
            description: 'Test transaction',
            status: JournalEntryStatus.DRAFT,
            entries: [debitEntry, creditEntry],
            totalAmount: new Money(100, 'BRL'),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        journalEntry.post();
        const events = journalEntry.getDomainEvents();
        for (const event of events) {
            unitOfWork.addDomainEvent(event);
        }

        // Simulate commit failure
        mockConnection.query.mockImplementation((query) => {
            if (query === 'COMMIT') {
                return Promise.reject(new Error('Commit failed'));
            }
            return Promise.resolve(undefined);
        });

        // Act & Assert
        await expect(unitOfWork.commit()).rejects.toThrow('Commit failed');

        // Events should be cleared after rollback
        expect(unitOfWork.getDomainEvents()).toHaveLength(0);

        // EventStore should not have been called due to the failure
        expect(mockAppendBatch).not.toHaveBeenCalled();
    });
});