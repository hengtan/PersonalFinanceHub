import { Logger } from '../../shared/utils/logger.util';
import { InfrastructureException } from '../../shared/exceptions/base.exception';
import { EVENT_TYPES } from '../../shared/constants/event-types';

const logger = Logger.createChildLogger('OutboxService');

export interface OutboxEvent {
    id: string;
    aggregateId: string;
    aggregateType: string;
    eventType: string;
    eventData: any;
    version: number;
    createdAt: Date;
    processedAt?: Date;
    status: 'PENDING' | 'PROCESSED' | 'FAILED';
    retryCount: number;
    errorMessage?: string;
}

export class OutboxService {
    private static instance: OutboxService;
    private events: Map<string, OutboxEvent> = new Map();
    private isProcessing = false;
    private processingInterval: NodeJS.Timeout | null = null;

    private constructor() {}

    public static getInstance(): OutboxService {
        if (!OutboxService.instance) {
            OutboxService.instance = new OutboxService();
        }
        return OutboxService.instance;
    }

    public async addEvent(
        aggregateId: string,
        aggregateType: string,
        eventType: string,
        eventData: any,
        version: number = 1
    ): Promise<void> {
        try {
            const eventId = this.generateEventId();
            const outboxEvent: OutboxEvent = {
                id: eventId,
                aggregateId,
                aggregateType,
                eventType,
                eventData,
                version,
                createdAt: new Date(),
                status: 'PENDING',
                retryCount: 0
            };

            // In a real implementation, this would be saved to database within the same transaction
            this.events.set(eventId, outboxEvent);
            
            logger.info(`Event added to outbox: ${eventType}`, {
                eventId,
                aggregateId,
                aggregateType
            });

            // Start processing if not already running
            if (!this.isProcessing) {
                this.startProcessing();
            }
        } catch (error) {
            logger.error('Failed to add event to outbox', error);
            throw new InfrastructureException('Failed to add event to outbox', 'OUTBOX_ERROR', 500, error);
        }
    }

    public async startProcessing(): Promise<void> {
        if (this.isProcessing) {
            return;
        }

        this.isProcessing = true;
        logger.info('Starting outbox event processing');

        this.processingInterval = setInterval(async () => {
            await this.processEvents();
        }, 5000); // Process every 5 seconds
    }

    public stopProcessing(): void {
        this.isProcessing = false;
        if (this.processingInterval) {
            clearInterval(this.processingInterval);
            this.processingInterval = null;
        }
        logger.info('Stopped outbox event processing');
    }

    private async processEvents(): Promise<void> {
        const pendingEvents = Array.from(this.events.values())
            .filter(event => event.status === 'PENDING' || (event.status === 'FAILED' && event.retryCount < 3))
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

        if (pendingEvents.length === 0) {
            return;
        }

        logger.debug(`Processing ${pendingEvents.length} outbox events`);

        for (const event of pendingEvents) {
            try {
                await this.publishEvent(event);
                
                event.status = 'PROCESSED';
                event.processedAt = new Date();
                this.events.set(event.id, event);

                logger.info(`Event processed successfully: ${event.eventType}`, {
                    eventId: event.id,
                    aggregateId: event.aggregateId
                });
            } catch (error) {
                event.retryCount++;
                event.errorMessage = error instanceof Error ? error.message : 'Unknown error';

                if (event.retryCount >= 3) {
                    event.status = 'FAILED';
                    logger.error(`Event failed after max retries: ${event.eventType}`, {
                        eventId: event.id,
                        aggregateId: event.aggregateId,
                        retryCount: event.retryCount,
                        error
                    });
                } else {
                    logger.warn(`Event processing failed, will retry: ${event.eventType}`, {
                        eventId: event.id,
                        aggregateId: event.aggregateId,
                        retryCount: event.retryCount,
                        error
                    });
                }

                this.events.set(event.id, event);
            }
        }
    }

    private async publishEvent(event: OutboxEvent): Promise<void> {
        // This would integrate with your message broker (Kafka, RabbitMQ, etc.)
        // For now, simulate publishing
        logger.debug(`Publishing event: ${event.eventType}`, {
            eventId: event.id,
            aggregateId: event.aggregateId,
            eventData: event.eventData
        });

        // Simulate potential failure
        if (Math.random() < 0.1) { // 10% failure rate for testing
            throw new Error('Simulated publish failure');
        }

        // In real implementation:
        // await this.messagePublisher.publish(event.eventType, event.eventData);
    }

    public async getEvents(status?: OutboxEvent['status']): Promise<OutboxEvent[]> {
        const events = Array.from(this.events.values());
        
        if (status) {
            return events.filter(event => event.status === status);
        }
        
        return events;
    }

    public async getEventById(eventId: string): Promise<OutboxEvent | null> {
        return this.events.get(eventId) || null;
    }

    public async markEventAsProcessed(eventId: string): Promise<void> {
        const event = this.events.get(eventId);
        if (event) {
            event.status = 'PROCESSED';
            event.processedAt = new Date();
            this.events.set(eventId, event);
        }
    }

    public async markEventAsFailed(eventId: string, errorMessage: string): Promise<void> {
        const event = this.events.get(eventId);
        if (event) {
            event.status = 'FAILED';
            event.errorMessage = errorMessage;
            this.events.set(eventId, event);
        }
    }

    public async cleanup(olderThanDays: number = 7): Promise<void> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

        const eventsToDelete = Array.from(this.events.entries())
            .filter(([_, event]) => 
                event.status === 'PROCESSED' && 
                event.processedAt && 
                event.processedAt < cutoffDate
            )
            .map(([id]) => id);

        eventsToDelete.forEach(id => this.events.delete(id));

        logger.info(`Cleaned up ${eventsToDelete.length} processed events older than ${olderThanDays} days`);
    }

    private generateEventId(): string {
        return `outbox_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }

    public getStats(): {
        total: number;
        pending: number;
        processed: number;
        failed: number;
        isProcessing: boolean;
    } {
        const events = Array.from(this.events.values());
        
        return {
            total: events.length,
            pending: events.filter(e => e.status === 'PENDING').length,
            processed: events.filter(e => e.status === 'PROCESSED').length,
            failed: events.filter(e => e.status === 'FAILED').length,
            isProcessing: this.isProcessing
        };
    }
}