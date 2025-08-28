// test/unit/application/handlers/event-dispatcher.test.ts
import { EventDispatcher } from '@/core/application/handlers/event-dispatcher.service';
import { JournalEntryPostedHandler } from '@/core/application/handlers/journal-entry-posted.handler';
import { JournalEntryPostedEvent } from '@/core/domain/events/journal-entry-posted.event';

// Mock the logger
jest.mock('@/infrastructure/monitoring/logger.service', () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn()
    }
}));

describe('EventDispatcher', () => {
    let dispatcher: EventDispatcher;
    let handler: JournalEntryPostedHandler;

    beforeEach(() => {
        dispatcher = new EventDispatcher();
        handler = new JournalEntryPostedHandler();
        
        // Mock the handler methods
        jest.spyOn(handler, 'handle').mockResolvedValue();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should register event handlers', () => {
        dispatcher.register(handler);
        
        const registeredHandlers = dispatcher.getRegisteredHandlers();
        expect(registeredHandlers).toHaveLength(1);
        expect(registeredHandlers[0]).toBe(handler);
    });

    it('should dispatch events to appropriate handlers', async () => {
        // Setup
        dispatcher.register(handler);
        
        const event = new JournalEntryPostedEvent('je-001', {
            userId: 'user-001',
            transactionId: 'tx-001',
            description: 'Test transaction',
            totalAmount: { amount: 100, currency: 'BRL' },
            entries: [
                {
                    accountId: 'acc-001',
                    accountType: 'ASSET',
                    entryType: 'DEBIT',
                    amount: { amount: 100, currency: 'BRL' },
                    description: 'Test debit'
                }
            ],
            postedAt: new Date(),
            reference: 'REF-001',
            metadata: { source: 'test' }
        });

        // Act
        await dispatcher.dispatch(event);

        // Assert
        expect(handler.handle).toHaveBeenCalledTimes(1);
        expect(handler.handle).toHaveBeenCalledWith(event);
    });

    it('should dispatch batch events to handlers', async () => {
        // Setup
        dispatcher.register(handler);
        
        const events = [
            new JournalEntryPostedEvent('je-001', {
                userId: 'user-001',
                transactionId: 'tx-001',
                description: 'Test transaction 1',
                totalAmount: { amount: 100, currency: 'BRL' },
                entries: [],
                postedAt: new Date()
            }),
            new JournalEntryPostedEvent('je-002', {
                userId: 'user-001',
                transactionId: 'tx-002',
                description: 'Test transaction 2',
                totalAmount: { amount: 200, currency: 'BRL' },
                entries: [],
                postedAt: new Date()
            })
        ];

        // Act
        await dispatcher.dispatchBatch(events);

        // Assert
        expect(handler.handle).toHaveBeenCalledTimes(2);
        expect(handler.handle).toHaveBeenCalledWith(events[0]);
        expect(handler.handle).toHaveBeenCalledWith(events[1]);
    });

    it('should not fail if handler throws error', async () => {
        // Setup
        dispatcher.register(handler);
        jest.spyOn(handler, 'handle').mockRejectedValue(new Error('Handler failed'));
        
        const event = new JournalEntryPostedEvent('je-001', {
            userId: 'user-001',
            transactionId: 'tx-001',
            description: 'Test transaction',
            totalAmount: { amount: 100, currency: 'BRL' },
            entries: [],
            postedAt: new Date()
        });

        // Act & Assert - should not throw
        await expect(dispatcher.dispatch(event)).resolves.toBeUndefined();
        expect(handler.handle).toHaveBeenCalledTimes(1);
    });

    it('should clear all handlers', () => {
        dispatcher.register(handler);
        expect(dispatcher.getRegisteredHandlers()).toHaveLength(1);
        
        dispatcher.clear();
        expect(dispatcher.getRegisteredHandlers()).toHaveLength(0);
    });
});