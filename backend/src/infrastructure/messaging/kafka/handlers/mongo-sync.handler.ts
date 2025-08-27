import { EachMessagePayload } from 'kafkajs';
import { MessageHandler } from '../consumer';
import { Logger } from '../../../../shared/utils/logger.util';
import { SyncToMongoEvent } from '../topics';
import { DashboardMongoRepository } from '../../../database/mongodb/repositories/dashboard.repository';
import { getMongoDb } from '../../../database/mongodb/connection';
import { 
  DailyCategorySpendDocument, 
  DailyCategorySpendCollectionName,
  WeeklyCategorySpendDocument,
  WeeklyCategorySpendCollectionName,
  CategoryAnalyticsDocument,
  CategoryAnalyticsCollectionName
} from '../../../database/mongodb/schemas/daily-category-spend.schema';

const logger = Logger.createChildLogger('MongoSyncHandler');

export class MongoSyncHandler implements MessageHandler {
  private dashboardRepo: DashboardMongoRepository;

  constructor() {
    this.dashboardRepo = new DashboardMongoRepository();
  }

  async handle(payload: EachMessagePayload): Promise<void> {
    try {
      const messageValue = payload.message.value?.toString();
      if (!messageValue) {
        logger.warn('Empty message received for MongoDB sync');
        return;
      }

      const event: SyncToMongoEvent = JSON.parse(messageValue);
      
      logger.info('Processing MongoDB sync event', {
        entityType: event.entityType,
        entityId: event.entityId,
        operation: event.operation,
        userId: event.userId
      });

      switch (event.entityType) {
        case 'transaction':
          await this.syncTransaction(event);
          break;
        case 'budget':
          await this.syncBudget(event);
          break;
        case 'user':
          await this.syncUser(event);
          break;
        case 'account':
          await this.syncAccount(event);
          break;
        case 'category':
          await this.syncCategory(event);
          break;
        default:
          logger.warn('Unknown entity type for sync', { entityType: event.entityType });
      }

    } catch (error) {
      logger.error('Error processing MongoDB sync event', error, payload);
      throw error; // Re-throw to trigger retry mechanism
    }
  }

  private async syncTransaction(event: SyncToMongoEvent): Promise<void> {
    const { entityId, userId, operation, data } = event;

    switch (operation) {
      case 'create':
      case 'update':
        await this.updateTransactionProjections(data);
        break;
      case 'delete':
        await this.removeTransactionProjections(entityId, userId);
        break;
    }

    // Invalidate related caches
    await this.dashboardRepo.invalidateDashboardCache(userId);
  }

  private async updateTransactionProjections(transactionData: any): Promise<void> {
    try {
      const db = await getMongoDb();
      const transactionDate = new Date(transactionData.date);
      const dayKey = transactionDate.toISOString().split('T')[0];

      // Update daily category spend
      const dailyCategoryCollection = db.collection<DailyCategorySpendDocument>(DailyCategorySpendCollectionName);
      
      const dailyDoc: Partial<DailyCategorySpendDocument> = {
        userId: transactionData.userId,
        date: new Date(dayKey),
        categoryId: transactionData.categoryId,
        categoryName: transactionData.categoryName || 'Unknown',
        totalAmount: 0, // Will be calculated in aggregation
        transactionCount: 0,
        averageAmount: 0,
        transactions: [],
        comparison: {
          previousDay: 0,
          previousWeek: 0,
          previousMonth: 0
        },
        patterns: {
          timeOfDay: this.getTimeOfDay(transactionDate),
          isWeekend: this.isWeekend(transactionDate),
          paymentMethodMostUsed: transactionData.paymentMethod
        },
        lastUpdated: new Date(),
        version: 1
      };

      // Add transaction to daily aggregation
      await dailyCategoryCollection.updateOne(
        {
          userId: transactionData.userId,
          date: new Date(dayKey),
          categoryId: transactionData.categoryId
        },
        {
          $inc: {
            totalAmount: transactionData.amount,
            transactionCount: 1,
            version: 1
          },
          $push: {
            transactions: {
              transactionId: transactionData.id,
              amount: transactionData.amount,
              description: transactionData.description,
              timestamp: transactionDate,
              paymentMethod: transactionData.paymentMethod,
              tags: transactionData.tags
            }
          },
          $set: {
            lastUpdated: new Date(),
            categoryName: transactionData.categoryName || 'Unknown',
            patterns: dailyDoc.patterns
          },
          $setOnInsert: {
            userId: transactionData.userId,
            date: new Date(dayKey),
            categoryId: transactionData.categoryId,
            comparison: dailyDoc.comparison
          }
        },
        { upsert: true }
      );

      // Calculate average amount
      const updatedDoc = await dailyCategoryCollection.findOne({
        userId: transactionData.userId,
        date: new Date(dayKey),
        categoryId: transactionData.categoryId
      });

      if (updatedDoc) {
        const averageAmount = updatedDoc.totalAmount / updatedDoc.transactionCount;
        await dailyCategoryCollection.updateOne(
          { _id: updatedDoc._id },
          { $set: { averageAmount } }
        );
      }

      logger.debug('Transaction projection updated', {
        userId: transactionData.userId,
        categoryId: transactionData.categoryId,
        date: dayKey
      });

    } catch (error) {
      logger.error('Error updating transaction projections', error);
      throw error;
    }
  }

  private async removeTransactionProjections(transactionId: string, userId: string): Promise<void> {
    try {
      const db = await getMongoDb();
      const dailyCategoryCollection = db.collection<DailyCategorySpendDocument>(DailyCategorySpendCollectionName);

      // Remove transaction from daily aggregations
      await dailyCategoryCollection.updateMany(
        { userId, 'transactions.transactionId': transactionId },
        {
          $pull: { transactions: { transactionId } },
          $inc: { version: 1 },
          $set: { lastUpdated: new Date() }
        }
      );

      // Recalculate totals for affected documents
      const affectedDocs = await dailyCategoryCollection.find({
        userId,
        'transactions.transactionId': { $ne: transactionId }
      }).toArray();

      for (const doc of affectedDocs) {
        const totalAmount = doc.transactions.reduce((sum, t) => sum + t.amount, 0);
        const transactionCount = doc.transactions.length;
        const averageAmount = transactionCount > 0 ? totalAmount / transactionCount : 0;

        await dailyCategoryCollection.updateOne(
          { _id: doc._id },
          {
            $set: {
              totalAmount,
              transactionCount,
              averageAmount,
              lastUpdated: new Date()
            }
          }
        );
      }

      logger.debug('Transaction removed from projections', { transactionId, userId });

    } catch (error) {
      logger.error('Error removing transaction projections', error);
      throw error;
    }
  }

  private async syncBudget(event: SyncToMongoEvent): Promise<void> {
    // Update budget-related projections and invalidate cache
    await this.dashboardRepo.invalidateDashboardCache(event.userId);
    
    logger.debug('Budget projection updated', { 
      budgetId: event.entityId, 
      userId: event.userId 
    });
  }

  private async syncUser(event: SyncToMongoEvent): Promise<void> {
    // Sync user profile data to MongoDB if needed
    await this.dashboardRepo.invalidateDashboardCache(event.userId);
    
    logger.debug('User projection updated', { userId: event.entityId });
  }

  private async syncAccount(event: SyncToMongoEvent): Promise<void> {
    // Sync account data and invalidate related caches
    await this.dashboardRepo.invalidateDashboardCache(event.userId);
    
    logger.debug('Account projection updated', { 
      accountId: event.entityId, 
      userId: event.userId 
    });
  }

  private async syncCategory(event: SyncToMongoEvent): Promise<void> {
    // Sync category data and update category-related projections
    await this.dashboardRepo.invalidateDashboardCache(event.userId);
    
    logger.debug('Category projection updated', { 
      categoryId: event.entityId, 
      userId: event.userId 
    });
  }

  private getTimeOfDay(date: Date): 'morning' | 'afternoon' | 'evening' | 'night' {
    const hours = date.getHours();
    if (hours >= 6 && hours < 12) return 'morning';
    if (hours >= 12 && hours < 18) return 'afternoon';
    if (hours >= 18 && hours < 22) return 'evening';
    return 'night';
  }

  private isWeekend(date: Date): boolean {
    const dayOfWeek = date.getDay();
    return dayOfWeek === 0 || dayOfWeek === 6; // Sunday or Saturday
  }
}

export class CacheInvalidationHandler implements MessageHandler {
  private dashboardRepo: DashboardMongoRepository;

  constructor() {
    this.dashboardRepo = new DashboardMongoRepository();
  }

  async handle(payload: EachMessagePayload): Promise<void> {
    try {
      const messageValue = payload.message.value?.toString();
      if (!messageValue) return;

      const event: CacheInvalidationEvent = JSON.parse(messageValue);

      logger.info('Processing cache invalidation event', {
        cacheType: event.cacheType,
        userId: event.userId,
        cacheKey: event.cacheKey,
        reason: event.reason
      });

      switch (event.cacheType) {
        case 'dashboard':
          await this.dashboardRepo.invalidateDashboardCache(event.userId, event.cacheKey);
          break;
        case 'monthly_summary':
          // Invalidate monthly summary caches
          await this.dashboardRepo.invalidateDashboardCache(event.userId);
          break;
        case 'analytics':
          // Invalidate analytics caches
          await this.dashboardRepo.invalidateDashboardCache(event.userId);
          break;
        default:
          logger.warn('Unknown cache type for invalidation', { cacheType: event.cacheType });
      }

    } catch (error) {
      logger.error('Error processing cache invalidation event', error, payload);
      throw error;
    }
  }
}