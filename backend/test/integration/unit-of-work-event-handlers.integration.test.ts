// test/integration/unit-of-work-event-handlers.integration.test.ts
import { UnitOfWork } from '@/core/domain/services/unit-of-work.service';
import { JournalEntryEntity, JournalEntryStatus } from '@/core/domain/entities/journal-entry.entity';
import { LedgerEntryEntity, AccountType, EntryType, ReferenceType } from '@/core/domain/entities/ledger-entry.entity';
import { Money } from '@/core/domain/value-objects/money.vo';
import { EventDispatcher } from '@/core/application/handlers/event-dispatcher.service';
import { JournalEntryPostedHandler } from '@/core/application/handlers/journal-entry-posted.handler';
import { JournalEntryReversedHandler } from '@/core/application/handlers/journal-entry-reversed.handler';
import { PoolClient } from 'pg';

// Mock the logger
jest.mock('@/infrastructure/monitoring/logger.service', () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn()
    }
}));

// Mock EventStore
const mockAppendBatch = jest.fn().mockResolvedValue(undefined);
const mockEventStore = {
    appendBatch: mockAppendBatch
};

describe('UnitOfWork Event Handlers Integration', () => {
    let unitOfWork: UnitOfWork;
    let eventDispatcher: EventDispatcher;
    let mockConnection: jest.Mocked<PoolClient>;
    let journalEntryPostedHandler: JournalEntryPostedHandler;
    let journalEntryReversedHandler: JournalEntryReversedHandler;

    beforeEach(() => {
        // Setup mock connection
        mockConnection = {
            query: jest.fn().mockResolvedValue(undefined),
            processID: 12345,
            release: jest.fn()
        } as any;

        // Setup fresh event dispatcher for each test
        eventDispatcher = new EventDispatcher();

        // Setup UnitOfWork with mocked EventStore and custom EventDispatcher
        unitOfWork = new UnitOfWork(mockConnection, mockEventStore, eventDispatcher);
        
        // Setup event handlers
        journalEntryPostedHandler = new JournalEntryPostedHandler();
        journalEntryReversedHandler = new JournalEntryReversedHandler();
        
        // Mock handler methods
        jest.spyOn(journalEntryPostedHandler, 'handle').mockResolvedValue();
        jest.spyOn(journalEntryReversedHandler, 'handle').mockResolvedValue();
        
        // Register handlers
        eventDispatcher.register(journalEntryPostedHandler);
        eventDispatcher.register(journalEntryReversedHandler);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should dispatch events to handlers when journal entry is posted and committed', async () => {
        // Setup: Begin transaction
        await unitOfWork.begin();

        // Create balanced ledger entries
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

        // Act: Post the journal entry and add events to UnitOfWork
        journalEntry.post();
        const domainEvents = journalEntry.getDomainEvents();
        for (const event of domainEvents) {
            unitOfWork.addDomainEvent(event);
        }

        // Commit should persist events and dispatch to handlers
        await unitOfWork.commit();

        // Assert: Verify that EventStore was called (events were persisted)
        expect(mockAppendBatch).toHaveBeenCalledTimes(1);

        // Assert: Verify that the event handler was called
        expect(journalEntryPostedHandler.handle).toHaveBeenCalledTimes(1);
        
        // Get the event that was passed to the handler
        const calledEvent = journalEntryPostedHandler.handle.mock.calls[0][0];
        expect(calledEvent.eventType).toBe('JournalEntryPosted');
        expect(calledEvent.aggregateId).toBe('je-001');
        expect(calledEvent.userId).toBe('user-001');

        // Assert: Events should be cleared after commit
        expect(unitOfWork.getDomainEvents()).toHaveLength(0);
    });

    it('should dispatch reversal events to handlers', async () => {
        // Setup: Begin transaction
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
        journalEntry.reverse('user-002', 'Error correction');

        // Add reversal events to UnitOfWork
        const reversalEvents = journalEntry.getDomainEvents();
        for (const event of reversalEvents) {
            unitOfWork.addDomainEvent(event);
        }

        // Commit should persist events and dispatch to handlers
        await unitOfWork.commit();

        // Assert: Verify events were persisted
        expect(mockAppendBatch).toHaveBeenCalledTimes(1);

        // Assert: Verify that the reversal handler was called
        expect(journalEntryReversedHandler.handle).toHaveBeenCalledTimes(1);
        
        // Get the event that was passed to the handler
        const calledEvent = journalEntryReversedHandler.handle.mock.calls[0][0];
        expect(calledEvent.eventType).toBe('JournalEntryReversed');
        expect(calledEvent.aggregateId).toBe('je-001');
        expect(calledEvent.reversedBy).toBe('user-002');
        expect(calledEvent.reason).toBe('Error correction');
    });

    it('should not dispatch events if transaction fails', async () => {
        // Setup: Mock database commit failure
        mockConnection.query.mockImplementation((query) => {
            if (query === 'COMMIT') {
                return Promise.reject(new Error('Database commit failed'));
            }
            return Promise.resolve(undefined);
        });

        await unitOfWork.begin();

        const journalEntry = new JournalEntryEntity({
            id: 'je-001',
            userId: 'user-001',
            transactionId: 'tx-001',
            description: 'Test transaction',
            status: JournalEntryStatus.DRAFT,
            entries: [
                new LedgerEntryEntity({
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
                }),
                new LedgerEntryEntity({
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
                })
            ],
            totalAmount: new Money(100, 'BRL'),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        journalEntry.post();
        const events = journalEntry.getDomainEvents();
        for (const event of events) {
            unitOfWork.addDomainEvent(event);
        }

        // Act & Assert: Should fail and rollback
        await expect(unitOfWork.commit()).rejects.toThrow('Database commit failed');

        // Assert: Events should not have been persisted due to rollback
        expect(mockAppendBatch).not.toHaveBeenCalled();

        // Assert: Handlers should not have been called due to rollback
        expect(journalEntryPostedHandler.handle).not.toHaveBeenCalled();

        // Assert: Events should be cleared after rollback
        expect(unitOfWork.getDomainEvents()).toHaveLength(0);
    });

    it('should complete transaction even if event handler fails', async () => {
        // Setup: Make handler fail
        jest.spyOn(journalEntryPostedHandler, 'handle').mockRejectedValue(new Error('Handler processing failed'));

        await unitOfWork.begin();

        const journalEntry = new JournalEntryEntity({
            id: 'je-001',
            userId: 'user-001',
            transactionId: 'tx-001',
            description: 'Test transaction',
            status: JournalEntryStatus.DRAFT,
            entries: [
                new LedgerEntryEntity({
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
                }),
                new LedgerEntryEntity({
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
                })
            ],
            totalAmount: new Money(100, 'BRL'),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        journalEntry.post();
        const events = journalEntry.getDomainEvents();
        for (const event of events) {
            unitOfWork.addDomainEvent(event);
        }

        // Act: Should complete despite handler failure
        await unitOfWork.commit();

        // Assert: Events were still persisted despite handler failure
        expect(mockAppendBatch).toHaveBeenCalledTimes(1);

        // Assert: Handler was called (even though it failed)
        expect(journalEntryPostedHandler.handle).toHaveBeenCalledTimes(1);

        // Assert: Transaction still completed successfully
        expect(unitOfWork.getDomainEvents()).toHaveLength(0);
    });
});