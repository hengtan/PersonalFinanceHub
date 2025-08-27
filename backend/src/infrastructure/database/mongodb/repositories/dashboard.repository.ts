import { Collection, Db } from 'mongodb';
import { getMongoDb } from '../connection';
import { DashboardCacheDocument, DashboardCacheCollectionName } from '../schemas/dashboard-cache.schema';
import { MonthlySummaryDocument, MonthlySummaryCollectionName } from '../schemas/monthly-summary.schema';
import { Logger } from '../../../../shared/utils/logger.util';
import { CacheService } from '../../../cache/cache.service';
import { InfrastructureException } from '../../../../shared/exceptions/base.exception';

const logger = Logger.createChildLogger('DashboardRepository');

export class DashboardMongoRepository {
  private db: Db | null = null;
  private dashboardCacheCollection: Collection<DashboardCacheDocument> | null = null;
  private monthlySummaryCollection: Collection<MonthlySummaryDocument> | null = null;
  private cacheService: CacheService;

  constructor() {
    this.cacheService = CacheService.getInstance();
  }

  private async initialize(): Promise<void> {
    if (!this.db) {
      this.db = await getMongoDb();
      this.dashboardCacheCollection = this.db.collection<DashboardCacheDocument>(DashboardCacheCollectionName);
      this.monthlySummaryCollection = this.db.collection<MonthlySummaryDocument>(MonthlySummaryCollectionName);
    }
  }

  // Cache-aside pattern: Redis -> MongoDB -> Compute
  async getDashboardData(userId: string, cacheKey: string = 'main'): Promise<DashboardCacheDocument['data'] | null> {
    try {
      // 1. Try Redis cache first
      const redisKey = `dashboard:${userId}:${cacheKey}`;
      const cachedData = await this.cacheService.get<DashboardCacheDocument['data']>(redisKey);
      
      if (cachedData) {
        logger.debug('Dashboard data served from Redis cache', { userId, cacheKey });
        return cachedData;
      }

      // 2. Try MongoDB cache
      await this.initialize();
      const mongoCache = await this.dashboardCacheCollection!.findOne(
        { 
          userId, 
          cacheKey, 
          expiresAt: { $gt: new Date() } 
        },
        { sort: { generatedAt: -1 } }
      );

      if (mongoCache?.data) {
        // Update Redis cache with MongoDB data
        await this.cacheService.set(redisKey, mongoCache.data, 300); // 5 minutes TTL
        logger.debug('Dashboard data served from MongoDB cache', { userId, cacheKey });
        return mongoCache.data;
      }

      // 3. Cache miss - return null to trigger data generation
      logger.debug('Dashboard cache miss - data needs generation', { userId, cacheKey });
      return null;

    } catch (error) {
      logger.error('Error retrieving dashboard data', error, { userId, cacheKey });
      throw new InfrastructureException('Failed to retrieve dashboard data', 'DASHBOARD_CACHE_ERROR', 500, error);
    }
  }

  async setDashboardCache(
    userId: string, 
    data: DashboardCacheDocument['data'], 
    cacheKey: string = 'main',
    ttlMinutes: number = 15
  ): Promise<void> {
    try {
      await this.initialize();
      
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + ttlMinutes);
      
      const hash = this.generateDataHash(data);
      
      const cacheDocument: DashboardCacheDocument = {
        userId,
        cacheKey,
        data,
        generatedAt: new Date(),
        expiresAt,
        version: 1,
        hash,
        lastTransactionId: data.recentTransactions?.[0]?.id
      };

      // Update MongoDB cache
      await this.dashboardCacheCollection!.replaceOne(
        { userId, cacheKey },
        cacheDocument,
        { upsert: true }
      );

      // Update Redis cache
      const redisKey = `dashboard:${userId}:${cacheKey}`;
      await this.cacheService.set(redisKey, data, ttlMinutes * 60); // Convert to seconds

      logger.info('Dashboard cache updated', { userId, cacheKey, ttlMinutes });

    } catch (error) {
      logger.error('Error setting dashboard cache', error, { userId, cacheKey });
      throw new InfrastructureException('Failed to set dashboard cache', 'DASHBOARD_CACHE_ERROR', 500, error);
    }
  }

  async invalidateDashboardCache(userId: string, cacheKey?: string): Promise<void> {
    try {
      await this.initialize();

      if (cacheKey) {
        // Invalidate specific cache
        await this.dashboardCacheCollection!.deleteOne({ userId, cacheKey });
        await this.cacheService.del(`dashboard:${userId}:${cacheKey}`);
      } else {
        // Invalidate all user's dashboard caches
        await this.dashboardCacheCollection!.deleteMany({ userId });
        await this.cacheService.clearNamespace(`dashboard:${userId}`);
      }

      logger.info('Dashboard cache invalidated', { userId, cacheKey });

    } catch (error) {
      logger.error('Error invalidating dashboard cache', error, { userId, cacheKey });
      throw new InfrastructureException('Failed to invalidate dashboard cache', 'DASHBOARD_CACHE_ERROR', 500, error);
    }
  }

  // Monthly summaries management
  async getMonthlySummary(userId: string, year: number, month: number): Promise<MonthlySummaryDocument | null> {
    try {
      // Try Redis first
      const redisKey = `monthly_summary:${userId}:${year}:${month}`;
      const cached = await this.cacheService.get<MonthlySummaryDocument>(redisKey);
      
      if (cached) {
        logger.debug('Monthly summary served from Redis', { userId, year, month });
        return cached;
      }

      // Try MongoDB
      await this.initialize();
      const summary = await this.monthlySummaryCollection!.findOne({ 
        userId, 
        year, 
        month 
      });

      if (summary) {
        // Cache in Redis for 1 hour
        await this.cacheService.set(redisKey, summary, 3600);
        logger.debug('Monthly summary served from MongoDB', { userId, year, month });
      }

      return summary;

    } catch (error) {
      logger.error('Error retrieving monthly summary', error, { userId, year, month });
      throw new InfrastructureException('Failed to retrieve monthly summary', 'MONTHLY_SUMMARY_ERROR', 500, error);
    }
  }

  async setMonthlySummary(summary: MonthlySummaryDocument): Promise<void> {
    try {
      await this.initialize();
      
      summary.lastUpdated = new Date();
      summary.version = (summary.version || 0) + 1;

      await this.monthlySummaryCollection!.replaceOne(
        { userId: summary.userId, year: summary.year, month: summary.month },
        summary,
        { upsert: true }
      );

      // Update Redis cache
      const redisKey = `monthly_summary:${summary.userId}:${summary.year}:${summary.month}`;
      await this.cacheService.set(redisKey, summary, 3600);

      // Invalidate related dashboard caches
      await this.invalidateDashboardCache(summary.userId);

      logger.info('Monthly summary updated', { 
        userId: summary.userId, 
        year: summary.year, 
        month: summary.month 
      });

    } catch (error) {
      logger.error('Error setting monthly summary', error, summary);
      throw new InfrastructureException('Failed to set monthly summary', 'MONTHLY_SUMMARY_ERROR', 500, error);
    }
  }

  async getUserMonthlySummaries(
    userId: string, 
    startYear: number, 
    startMonth: number,
    endYear: number,
    endMonth: number
  ): Promise<MonthlySummaryDocument[]> {
    try {
      await this.initialize();

      const summaries = await this.monthlySummaryCollection!.find({
        userId,
        $or: [
          { year: { $gt: startYear, $lt: endYear } },
          { year: startYear, month: { $gte: startMonth } },
          { year: endYear, month: { $lte: endMonth } }
        ]
      }).sort({ year: -1, month: -1 }).toArray();

      return summaries;

    } catch (error) {
      logger.error('Error retrieving user monthly summaries', error, { userId, startYear, startMonth, endYear, endMonth });
      throw new InfrastructureException('Failed to retrieve monthly summaries', 'MONTHLY_SUMMARY_ERROR', 500, error);
    }
  }

  private generateDataHash(data: any): string {
    // Simple hash function for cache validation
    return Buffer.from(JSON.stringify(data)).toString('base64').slice(0, 16);
  }

  // Cleanup expired caches
  async cleanupExpiredCaches(): Promise<{ deletedCount: number }> {
    try {
      await this.initialize();

      const result = await this.dashboardCacheCollection!.deleteMany({
        expiresAt: { $lt: new Date() }
      });

      logger.info('Expired dashboard caches cleaned up', { deletedCount: result.deletedCount });
      
      return { deletedCount: result.deletedCount || 0 };

    } catch (error) {
      logger.error('Error cleaning up expired caches', error);
      throw new InfrastructureException('Failed to cleanup expired caches', 'CACHE_CLEANUP_ERROR', 500, error);
    }
  }
}