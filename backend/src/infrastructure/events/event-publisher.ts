// backend/src/infrastructure/events/event-publisher.ts
import { BaseDomainEvent } from '../../core/domain/events/base-domain.event';
import { EventStore } from './event-store';
import { logger } from '../monitoring/logger.service';

export interface EventHandler {
    handle(event: BaseDomainEvent): Promise<void>;
    eventType: string;
}

export class EventPublisher {
    private handlers: Map<string, EventHandler[]> = new Map();
    
    constructor(
        private readonly eventStore: EventStore
    ) {}

    // Register event handlers
    subscribe(eventType: string, handler: EventHandler): void {
        if (!this.handlers.has(eventType)) {
            this.handlers.set(eventType, []);
        }
        
        this.handlers.get(eventType)!.push(handler);
        
        logger.info('Event handler registered', {
            eventType,
            handlerName: handler.constructor.name
        });
    }

    // Publish a single event
    async publish(event: BaseDomainEvent): Promise<void> {
        try {
            // First, store the event
            await this.eventStore.append(event);

            // Then, notify handlers
            await this.notifyHandlers(event);

            logger.info('Event published successfully', {
                eventId: event.eventId,
                eventType: (event as any).eventType
            });

        } catch (error) {
            logger.error('Failed to publish event', error as Error, {
                eventId: event.eventId,
                eventType: (event as any).eventType
            });
            throw error;
        }
    }

    // Publish multiple events
    async publishBatch(events: BaseDomainEvent[]): Promise<void> {
        if (events.length === 0) return;

        try {
            // First, store all events
            await this.eventStore.appendBatch(events);

            // Then, notify handlers for each event
            for (const event of events) {
                await this.notifyHandlers(event);
            }

            logger.info('Event batch published successfully', {
                eventCount: events.length
            });

        } catch (error) {
            logger.error('Failed to publish event batch', error as Error, {
                eventCount: events.length
            });
            throw error;
        }
    }

    private async notifyHandlers(event: BaseDomainEvent): Promise<void> {
        const eventType = (event as any).eventType;
        const handlers = this.handlers.get(eventType) || [];

        if (handlers.length === 0) {
            logger.debug('No handlers registered for event type', { eventType });
            return;
        }

        // Execute handlers concurrently
        const handlerPromises = handlers.map(async (handler) => {
            try {
                await handler.handle(event);
                logger.debug('Event handler executed successfully', {
                    eventType,
                    handlerName: handler.constructor.name
                });
            } catch (error) {
                logger.error('Event handler failed', error as Error, {
                    eventType,
                    handlerName: handler.constructor.name,
                    eventId: event.eventId
                });
                // Don't throw - we don't want one handler failure to affect others
            }
        });

        await Promise.allSettled(handlerPromises);
    }

    // Get registered handlers for debugging
    getHandlers(): Map<string, EventHandler[]> {
        return new Map(this.handlers);
    }

    // Clear all handlers (mainly for testing)
    clearHandlers(): void {
        this.handlers.clear();
    }
}

// Event Handler implementations

// Email notification handler
export class EmailNotificationHandler implements EventHandler {
    eventType = 'TransactionCreated';

    async handle(event: BaseDomainEvent): Promise<void> {
        // Mock email notification
        logger.info('Sending email notification', {
            eventType: this.eventType,
            eventId: event.eventId
        });
        
        // In a real implementation, this would send an email
        // await emailService.send(...)
    }
}

// Audit log handler
export class AuditLogHandler implements EventHandler {
    eventType = '*'; // Handle all events

    async handle(event: BaseDomainEvent): Promise<void> {
        logger.info('Audit log entry created', {
            eventId: event.eventId,
            eventType: (event as any).eventType,
            occurredOn: event.occurredOn
        });
        
        // In a real implementation, this might write to a separate audit table
        // or send to an external audit system
    }
}

// Budget monitoring handler
export class BudgetMonitoringHandler implements EventHandler {
    eventType = 'TransactionCreated';

    async handle(event: BaseDomainEvent): Promise<void> {
        const transactionEvent = event as any;
        
        if (transactionEvent.data?.transaction?.type === 'EXPENSE') {
            logger.info('Monitoring budget impact', {
                eventId: event.eventId,
                transactionId: transactionEvent.data.transaction.id,
                amount: transactionEvent.data.transaction.amount
            });
            
            // In a real implementation, this would check budget limits
            // and potentially emit BudgetExceededEvent
        }
    }
}

// Analytics handler
export class AnalyticsHandler implements EventHandler {
    eventType = '*'; // Handle all events

    async handle(event: BaseDomainEvent): Promise<void> {
        logger.info('Recording analytics event', {
            eventType: (event as any).eventType,
            eventId: event.eventId
        });
        
        // In a real implementation, this would send data to analytics service
        // await analyticsService.track(...)
    }
}

// Fraud detection handler
export class FraudDetectionHandler implements EventHandler {
    eventType = 'TransactionCreated';

    async handle(event: BaseDomainEvent): Promise<void> {
        const transactionEvent = event as any;
        const transaction = transactionEvent.data?.transaction;
        
        if (transaction?.amount > 10000) {
            logger.warn('High-value transaction detected', {
                eventId: event.eventId,
                transactionId: transaction.id,
                amount: transaction.amount,
                userId: transactionEvent.userId
            });
            
            // In a real implementation, this might emit SuspiciousTransactionEvent
            // or flag the transaction for review
        }
    }
}

// Cache invalidation handler
export class CacheInvalidationHandler implements EventHandler {
    eventType = '*'; // Handle all events

    async handle(event: BaseDomainEvent): Promise<void> {
        const eventData = event as any;
        
        logger.info('Invalidating cache', {
            eventType: eventData.eventType,
            aggregateId: eventData.aggregateId
        });
        
        // In a real implementation, this would invalidate relevant cache entries
        // await cacheService.invalidate(...)
    }
}