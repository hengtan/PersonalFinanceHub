// backend/src/__tests__/integration/event-sourcing.test.ts
import { EventStore } from '../../infrastructure/events/event-store';
import { EventPublisher } from '../../infrastructure/events/event-publisher';
import { TransactionCreatedEvent, TransactionUpdatedEvent } from '../../core/domain/events/transaction-events';
import { TransactionEntity, TransactionType, PaymentMethod } from '../../core/domain/entities/transaction.entity';
import { Money } from '../../core/domain/value-objects/money.vo';

describe('Event Sourcing Integration Tests', () => {
    let eventStore: EventStore;
    let eventPublisher: EventPublisher;
    
    beforeAll(() => {
        eventStore = new EventStore();
        eventPublisher = new EventPublisher(eventStore);
    });

    describe('EventStore', () => {
        it('should store and retrieve events', async () => {
            // Create a mock transaction entity
            const transaction = new TransactionEntity({
                id: 'test-transaction-1',
                userId: 'user-123',
                accountId: 'account-456',
                categoryId: 'category-789',
                description: 'Test transaction for event sourcing',
                amount: new Money(100.50, 'BRL'),
                type: TransactionType.EXPENSE,
                paymentMethod: PaymentMethod.CREDIT_CARD,
                transactionDate: new Date(),
                createdAt: new Date(),
                updatedAt: new Date()
            });

            // Create and store event
            const event = new TransactionCreatedEvent(
                transaction,
                'user-123',
                { source: 'test', reason: 'integration-test' }
            );

            await eventStore.append(event);

            // Retrieve events
            const storedEvents = await eventStore.getEventsByAggregateId('test-transaction-1');
            
            expect(storedEvents).toHaveLength(1);
            expect(storedEvents[0].eventType).toBe('TransactionCreated');
            expect(storedEvents[0].aggregateId).toBe('test-transaction-1');
            expect(storedEvents[0].userId).toBe('user-123');
            expect(storedEvents[0].eventData.transaction.description).toBe('Test transaction for event sourcing');
        });

        it('should retrieve events by user ID', async () => {
            const userId = 'user-789';
            const transaction = new TransactionEntity({
                id: 'test-transaction-2',
                userId,
                accountId: 'account-456',
                categoryId: 'category-789',
                description: 'User activity test',
                amount: new Money(200.00, 'BRL'),
                type: TransactionType.INCOME,
                paymentMethod: PaymentMethod.PIX,
                transactionDate: new Date(),
                createdAt: new Date(),
                updatedAt: new Date()
            });

            const event = new TransactionCreatedEvent(transaction, userId);
            await eventStore.append(event);

            // Retrieve user events
            const userEvents = await eventStore.getEventsByUserId(userId, 10, 0);
            
            expect(userEvents.length).toBeGreaterThanOrEqual(1);
            expect(userEvents[0].userId).toBe(userId);
        });

        it('should retrieve events by type', async () => {
            const events = await eventStore.getEventsByType('TransactionCreated', 5);
            
            expect(Array.isArray(events)).toBe(true);
            events.forEach(event => {
                expect(event.eventType).toBe('TransactionCreated');
            });
        });

        it('should get user activity log', async () => {
            const userId = 'user-activity-test';
            const fromDate = new Date();
            fromDate.setHours(0, 0, 0, 0);
            
            const toDate = new Date();
            toDate.setHours(23, 59, 59, 999);

            const activityLog = await eventStore.getUserActivityLog(userId, fromDate, toDate, 10);
            
            expect(Array.isArray(activityLog)).toBe(true);
            // May be empty if no activity for this test user, which is fine
        });
    });

    describe('EventPublisher', () => {
        it('should publish events and notify handlers', async () => {
            let handlerCalled = false;
            let receivedEvent: any = null;

            // Create a test handler
            const testHandler = {
                eventType: 'TransactionCreated',
                handle: async (event: any) => {
                    handlerCalled = true;
                    receivedEvent = event;
                }
            };

            // Subscribe handler
            eventPublisher.subscribe('TransactionCreated', testHandler);

            // Create and publish event
            const transaction = new TransactionEntity({
                id: 'test-transaction-3',
                userId: 'user-publisher-test',
                accountId: 'account-456',
                categoryId: 'category-789',
                description: 'Publisher test transaction',
                amount: new Money(75.25, 'BRL'),
                type: TransactionType.EXPENSE,
                paymentMethod: PaymentMethod.DEBIT_CARD,
                transactionDate: new Date(),
                createdAt: new Date(),
                updatedAt: new Date()
            });

            const event = new TransactionCreatedEvent(transaction, 'user-publisher-test');
            await eventPublisher.publish(event);

            // Verify handler was called
            expect(handlerCalled).toBe(true);
            expect(receivedEvent).toBeDefined();
            expect(receivedEvent.eventId).toBe(event.eventId);

            // Verify event was stored
            const storedEvents = await eventStore.getEventsByAggregateId('test-transaction-3');
            expect(storedEvents).toHaveLength(1);
        });

        it('should handle batch event publishing', async () => {
            const events: TransactionCreatedEvent[] = [];
            
            // Create multiple events
            for (let i = 0; i < 3; i++) {
                const transaction = new TransactionEntity({
                    id: `batch-test-${i}`,
                    userId: 'user-batch-test',
                    accountId: 'account-456',
                    categoryId: 'category-789',
                    description: `Batch test transaction ${i}`,
                    amount: new Money(50 + i * 10, 'BRL'),
                    type: TransactionType.EXPENSE,
                    paymentMethod: PaymentMethod.CREDIT_CARD,
                    transactionDate: new Date(),
                    createdAt: new Date(),
                    updatedAt: new Date()
                });

                events.push(new TransactionCreatedEvent(transaction, 'user-batch-test'));
            }

            // Publish batch
            await eventPublisher.publishBatch(events);

            // Verify all events were stored
            const userEvents = await eventStore.getEventsByUserId('user-batch-test');
            const batchEvents = userEvents.filter(e => e.aggregateId.startsWith('batch-test-'));
            
            expect(batchEvents.length).toBeGreaterThanOrEqual(3);
        });
    });

    describe('Event Filtering and Querying', () => {
        it('should filter events by date range', async () => {
            const today = new Date();
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            // Get events from yesterday to tomorrow
            const events = await eventStore.getEvents({
                fromDate: yesterday,
                toDate: tomorrow,
                limit: 100
            });

            expect(Array.isArray(events)).toBe(true);
            
            // All events should be within the date range
            events.forEach(event => {
                expect(event.occurredOn.getTime()).toBeGreaterThanOrEqual(yesterday.getTime());
                expect(event.occurredOn.getTime()).toBeLessThanOrEqual(tomorrow.getTime());
            });
        });

        it('should filter events with complex criteria', async () => {
            const userId = 'complex-filter-test';
            const transaction = new TransactionEntity({
                id: 'complex-test-1',
                userId,
                accountId: 'account-456',
                categoryId: 'category-789',
                description: 'Complex filter test',
                amount: new Money(300.00, 'BRL'),
                type: TransactionType.INCOME,
                paymentMethod: PaymentMethod.BANK_TRANSFER,
                transactionDate: new Date(),
                createdAt: new Date(),
                updatedAt: new Date()
            });

            const event = new TransactionCreatedEvent(transaction, userId);
            await eventStore.append(event);

            // Filter by multiple criteria
            const filteredEvents = await eventStore.getEvents({
                userId,
                eventType: 'TransactionCreated',
                aggregateType: 'Transaction',
                limit: 10
            });

            expect(filteredEvents.length).toBeGreaterThanOrEqual(1);
            filteredEvents.forEach(event => {
                expect(event.userId).toBe(userId);
                expect(event.eventType).toBe('TransactionCreated');
                expect(event.aggregateType).toBe('Transaction');
            });
        });
    });

    describe('Event Versioning', () => {
        it('should handle event versioning correctly', async () => {
            const transactionId = 'versioned-transaction';
            const userId = 'user-versioning-test';
            
            // Create initial transaction
            const initialTransaction = new TransactionEntity({
                id: transactionId,
                userId,
                accountId: 'account-456',
                categoryId: 'category-789',
                description: 'Initial description',
                amount: new Money(100.00, 'BRL'),
                type: TransactionType.EXPENSE,
                paymentMethod: PaymentMethod.CREDIT_CARD,
                transactionDate: new Date(),
                createdAt: new Date(),
                updatedAt: new Date()
            });

            const createEvent = new TransactionCreatedEvent(initialTransaction, userId);
            await eventStore.append(createEvent);

            // Update transaction
            const updatedTransaction = new TransactionEntity({
                ...initialTransaction.toJSON(),
                description: 'Updated description',
                amount: new Money(150.00, 'BRL'),
                updatedAt: new Date()
            });

            const updateEvent = new TransactionUpdatedEvent(
                transactionId,
                initialTransaction,
                updatedTransaction,
                userId,
                ['description', 'amount']
            );
            await eventStore.append(updateEvent);

            // Get all events for this aggregate
            const aggregateEvents = await eventStore.getEventsByAggregateId(transactionId);
            
            expect(aggregateEvents).toHaveLength(2);
            expect(aggregateEvents[0].version).toBe(1);
            expect(aggregateEvents[1].version).toBe(1); // Each event has its own version
            expect(aggregateEvents[0].eventType).toBe('TransactionCreated');
            expect(aggregateEvents[1].eventType).toBe('TransactionUpdated');
        });
    });

    describe('Audit Trail', () => {
        it('should provide complete audit trail for an aggregate', async () => {
            const transactionId = 'audit-trail-test';
            const userId = 'user-audit-test';

            const transaction = new TransactionEntity({
                id: transactionId,
                userId,
                accountId: 'account-456',
                categoryId: 'category-789',
                description: 'Audit trail test',
                amount: new Money(500.00, 'BRL'),
                type: TransactionType.TRANSFER,
                paymentMethod: PaymentMethod.PIX,
                transactionDate: new Date(),
                createdAt: new Date(),
                updatedAt: new Date()
            });

            const event = new TransactionCreatedEvent(transaction, userId, {
                source: 'audit-test',
                userAgent: 'test-agent'
            });

            await eventStore.append(event);

            // Get audit trail
            const auditTrail = await eventStore.getAuditLog(transactionId);
            
            expect(auditTrail).toHaveLength(1);
            expect(auditTrail[0].eventType).toBe('TransactionCreated');
            expect(auditTrail[0].metadata.source).toBe('audit-test');
            expect(auditTrail[0].metadata.userAgent).toBe('test-agent');
        });
    });
});