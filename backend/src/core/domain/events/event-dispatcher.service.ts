// backend/src/core/services/event-dispatcher.service.ts
import { BaseDomainEvent } from '../domain/events/base-domain.event';
import { logger } from '../../shared/utils/logger.util';

export interface EventHandler<T extends BaseDomainEvent = BaseDomainEvent> {
    handle(event: T): Promise<void>;
}

export interface EventBus {
    publish(event: BaseDomainEvent): Promise<void>;
    publishBatch(events: BaseDomainEvent[]): Promise<void>;
}

export class EventDispatcherService {
    private readonly handlers: Map<string, EventHandler[]> = new Map();
    private readonly eventBus?: EventBus;

    constructor(eventBus?: EventBus) {
        this.eventBus = eventBus;
    }

    /**
     * Registra um handler para um tipo de evento
     */
    register<T extends BaseDomainEvent>(
        eventType: string,
        handler: EventHandler<T>
    ): void {
        const existingHandlers = this.handlers.get(eventType) || [];
        existingHandlers.push(handler as EventHandler);
        this.handlers.set(eventType, existingHandlers);

        logger.debug('Event handler registered', {
            eventType,
            handlerName: handler.constructor.name
        });
    }

    /**
     * Remove um handler de um tipo de evento
     */
    unregister(eventType: string, handler: EventHandler): void {
        const existingHandlers = this.handlers.get(eventType) || [];
        const index = existingHandlers.indexOf(handler);

        if (index > -1) {
            existingHandlers.splice(index, 1);
            this.handlers.set(eventType, existingHandlers);

            logger.debug('Event handler unregistered', {
                eventType,
                handlerName: handler.constructor.name
            });
        }
    }

    /**
     * Despacha um evento para todos os handlers registrados
     */
    async dispatch(event: BaseDomainEvent): Promise<void> {
        try {
            logger.info('Dispatching domain event', {
                eventType: event.eventType,
                eventId: event.eventId,
                aggregateId: event.aggregateId
            });

            // Execute local handlers
            await this.executeLocalHandlers(event);

            // Publish to event bus if available
            if (this.eventBus) {
                await this.eventBus.publish(event);
            }

            logger.debug('Domain event dispatched successfully', {
                eventType: event.eventType,
                eventId: event.eventId
            });

        } catch (error) {
            logger.error('Error dispatching domain event', {
                eventType: event.eventType,
                eventId: event.eventId,
                error: error.message,
                stack: error.stack
            });

            // Re-throw the error so calling code can handle it
            throw error;
        }
    }

    /**
     * Despacha múltiplos eventos em lote
     */
    async dispatchBatch(events: BaseDomainEvent[]): Promise<void> {
        try {
            logger.info('Dispatching batch of domain events', {
                eventCount: events.length,
                eventTypes: events.map(e => e.eventType)
            });

            // Execute local handlers for all events
            for (const event of events) {
                await this.executeLocalHandlers(event);
            }

            // Publish batch to event bus if available
            if (this.eventBus) {
                await this.eventBus.publishBatch(events);
            }

            logger.debug('Batch of domain events dispatched successfully', {
                eventCount: events.length
            });

        } catch (error) {
            logger.error('Error dispatching batch of domain events', {
                eventCount: events.length,
                error: error.message,
                stack: error.stack
            });

            throw error;
        }
    }

    /**
     * Executa handlers locais para um evento
     */
    private async executeLocalHandlers(event: BaseDomainEvent): Promise<void> {
        const handlers = this.handlers.get(event.eventType) || [];

        if (handlers.length === 0) {
            logger.warn('No handlers registered for event type', {
                eventType: event.eventType,
                eventId: event.eventId
            });
            return;
        }

        // Execute all handlers concurrently
        const promises = handlers.map(async (handler) => {
            try {
                await handler.handle(event);

                logger.debug('Event handler executed successfully', {
                    eventType: event.eventType,
                    eventId: event.eventId,
                    handlerName: handler.constructor.name
                });
            } catch (error) {
                logger.error('Error executing event handler', {
                    eventType: event.eventType,
                    eventId: event.eventId,
                    handlerName: handler.constructor.name,
                    error: error.message,
                    stack: error.stack
                });

                // Don't re-throw here to allow other handlers to execute
                // But we could implement a dead letter queue or retry mechanism
            }
        });

        await Promise.allSettled(promises);
    }

    /**
     * Lista todos os tipos de eventos registrados
     */
    getRegisteredEventTypes(): string[] {
        return Array.from(this.handlers.keys());
    }

    /**
     * Conta quantos handlers estão registrados para cada tipo de evento
     */
    getHandlerCounts(): Record<string, number> {
        const counts: Record<string, number> = {};

        for (const [eventType, handlers] of this.handlers.entries()) {
            counts[eventType] = handlers.length;
        }

        return counts;
    }

    /**
     * Remove todos os handlers (útil para testes)
     */
    clear(): void {
        this.handlers.clear();
        logger.debug('All event handlers cleared');
    }
}