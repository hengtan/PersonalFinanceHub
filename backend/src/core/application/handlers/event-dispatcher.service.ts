// src/core/application/handlers/event-dispatcher.service.ts
import { BaseDomainEvent } from '@/core/domain/events/base-domain.event';
import { IEventHandler } from './base-event.handler';
import { logger } from '@/infrastructure/monitoring/logger.service';

export class EventDispatcher {
    private handlers: IEventHandler[] = [];

    register(handler: IEventHandler): void {
        this.handlers.push(handler);
        logger.info('Event handler registered', {
            handlerName: handler.constructor.name
        });
    }

    async dispatch(event: BaseDomainEvent): Promise<void> {
        const applicableHandlers = this.handlers.filter(handler => handler.canHandle(event));

        if (applicableHandlers.length === 0) {
            logger.warn('No handlers found for event', {
                eventType: event.eventType,
                eventId: event.eventId
            });
            return;
        }

        logger.info('Dispatching event to handlers', {
            eventType: event.eventType,
            eventId: event.eventId,
            handlerCount: applicableHandlers.length
        });

        // Execute handlers in parallel
        const promises = applicableHandlers.map(async (handler) => {
            try {
                await handler.handle(event);
                logger.debug('Event handler executed successfully', {
                    eventType: event.eventType,
                    eventId: event.eventId,
                    handlerName: handler.constructor.name
                });
            } catch (error) {
                logger.error('Event handler failed', error as Error, {
                    eventType: event.eventType,
                    eventId: event.eventId,
                    handlerName: handler.constructor.name
                });
                // Don't rethrow - we don't want one handler failure to break others
            }
        });

        await Promise.all(promises);
    }

    async dispatchBatch(events: BaseDomainEvent[]): Promise<void> {
        if (events.length === 0) {
            return;
        }

        logger.info('Dispatching event batch', {
            eventCount: events.length,
            eventTypes: events.map(e => e.eventType)
        });

        // Process events in parallel
        const promises = events.map(event => this.dispatch(event));
        await Promise.all(promises);
    }

    getRegisteredHandlers(): IEventHandler[] {
        return [...this.handlers];
    }

    clear(): void {
        this.handlers = [];
        logger.info('Event dispatcher cleared');
    }
}

// Singleton instance
export const eventDispatcher = new EventDispatcher();