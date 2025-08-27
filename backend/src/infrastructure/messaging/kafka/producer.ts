import { Kafka, Producer, ProducerRecord } from 'kafkajs';
import { BaseDomainEvent } from '../../../core/domain/events/base-domain.event';
import { logger } from '../../../infrastructure/monitoring/logger.service';
import { MessagingException } from '../../../shared/exceptions/infrastructure.exception';
import { config } from '../../../config/environment';

export class KafkaProducerService {
    private readonly kafka: Kafka;
    private readonly producer: Producer;
    private isConnected: boolean = false;

    constructor() {
        this.kafka = new Kafka({
            clientId: 'personal-finance-hub-producer',
            brokers: config.get('KAFKA_BROKERS'),
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
    }

    async connect(): Promise<void> {
        try {
            await this.producer.connect();
            this.isConnected = true;
            logger.info('Kafka producer connected successfully');
        } catch (error) {
            logger.error('Failed to connect Kafka producer', { error: error.message });
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
}