import { Kafka, Producer, ProducerRecord } from 'kafkajs';
import { BaseDomainEvent } from '../../../core/domain/events/base-domain.event';
import { Logger } from '../../../shared/utils/logger.util';
import { MessagingException } from '../../../shared/exceptions/base.exception';
import { KafkaEvent, KAFKA_TOPICS } from './topics';
import { OutboxService } from '../../patterns/outbox.service';

export class KafkaProducerService {
    private readonly kafka: Kafka;
    private readonly producer: Producer;
    private isConnected: boolean = false;
    private readonly logger = Logger.createChildLogger('KafkaProducer');
    private readonly outboxService: OutboxService;

    constructor() {
        const brokers = process.env.KAFKA_BROKERS?.split(',') || ['localhost:9092'];
        
        this.kafka = new Kafka({
            clientId: 'personal-finance-hub-producer',
            brokers,
            retry: {
                initialRetryTime: 100,
                retries: 8
            }
        });

        this.producer = this.kafka.producer({
            maxInFlightRequests: 1,
            idempotent: true,
            transactionTimeout: 30000
        });

        this.outboxService = OutboxService.getInstance();
    }

    async connect(): Promise<void> {
        try {
            await this.producer.connect();
            this.isConnected = true;
            this.logger.info('Kafka producer connected successfully');
        } catch (error) {
            this.logger.error('Failed to connect Kafka producer', error);
            throw new MessagingException(`Erro ao conectar no Kafka: ${error.message}`);
        }
    }

    async disconnect(): Promise<void> {
        try {
            await this.producer.disconnect();
            this.isConnected = false;
            logger.info('Kafka producer disconnected');
        } catch (error) {
            logger.error('Error disconnecting Kafka producer', { error: error.message });
        }
    }

    async publishEvent(topic: string, event: BaseDomainEvent): Promise<void> {
        try {
            if (!this.isConnected) {
                await this.connect();
            }

            const message = {
                key: event.aggregateId,
                value: JSON.stringify(event.toJSON()),
                headers: {
                    eventType: event.eventType,
                    eventId: event.eventId,
                    eventVersion: event.eventVersion.toString(),
                    occurredOn: event.occurredOn.toISOString()
                }
            };

            const record: ProducerRecord = {
                topic,
                messages: [message]
            };

            await this.producer.send(record);

            logger.debug('Event published to Kafka', {
                topic,
                eventType: event.eventType,
                eventId: event.eventId,
                aggregateId: event.aggregateId
            });

        } catch (error) {
            logger.error('Error publishing event to Kafka', {
                topic,
                eventType: event.eventType,
                eventId: event.eventId,
                error: error.message
            });

            throw new MessagingException(`Erro ao publicar evento no Kafka: ${error.message}`);
        }
    }

    async publishEvents(topic: string, events: BaseDomainEvent[]): Promise<void> {
        try {
            if (!this.isConnected) {
                await this.connect();
            }

            const messages = events.map(event => ({
                key: event.aggregateId,
                value: JSON.stringify(event.toJSON()),
                headers: {
                    eventType: event.eventType,
                    eventId: event.eventId,
                    eventVersion: event.eventVersion.toString(),
                    occurredOn: event.occurredOn.toISOString()
                }
            }));

            const record: ProducerRecord = {
                topic,
                messages
            };

            await this.producer.send(record);

            logger.debug('Batch of events published to Kafka', {
                topic,
                eventCount: events.length,
                eventTypes: events.map(e => e.eventType)
            });

        } catch (error) {
            logger.error('Error publishing batch of events to Kafka', {
                topic,
                eventCount: events.length,
                error: error.message
            });

            throw new MessagingException(`Erro ao publicar eventos no Kafka: ${error.message}`);
        }
    }

    // Publish typed events with outbox pattern
    async publishKafkaEvent(topic: string, event: KafkaEvent): Promise<void> {
        try {
            // First add to outbox for reliability
            await this.outboxService.addEvent(
                event.userId || 'system',
                topic,
                topic,
                event,
                1
            );

            // Then try immediate publishing
            await this.publishEventData(topic, event);

        } catch (error) {
            this.logger.error('Error publishing Kafka event', error, { topic, event });
            throw new MessagingException(`Erro ao publicar evento tipado: ${error.message}`);
        }
    }

    // Direct publishing without outbox (for internal use)
    private async publishEventData(topic: string, data: any): Promise<void> {
        if (!this.isConnected) {
            await this.connect();
        }

        const message = {
            key: data.userId || data.entityId || 'default',
            value: JSON.stringify(data),
            headers: {
                eventType: topic,
                timestamp: data.timestamp || new Date().toISOString(),
                version: '1'
            }
        };

        const record: ProducerRecord = {
            topic,
            messages: [message]
        };

        await this.producer.send(record);
        
        this.logger.debug('Event published successfully', { topic, dataType: typeof data });
    }

    // Specific methods for common event patterns
    async publishTransactionEvent(eventType: 'created' | 'updated' | 'deleted', transactionData: any): Promise<void> {
        const topic = eventType === 'created' ? KAFKA_TOPICS.TRANSACTION_CREATED :
                     eventType === 'updated' ? KAFKA_TOPICS.TRANSACTION_UPDATED :
                     KAFKA_TOPICS.TRANSACTION_DELETED;

        const event = {
            transactionId: transactionData.id,
            userId: transactionData.userId,
            amount: transactionData.amount,
            categoryId: transactionData.categoryId,
            description: transactionData.description,
            date: transactionData.date,
            type: transactionData.type,
            accountId: transactionData.accountId,
            paymentMethod: transactionData.paymentMethod,
            tags: transactionData.tags,
            metadata: transactionData.metadata,
            timestamp: new Date().toISOString()
        };

        await this.publishKafkaEvent(topic, event);
    }

    async publishSyncEvent(entityType: string, entityId: string, userId: string, operation: 'create' | 'update' | 'delete', data: any): Promise<void> {
        const topic = KAFKA_TOPICS.SYNC_TRANSACTION_TO_MONGO; // Generic sync topic
        
        const event = {
            entityType,
            entityId,
            userId,
            operation,
            data,
            timestamp: new Date().toISOString(),
            version: 1
        };

        await this.publishKafkaEvent(topic, event);
    }

    async publishCacheInvalidationEvent(cacheType: string, userId: string, cacheKey?: string, reason?: string): Promise<void> {
        const event = {
            cacheType,
            userId,
            cacheKey,
            reason: reason || 'Data updated',
            timestamp: new Date().toISOString()
        };

        await this.publishKafkaEvent(KAFKA_TOPICS.CACHE_INVALIDATION, event);
    }

    async publishBudgetExceededEvent(budgetData: any): Promise<void> {
        const event = {
            budgetId: budgetData.id,
            userId: budgetData.userId,
            categoryId: budgetData.categoryId,
            budgetAmount: budgetData.amount,
            spentAmount: budgetData.spentAmount,
            excessAmount: budgetData.spentAmount - budgetData.amount,
            month: budgetData.month,
            year: budgetData.year,
            percentage: (budgetData.spentAmount / budgetData.amount) * 100,
            timestamp: new Date().toISOString()
        };

        await this.publishKafkaEvent(KAFKA_TOPICS.BUDGET_EXCEEDED, event);
    }

    // Health check method
    isHealthy(): boolean {
        return this.isConnected;
    }
}