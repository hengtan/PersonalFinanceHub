import { Kafka, Consumer, ConsumerRunConfig, EachMessagePayload } from 'kafkajs';
import { Logger } from '../../../shared/utils/logger.util';
import { MessagingException } from '../../../shared/exceptions/base.exception';
import { KAFKA_TOPICS, KAFKA_CONSUMER_GROUPS, KafkaEvent, SyncToMongoEvent, CacheInvalidationEvent } from './topics';
import { InboxService } from '../../patterns/inbox.service';

export interface MessageHandler {
    handle(payload: EachMessagePayload): Promise<void>;
}

export class KafkaConsumerService {
    private readonly kafka: Kafka;
    private readonly consumer: Consumer;
    private readonly handlers: Map<string, MessageHandler[]> = new Map();
    private isRunning: boolean = false;
    private readonly logger = Logger.createChildLogger('KafkaConsumer');
    private readonly inboxService: InboxService;

    constructor(groupId: string) {
        const brokers = process.env.KAFKA_BROKERS?.split(',') || ['localhost:9092'];
        
        this.kafka = new Kafka({
            clientId: `personal-finance-hub-consumer-${groupId}`,
            brokers,
            retry: {
                initialRetryTime: 100,
                retries: 8
            }
        });

        this.consumer = this.kafka.consumer({
            groupId,
            sessionTimeout: 30000,
            rebalanceTimeout: 60000,
            heartbeatInterval: 3000,
            maxBytesPerPartition: 1048576,
            minBytes: 1,
            maxBytes: 10485760,
            maxWaitTimeInMs: 5000
        });

        this.inboxService = InboxService.getInstance();
    }

    registerHandler(topic: string, handler: MessageHandler): void {
        const existingHandlers = this.handlers.get(topic) || [];
        existingHandlers.push(handler);
        this.handlers.set(topic, existingHandlers);

        this.this.logger.debug('Message handler registered', {
            topic,
            handlerName: handler.constructor.name,
            totalHandlers: existingHandlers.length
        });
    }

    async connect(): Promise<void> {
        try {
            await this.consumer.connect();
            this.this.logger.info('Kafka consumer connected successfully');
        } catch (error) {
            this.logger.error('Failed to connect Kafka consumer', { error: error.message });
            throw new MessagingException(`Erro ao conectar consumer do Kafka: ${error.message}`);
        }
    }

    async subscribe(topics: string[]): Promise<void> {
        try {
            for (const topic of topics) {
                await this.consumer.subscribe({ topic, fromBeginning: false });
                this.logger.info('Subscribed to Kafka topic', { topic });
            }
        } catch (error) {
            this.logger.error('Error subscribing to topics', { topics, error: error.message });
            throw new MessagingException(`Erro ao se inscrever nos tópicos: ${error.message}`);
        }
    }

    async start(): Promise<void> {
        try {
            if (this.isRunning) {
                this.logger.warn('Kafka consumer is already running');
                return;
            }

            const config: ConsumerRunConfig = {
                eachMessage: async (payload: EachMessagePayload) => {
                    await this.processMessage(payload);
                }
            };

            await this.consumer.run(config);
            this.isRunning = true;

            this.logger.info('Kafka consumer started successfully');
        } catch (error) {
            this.logger.error('Error starting Kafka consumer', { error: error.message });
            throw new MessagingException(`Erro ao iniciar consumer do Kafka: ${error.message}`);
        }
    }

    async stop(): Promise<void> {
        try {
            if (!this.isRunning) {
                this.logger.warn('Kafka consumer is not running');
                return;
            }

            await this.consumer.stop();
            this.isRunning = false;

            this.logger.info('Kafka consumer stopped');
        } catch (error) {
            this.logger.error('Error stopping Kafka consumer', { error: error.message });
        }
    }

    async disconnect(): Promise<void> {
        try {
            await this.stop();
            await this.consumer.disconnect();
            this.logger.info('Kafka consumer disconnected');
        } catch (error) {
            this.logger.error('Error disconnecting Kafka consumer', { error: error.message });
        }
    }

    private async processMessage(payload: EachMessagePayload): Promise<void> {
        const { topic, partition, message } = payload;

        try {
            const messageValue = message.value?.toString();
            const messageKey = message.key?.toString();
            const headers = this.extractHeaders(message.headers);

            this.logger.debug('Processing Kafka message', {
                topic,
                partition,
                offset: message.offset,
                key: messageKey,
                eventType: headers.eventType,
                eventId: headers.eventId
            });

            const handlers = this.handlers.get(topic) || [];

            if (handlers.length === 0) {
                this.logger.warn('No handlers found for topic', { topic });
                return;
            }

            // Process message with all handlers
            const promises = handlers.map(async (handler) => {
                try {
                    await handler.handle(payload);

                    this.logger.debug('Message processed successfully by handler', {
                        topic,
                        handlerName: handler.constructor.name,
                        eventId: headers.eventId
                    });
                } catch (error) {
                    this.logger.error('Error processing message with handler', {
                        topic,
                        handlerName: handler.constructor.name,
                        eventId: headers.eventId,
                        error: error.message,
                        stack: error.stack
                    });

                    // Don't throw here to allow other handlers to process
                    // Could implement dead letter queue or retry mechanism
                }
            });

            await Promise.allSettled(promises);

        } catch (error) {
            this.logger.error('Error processing Kafka message', {
                topic,
                partition,
                offset: message.offset,
                error: error.message,
                stack: error.stack
            });

            // Could implement retry logic or dead letter queue here
            throw error;
        }
    }

    private extractHeaders(headers: any): Record<string, string> {
        const extractedHeaders: Record<string, string> = {};

        if (headers) {
            for (const [key, value] of Object.entries(headers)) {
                if (Buffer.isBuffer(value)) {
                    extractedHeaders[key] = value.toString();
                } else {
                    extractedHeaders[key] = String(value);
                }
            }
        }

        return extractedHeaders;
    }
}