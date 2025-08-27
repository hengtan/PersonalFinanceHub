// Event-driven synchronization service: PostgreSQL -> MongoDB via Kafka
import { KafkaProducerService } from './kafka/producer';
import { KafkaConsumerService } from './kafka/consumer';
import { KAFKA_TOPICS, KAFKA_CONSUMER_GROUPS } from './kafka/topics';
import { MongoSyncHandler, CacheInvalidationHandler } from './kafka/handlers/mongo-sync.handler';
import { Logger } from '../../shared/utils/logger.util';
import { InfrastructureException } from '../../shared/exceptions/base.exception';

const logger = Logger.createChildLogger('SyncService');

export class EventDrivenSyncService {
  private static instance: EventDrivenSyncService;
  private producer: KafkaProducerService;
  private syncConsumer: KafkaConsumerService;
  private cacheConsumer: KafkaConsumerService;
  private isInitialized = false;

  private constructor() {
    this.producer = new KafkaProducerService();
    this.syncConsumer = new KafkaConsumerService(KAFKA_CONSUMER_GROUPS.SYNC_SERVICE);
    this.cacheConsumer = new KafkaConsumerService(KAFKA_CONSUMER_GROUPS.CACHE_MANAGER);
  }

  public static getInstance(): EventDrivenSyncService {
    if (!EventDrivenSyncService.instance) {
      EventDrivenSyncService.instance = new EventDrivenSyncService();
    }
    return EventDrivenSyncService.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      logger.info('Initializing Event-Driven Sync Service...');

      // Initialize producer
      await this.producer.connect();

      // Setup sync consumer
      await this.setupSyncConsumer();

      // Setup cache invalidation consumer
      await this.setupCacheConsumer();

      this.isInitialized = true;
      logger.info('Event-Driven Sync Service initialized successfully');

    } catch (error) {
      logger.error('Failed to initialize sync service', error);
      throw new InfrastructureException('Failed to initialize sync service', 'SYNC_SERVICE_INIT_ERROR', 500, error);
    }
  }

  private async setupSyncConsumer(): Promise<void> {
    try {
      // Register handlers for sync events
      const mongoSyncHandler = new MongoSyncHandler();
      
      this.syncConsumer.registerHandler(KAFKA_TOPICS.SYNC_TRANSACTION_TO_MONGO, mongoSyncHandler);
      this.syncConsumer.registerHandler(KAFKA_TOPICS.SYNC_BUDGET_TO_MONGO, mongoSyncHandler);
      this.syncConsumer.registerHandler(KAFKA_TOPICS.SYNC_USER_TO_MONGO, mongoSyncHandler);

      // Connect and subscribe
      await this.syncConsumer.connect();
      await this.syncConsumer.subscribe([
        KAFKA_TOPICS.SYNC_TRANSACTION_TO_MONGO,
        KAFKA_TOPICS.SYNC_BUDGET_TO_MONGO,
        KAFKA_TOPICS.SYNC_USER_TO_MONGO
      ]);

      // Start consuming
      await this.syncConsumer.start();
      
      logger.info('Sync consumer setup completed');

    } catch (error) {
      logger.error('Error setting up sync consumer', error);
      throw error;
    }
  }

  private async setupCacheConsumer(): Promise<void> {
    try {
      // Register cache invalidation handler
      const cacheHandler = new CacheInvalidationHandler();
      
      this.cacheConsumer.registerHandler(KAFKA_TOPICS.CACHE_INVALIDATION, cacheHandler);
      this.cacheConsumer.registerHandler(KAFKA_TOPICS.DASHBOARD_CACHE_REFRESH, cacheHandler);

      // Connect and subscribe
      await this.cacheConsumer.connect();
      await this.cacheConsumer.subscribe([
        KAFKA_TOPICS.CACHE_INVALIDATION,
        KAFKA_TOPICS.DASHBOARD_CACHE_REFRESH
      ]);

      // Start consuming
      await this.cacheConsumer.start();
      
      logger.info('Cache consumer setup completed');

    } catch (error) {
      logger.error('Error setting up cache consumer', error);
      throw error;
    }
  }

  // Public methods to trigger synchronization events

  async syncTransactionToMongo(transactionId: string, userId: string, operation: 'create' | 'update' | 'delete', data: any): Promise<void> {
    try {
      await this.producer.publishSyncEvent('transaction', transactionId, userId, operation, data);
      
      logger.debug('Transaction sync event published', { 
        transactionId, 
        userId, 
        operation 
      });

    } catch (error) {
      logger.error('Error syncing transaction to MongoDB', error, { 
        transactionId, 
        userId, 
        operation 
      });
      throw new InfrastructureException('Failed to sync transaction to MongoDB', 'TRANSACTION_SYNC_ERROR', 500, error);
    }
  }

  async syncBudgetToMongo(budgetId: string, userId: string, operation: 'create' | 'update' | 'delete', data: any): Promise<void> {
    try {
      await this.producer.publishSyncEvent('budget', budgetId, userId, operation, data);
      
      logger.debug('Budget sync event published', { 
        budgetId, 
        userId, 
        operation 
      });

    } catch (error) {
      logger.error('Error syncing budget to MongoDB', error, { 
        budgetId, 
        userId, 
        operation 
      });
      throw new InfrastructureException('Failed to sync budget to MongoDB', 'BUDGET_SYNC_ERROR', 500, error);
    }
  }

  async syncUserToMongo(userId: string, operation: 'create' | 'update' | 'delete', data: any): Promise<void> {
    try {
      await this.producer.publishSyncEvent('user', userId, userId, operation, data);
      
      logger.debug('User sync event published', { 
        userId, 
        operation 
      });

    } catch (error) {
      logger.error('Error syncing user to MongoDB', error, { 
        userId, 
        operation 
      });
      throw new InfrastructureException('Failed to sync user to MongoDB', 'USER_SYNC_ERROR', 500, error);
    }
  }

  async syncAccountToMongo(accountId: string, userId: string, operation: 'create' | 'update' | 'delete', data: any): Promise<void> {
    try {
      await this.producer.publishSyncEvent('account', accountId, userId, operation, data);
      
      logger.debug('Account sync event published', { 
        accountId, 
        userId, 
        operation 
      });

    } catch (error) {
      logger.error('Error syncing account to MongoDB', error, { 
        accountId, 
        userId, 
        operation 
      });
      throw new InfrastructureException('Failed to sync account to MongoDB', 'ACCOUNT_SYNC_ERROR', 500, error);
    }
  }

  async invalidateCache(cacheType: 'dashboard' | 'monthly_summary' | 'analytics' | 'user_profile', userId: string, cacheKey?: string, reason?: string): Promise<void> {
    try {
      await this.producer.publishCacheInvalidationEvent(cacheType, userId, cacheKey, reason);
      
      logger.debug('Cache invalidation event published', { 
        cacheType, 
        userId, 
        cacheKey, 
        reason 
      });

    } catch (error) {
      logger.error('Error publishing cache invalidation event', error, { 
        cacheType, 
        userId, 
        cacheKey 
      });
      throw new InfrastructureException('Failed to invalidate cache', 'CACHE_INVALIDATION_ERROR', 500, error);
    }
  }

  // Transaction lifecycle sync methods (called from transaction service)
  async onTransactionCreated(transaction: any): Promise<void> {
    try {
      // Sync to MongoDB
      await this.syncTransactionToMongo(transaction.id, transaction.userId, 'create', transaction);

      // Invalidate related caches
      await this.invalidateCache('dashboard', transaction.userId, undefined, 'Transaction created');
      await this.invalidateCache('monthly_summary', transaction.userId, undefined, 'Transaction created');

      // Publish transaction created event for other services
      await this.producer.publishTransactionEvent('created', transaction);

    } catch (error) {
      logger.error('Error in transaction created workflow', error, { transactionId: transaction.id });
      throw error;
    }
  }

  async onTransactionUpdated(transaction: any): Promise<void> {
    try {
      // Sync to MongoDB
      await this.syncTransactionToMongo(transaction.id, transaction.userId, 'update', transaction);

      // Invalidate related caches
      await this.invalidateCache('dashboard', transaction.userId, undefined, 'Transaction updated');
      await this.invalidateCache('monthly_summary', transaction.userId, undefined, 'Transaction updated');

      // Publish transaction updated event
      await this.producer.publishTransactionEvent('updated', transaction);

    } catch (error) {
      logger.error('Error in transaction updated workflow', error, { transactionId: transaction.id });
      throw error;
    }
  }

  async onTransactionDeleted(transactionId: string, userId: string): Promise<void> {
    try {
      // Sync deletion to MongoDB
      await this.syncTransactionToMongo(transactionId, userId, 'delete', { id: transactionId });

      // Invalidate related caches
      await this.invalidateCache('dashboard', userId, undefined, 'Transaction deleted');
      await this.invalidateCache('monthly_summary', userId, undefined, 'Transaction deleted');

      // Publish transaction deleted event
      await this.producer.publishTransactionEvent('deleted', { id: transactionId, userId });

    } catch (error) {
      logger.error('Error in transaction deleted workflow', error, { transactionId, userId });
      throw error;
    }
  }

  // Budget lifecycle sync methods
  async onBudgetExceeded(budget: any): Promise<void> {
    try {
      // Publish budget exceeded event for notifications
      await this.producer.publishBudgetExceededEvent(budget);

      // Invalidate related caches
      await this.invalidateCache('dashboard', budget.userId, undefined, 'Budget exceeded');

    } catch (error) {
      logger.error('Error in budget exceeded workflow', error, { budgetId: budget.id });
      throw error;
    }
  }

  // Health check
  isHealthy(): boolean {
    return this.isInitialized && 
           this.producer.isHealthy();
  }

  // Graceful shutdown
  async shutdown(): Promise<void> {
    try {
      logger.info('Shutting down Event-Driven Sync Service...');

      await this.syncConsumer.disconnect();
      await this.cacheConsumer.disconnect();
      await this.producer.disconnect();

      this.isInitialized = false;
      logger.info('Event-Driven Sync Service shutdown completed');

    } catch (error) {
      logger.error('Error during sync service shutdown', error);
      throw error;
    }
  }
}