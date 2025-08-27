// backend/src/infrastructure/events/event-publisher.service.ts
import { EventStore } from './event-store';
import { 
    EventPublisher, 
    EmailNotificationHandler,
    AuditLogHandler,
    BudgetMonitoringHandler,
    AnalyticsHandler,
    FraudDetectionHandler,
    CacheInvalidationHandler
} from './event-publisher';
import { logger } from '../monitoring/logger.service';

// Singleton Event Publisher Service
export class EventPublisherService {
    private static instance: EventPublisherService;
    private eventPublisher: EventPublisher;
    private eventStore: EventStore;

    private constructor() {
        this.eventStore = new EventStore();
        this.eventPublisher = new EventPublisher(this.eventStore);
        this.setupHandlers();
    }

    public static getInstance(): EventPublisherService {
        if (!EventPublisherService.instance) {
            EventPublisherService.instance = new EventPublisherService();
        }
        return EventPublisherService.instance;
    }

    public getEventPublisher(): EventPublisher {
        return this.eventPublisher;
    }

    public getEventStore(): EventStore {
        return this.eventStore;
    }

    private setupHandlers(): void {
        try {
            // Register all event handlers
            
            // Audit handler - handles all events
            const auditHandler = new AuditLogHandler();
            this.eventPublisher.subscribe('TransactionCreated', auditHandler);
            this.eventPublisher.subscribe('TransactionUpdated', auditHandler);
            this.eventPublisher.subscribe('TransactionDeleted', auditHandler);
            this.eventPublisher.subscribe('TransactionPaid', auditHandler);
            this.eventPublisher.subscribe('TransactionCancelled', auditHandler);
            this.eventPublisher.subscribe('BudgetExceeded', auditHandler);
            this.eventPublisher.subscribe('SuspiciousTransaction', auditHandler);

            // Email notification handler
            const emailHandler = new EmailNotificationHandler();
            this.eventPublisher.subscribe('TransactionCreated', emailHandler);

            // Budget monitoring handler
            const budgetHandler = new BudgetMonitoringHandler();
            this.eventPublisher.subscribe('TransactionCreated', budgetHandler);

            // Analytics handler - handles all events
            const analyticsHandler = new AnalyticsHandler();
            this.eventPublisher.subscribe('TransactionCreated', analyticsHandler);
            this.eventPublisher.subscribe('TransactionUpdated', analyticsHandler);
            this.eventPublisher.subscribe('TransactionDeleted', analyticsHandler);
            this.eventPublisher.subscribe('TransactionPaid', analyticsHandler);
            this.eventPublisher.subscribe('TransactionCancelled', analyticsHandler);

            // Fraud detection handler
            const fraudHandler = new FraudDetectionHandler();
            this.eventPublisher.subscribe('TransactionCreated', fraudHandler);

            // Cache invalidation handler - handles all events
            const cacheHandler = new CacheInvalidationHandler();
            this.eventPublisher.subscribe('TransactionCreated', cacheHandler);
            this.eventPublisher.subscribe('TransactionUpdated', cacheHandler);
            this.eventPublisher.subscribe('TransactionDeleted', cacheHandler);
            this.eventPublisher.subscribe('TransactionPaid', cacheHandler);
            this.eventPublisher.subscribe('TransactionCancelled', cacheHandler);

            logger.info('Event handlers registered successfully', {
                handlerCount: this.getTotalHandlerCount()
            });

        } catch (error) {
            logger.error('Failed to setup event handlers', error as Error);
            throw error;
        }
    }

    private getTotalHandlerCount(): number {
        const handlers = this.eventPublisher.getHandlers();
        let total = 0;
        handlers.forEach(handlerList => {
            total += handlerList.length;
        });
        return total;
    }

    // Health check method
    public async healthCheck(): Promise<{ status: string; details: any }> {
        try {
            const handlers = this.eventPublisher.getHandlers();
            const handlerCount = this.getTotalHandlerCount();
            
            return {
                status: 'healthy',
                details: {
                    handlerCount,
                    eventTypes: Array.from(handlers.keys()),
                    eventStoreConnected: true // TODO: Add actual event store health check
                }
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                details: {
                    error: (error as Error).message
                }
            };
        }
    }

    // Method to replay events (useful for testing or recovery)
    public async replayEvents(aggregateId: string): Promise<void> {
        try {
            const events = await this.eventStore.getEventsByAggregateId(aggregateId);
            
            logger.info('Replaying events', {
                aggregateId,
                eventCount: events.length
            });

            for (const storedEvent of events) {
                // Create a mock event object for handlers
                const mockEvent = {
                    eventId: storedEvent.eventId,
                    occurredOn: storedEvent.occurredOn,
                    version: storedEvent.version,
                    eventType: storedEvent.eventType,
                    data: storedEvent.eventData,
                    userId: storedEvent.userId,
                    toJSON: () => ({
                        eventId: storedEvent.eventId,
                        eventType: storedEvent.eventType,
                        aggregateId: storedEvent.aggregateId,
                        aggregateType: storedEvent.aggregateType,
                        version: storedEvent.version,
                        occurredOn: storedEvent.occurredOn,
                        userId: storedEvent.userId,
                        data: storedEvent.eventData
                    })
                } as any;

                // Notify handlers without storing the event again
                const handlers = this.eventPublisher.getHandlers().get(storedEvent.eventType) || [];
                for (const handler of handlers) {
                    try {
                        await handler.handle(mockEvent);
                    } catch (error) {
                        logger.error('Handler failed during replay', error as Error, {
                            eventId: storedEvent.eventId,
                            handlerName: handler.constructor.name
                        });
                    }
                }
            }

            logger.info('Event replay completed', { aggregateId });

        } catch (error) {
            logger.error('Event replay failed', error as Error, { aggregateId });
            throw error;
        }
    }
}

// Export singleton instance
export const eventPublisherService = EventPublisherService.getInstance();