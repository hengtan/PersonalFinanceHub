// backend/src/infrastructure/events/event-bus.ts
import { EventEmitter } from 'events';
import { Kafka, Producer, Consumer, KafkaMessage } from 'kafkajs';
import { logger } from '../monitoring/logger.service';
import { MetricsService } from '../monitoring/metrics.service';

/**
 * Interface base para eventos do domínio
 */
export interface DomainEvent {
    id: string;
    type: string;
    aggregateId: string;
    aggregateType: string;
    version: number;
    timestamp: string;
    userId?: string;
    correlationId?: string;
    causationId?: string;
    metadata?: Record<string, any>;
    data: Record<string, any>;
}

/**
 * Interface para handler de eventos
 */
export interface EventHandler<T extends DomainEvent = DomainEvent> {
    handle(event: T): Promise<void> | void;
}

/**
 * Interface para configuração de subscription
 */
interface SubscriptionConfig {
    handler: EventHandler;
    options?: {
        retry?: boolean;
        maxRetries?: number;
        deadLetterQueue?: boolean;
        priority?: 'high' | 'normal' | 'low';
    };
}

/**
 * Event Bus implementation com suporte a Kafka e EventEmitter local
 */
class EventBusService extends EventEmitter {
    private kafka?: Kafka;
    private producer?: Producer;
    private consumers: Map<string, Consumer> = new Map();
    private subscriptions: Map<string, SubscriptionConfig[]> = new Map();
    private isInitialized = false;
    private useKafka = false;

    constructor() {
        super();
        this.setMaxListeners(100); // Aumenta limite de listeners
    }

    /**
     * Inicializa o Event Bus
     */
    async initialize(): Promise<void> {
        try {
            // Verifica se deve usar Kafka
            this.useKafka = process.env.USE_KAFKA === 'true' && !!process.env.KAFKA_BROKERS;

            if (this.useKafka) {
                await this.initializeKafka();
            } else {
                logger.info('Event Bus initialized with local EventEmitter only');
            }

            this.isInitialized = true;
            logger.info('✅ Event Bus initialized successfully', {
                useKafka: this.useKafka,
                subscriptions: this.subscriptions.size,
            });

        } catch (error) {
            logger.error('❌ Failed to initialize Event Bus', {
                error: error instanceof Error ? error.message : String(error),
                useKafka: this.useKafka,
            });
            throw error;
        }
    }

    /**
     * Inicializa conexão com Kafka
     */
    private async initializeKafka(): Promise<void> {
        const brokers = process.env.KAFKA_BROKERS?.split(',') || [];

        this.kafka = new Kafka({
            clientId: 'personal-finance-hub',
            brokers,
            connectionTimeout: 10000,
            requestTimeout: 30000,
            retry: {
                initialRetryTime: 100,
                retries: 8,
                maxRetryTime: 30000,
                factor: 2,
                multiplier: 2,
                restartOnFailure: async (error) => {
                    logger.error('Kafka restart on failure', { error: error.message });
                    return true;
                },
            },
            logLevel: process.env.NODE_ENV === 'production' ? 1 : 2, // ERROR or INFO
        });

        // Cria producer
        this.producer = this.kafka.producer({
            maxInFlightRequests: 1,
            idempotent: true,
            transactionTimeout: 30000,
            retry: {
                retries: 5,
                initialRetryTime: 100,
            },
        });

        await this.producer.connect();

        logger.info('✅ Kafka producer connected', {
            brokers: brokers.length,
        });
    }

    /**
     * Emite um evento
     */
    async emit(eventType: string, data: any, options?: {
        aggregateId?: string;
        aggregateType?: string;
        version?: number;
        userId?: string;
        correlationId?: string;
        causationId?: string;
        metadata?: Record<string, any>;
    }): Promise<boolean> {
        const startTime = Date.now();

        try {
            const event: DomainEvent = {
                id: this.generateEventId(),
                type: eventType,
                aggregateId: options?.aggregateId || 'system',
                aggregateType: options?.aggregateType || 'system',
                version: options?.version || 1,
                timestamp: new Date().toISOString(),
                userId: options?.userId,
                correlationId: options?.correlationId,
                causationId: options?.causationId,
                metadata: options?.metadata,
                data,
            };

            // Emite localmente (síncrono)
            const localResult = super.emit(eventType, event);

            // Emite via Kafka (assíncrono) se configurado
            if (this.useKafka && this.producer) {
                await this.emitToKafka(event);
            }

            // Métricas
            const duration = Date.now() - startTime;
            MetricsService.recordHistogram('event_emit_duration_ms', duration, {
                event_type: eventType,
                transport: this.useKafka ? 'kafka' : 'local',
            });

            MetricsService.incrementCounter('events_emitted_total', {
                event_type: eventType,
                transport: this.useKafka ? 'kafka' : 'local',
                status: 'success',
            });

            logger.debug('Event emitted', {
                eventType,
                eventId: event.id,
                aggregateId: event.aggregateId,
                correlationId: event.correlationId,
                duration,
                kafka: this.useKafka,
            });

            return localResult;

        } catch (error) {
            const duration = Date.now() - startTime;

            MetricsService.incrementCounter('events_emitted_total', {
                event_type: eventType,
                transport: this.useKafka ? 'kafka' : 'local',
                status: 'error',
            });

            logger.error('Failed to emit event', {
                eventType,
                error: error instanceof Error ? error.message : String(error),
                duration,
            });

            throw error;
        }
    }

    /**
     * Emite evento via Kafka
     */
    private async emitToKafka(event: DomainEvent): Promise<void> {
        if (!this.producer) {
            throw new Error('Kafka producer not initialized');
        }

        const topic = this.getTopicName(event.type);
        const message: KafkaMessage = {
            key: event.aggregateId,
            value: JSON.stringify(event),
            timestamp: event.timestamp,
            headers: {
                eventType: event.type,
                aggregateType: event.aggregateType,
                version: String(event.version),
                correlationId: event.correlationId || '',
                userId: event.userId || '',
            },
        };

        await this.producer.send({
            topic,
            messages: [message],
            acks: -1, // Aguarda confirmação de todos os replicas
        });
    }

    /**
     * Registra handler para um evento
     */
    on(eventType: string, handler: EventHandler | ((event: DomainEvent) => Promise<void> | void)): () => void {
        // Wrapper para handlers que não implementam a interface
        const wrappedHandler = typeof handler === 'function'
            ? { handle: handler }
            : handler;

        // Registra handler local
        const localHandler = async (event: DomainEvent) => {
            const startTime = Date.now();

            try {
                await wrappedHandler.handle(event);

                const duration = Date.now() - startTime;
                MetricsService.recordHistogram('event_handle_duration_ms', duration, {
                    event_type: eventType,
                    handler: handler.constructor.name,
                });

                MetricsService.incrementCounter('events_handled_total', {
                    event_type: eventType,
                    handler: handler.constructor.name,
                    status: 'success',
                });

            } catch (error) {
                const duration = Date.now() - startTime;

                MetricsService.incrementCounter('events_handled_total', {
                    event_type: eventType,
                    handler: handler.constructor.name,
                    status: 'error',
                });

                logger.error('Event handler failed', {
                    eventType,
                    eventId: event.id,
                    handler: handler.constructor.name,
                    error: error instanceof Error ? error.message : String(error),
                    duration,
                });

                // Re-throw para permitir retry policies
                throw error;
            }
        };

        super.on(eventType, localHandler);

        // Registra subscription para Kafka se necessário
        if (this.useKafka) {
            const subscriptions = this.subscriptions.get(eventType) || [];
            subscriptions.push({ handler: wrappedHandler });
            this.subscriptions.set(eventType, subscriptions);
        }

        logger.debug('Event handler registered', {
            eventType,
            handler: handler.constructor.name,
            kafka: this.useKafka,
        });

        // Retorna função de unsubscribe
        return () => {
            super.removeListener(eventType, localHandler);

            if (this.useKafka) {
                const subscriptions = this.subscriptions.get(eventType) || [];
                const index = subscriptions.findIndex(sub => sub.handler === wrappedHandler);
                if (index !== -1) {
                    subscriptions.splice(index, 1);
                    if (subscriptions.length === 0) {
                        this.subscriptions.delete(eventType);
                    } else {
                        this.subscriptions.set(eventType, subscriptions);
                    }
                }
            }
        };
    }

    /**
     * Registra handler uma única vez
     */
    once(eventType: string, handler: EventHandler | ((event: DomainEvent) => Promise<void> | void)): void {
        const wrappedHandler = typeof handler === 'function'
            ? { handle: handler }
            : handler;

        const onceHandler = async (event: DomainEvent) => {
            try {
                await wrappedHandler.handle(event);
            } catch (error) {
                logger.error('One-time event handler failed', {
                    eventType,
                    eventId: event.id,
                    error: error instanceof Error ? error.message : String(error),
                });
                throw error;
            }
        };

        super.once(eventType, onceHandler);
    }

    /**
     * Inicia consumo de eventos do Kafka
     */
    async startKafkaConsumers(): Promise<void> {
        if (!this.useKafka || !this.kafka) return;

        for (const [eventType, subscriptions] of this.subscriptions) {
            if (subscriptions.length === 0) continue;

            const consumer = this.kafka.consumer({
                groupId: `personal-finance-hub-${eventType}`,
                sessionTimeout: 30000,
                heartbeatInterval: 3000,
                maxBytesPerPartition: 1048576, // 1MB
                retry: {
                    retries: 5,
                    initialRetryTime: 100,
                },
            });

            await consumer.connect();

            const topic = this.getTopicName(eventType);
            await consumer.subscribe({
                topics: [topic],
                fromBeginning: false
            });

            await consumer.run({
                eachMessage: async ({ message, partition, topic }) => {
                    await this.handleKafkaMessage(eventType, message, subscriptions);
                },
            });

            this.consumers.set(eventType, consumer);

            logger.info('Kafka consumer started', {
                eventType,
                topic,
                subscriptions: subscriptions.length,
            });
        }
    }

    /**
     * Processa mensagem do Kafka
     */
    private async handleKafkaMessage(
        eventType: string,
        message: KafkaMessage,
        subscriptions: SubscriptionConfig[]
    ): Promise<void> {
        if (!message.value) return;

        try {
            const event: DomainEvent = JSON.parse(message.value.toString());

            // Processa cada subscription
            for (const subscription of subscriptions) {
                try {
                    await this.handleWithRetry(subscription, event);
                } catch (error) {
                    logger.error('Kafka message handler failed', {
                        eventType,
                        eventId: event.id,
                        handler: subscription.handler.constructor.name,
                        error: error instanceof Error ? error.message : String(error),
                    });
                }
            }

        } catch (error) {
            logger.error('Failed to parse Kafka message', {
                eventType,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    /**
     * Handler com retry logic
     */
    private async handleWithRetry(
        subscription: SubscriptionConfig,
        event: DomainEvent
    ): Promise<void> {
        const maxRetries = subscription.options?.maxRetries || 3;
        let attempts = 0;

        while (attempts <= maxRetries) {
            try {
                await subscription.handler.handle(event);
                return; // Sucesso
            } catch (error) {
                attempts++;

                if (attempts > maxRetries) {
                    if (subscription.options?.deadLetterQueue) {
                        await this.sendToDeadLetterQueue(event, subscription, error);
                    }
                    throw error;
                }

                // Exponential backoff
                const delay = Math.min(1000 * Math.pow(2, attempts - 1), 30000);
                await this.sleep(delay);

                logger.warn('Retrying event handler', {
                    eventType: event.type,
                    eventId: event.id,
                    attempt: attempts,
                    maxRetries,
                    delay,
                });
            }
        }
    }

    /**
     * Envia para Dead Letter Queue
     */
    private async sendToDeadLetterQueue(
        event: DomainEvent,
        subscription: SubscriptionConfig,
        error: any
    ): Promise<void> {
        const dlqEvent = {
            ...event,
            id: this.generateEventId(),
            type: `${event.type}.failed`,
            metadata: {
                ...event.metadata,
                originalEventId: event.id,
                failedHandler: subscription.handler.constructor.name,
                error: error instanceof Error ? error.message : String(error),
                failedAt: new Date().toISOString(),
            },
        };

        await this.emit(`${event.type}.failed`, dlqEvent.data, {
            aggregateId: dlqEvent.aggregateId,
            aggregateType: dlqEvent.aggregateType,
            correlationId: dlqEvent.correlationId,
            metadata: dlqEvent.metadata,
        });

        logger.error('Event sent to Dead Letter Queue', {
            originalEventId: event.id,
            dlqEventId: dlqEvent.id,
            handler: subscription.handler.constructor.name,
        });
    }

    /**
     * Utilitário para sleep
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Gera nome do tópico Kafka
     */
    private getTopicName(eventType: string): string {
        return `pfh.${eventType.replace(/\./g, '-')}`;
    }

    /**
     * Gera ID único para evento
     */
    private generateEventId(): string {
        return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Remove todos os listeners
     */
    removeAllListeners(eventType?: string): this {
        super.removeAllListeners(eventType);

        if (eventType) {
            this.subscriptions.delete(eventType);
        } else {
            this.subscriptions.clear();
        }

        return this;
    }

    /**
     * Obtém estatísticas do Event Bus
     */
    getStats(): {
        initialized: boolean;
        useKafka: boolean;
        localListeners: number;
        kafkaSubscriptions: number;
        kafkaConsumers: number;
    } {
        return {
            initialized: this.isInitialized,
            useKafka: this.useKafka,
            localListeners: this.listenerCount('*'),
            kafkaSubscriptions: Array.from(this.subscriptions.values()).reduce((sum, subs) => sum + subs.length, 0),
            kafkaConsumers: this.consumers.size,
        };
    }

    /**
     * Health check
     */
    async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details: Record<string, any> }> {
        const details: Record<string, any> = {
            initialized: this.isInitialized,
            useKafka: this.useKafka,
        };

        try {
            // Verifica Kafka se estiver em uso
            if (this.useKafka && this.producer) {
                // Tenta enviar um ping event
                await this.producer.send({
                    topic: 'pfh.health-check',
                    messages: [{
                        key: 'health',
                        value: JSON.stringify({ ping: Date.now() }),
                    }],
                    timeout: 5000,
                });
                details.kafka = 'healthy';
            }

            return { status: 'healthy', details };

        } catch (error) {
            details.error = error instanceof Error ? error.message : String(error);
            return { status: 'unhealthy', details };
        }
    }

    /**
     * Shutdown graceful
     */
    async shutdown(): Promise<void> {
        logger.info('Shutting down Event Bus...');

        try {
            // Para consumers Kafka
            for (const [eventType, consumer] of this.consumers) {
                await consumer.disconnect();
                logger.debug('Kafka consumer disconnected', { eventType });
            }
            this.consumers.clear();

            // Para producer Kafka
            if (this.producer) {
                await this.producer.disconnect();
                logger.debug('Kafka producer disconnected');
            }

            // Limpa subscriptions
            this.subscriptions.clear();
            this.removeAllListeners();

            this.isInitialized = false;
            logger.info('✅ Event Bus shutdown completed');

        } catch (error) {
            logger.error('Error during Event Bus shutdown', {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }
}

// Instância singleton
const eventBusInstance = new EventBusService();

// Export da instância
export const EventBus = eventBusInstance;

// Export da classe para testes
export { EventBusService };

// Export default
export default EventBus;