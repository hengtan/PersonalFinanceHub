import { RedisClientType } from 'redis';
import { getRedisClient } from '../database/redis/connection';
import { Logger } from '../../shared/utils/logger.util';
import { CacheException } from '../../shared/exceptions/base.exception';

const logger = Logger.createChildLogger('CacheService');

export interface CacheStats {
    hits: number;
    misses: number;
    sets: number;
    deletes: number;
    errors: number;
    hitRate: number;
}

export interface SessionData {
    userId: string;
    email: string;
    firstName: string;
    lastName: string;
    loginAt: Date;
    lastActivity: Date;
    ipAddress: string;
    userAgent: string;
}

export interface DashboardData {
    userId: string;
    totalBalance: number;
    monthlyIncome: number;
    monthlyExpenses: number;
    transactionCount: number;
    budgetSummary: any[];
    recentTransactions: any[];
    generatedAt: Date;
}

export class CacheService {
    private static instance: CacheService;
    private redisClient: RedisClientType | null = null;
    private stats: CacheStats = {
        hits: 0,
        misses: 0,
        sets: 0,
        deletes: 0,
        errors: 0,
        hitRate: 0
    };

    private constructor() {}

    public static getInstance(): CacheService {
        if (!CacheService.instance) {
            CacheService.instance = new CacheService();
        }
        return CacheService.instance;
    }

    public async initialize(): Promise<void> {
        try {
            this.redisClient = await getRedisClient();
            logger.info('Cache service initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize cache service', error);
            throw new CacheException('Failed to initialize cache service', error);
        }
    }

    public async get<T>(key: string): Promise<T | null> {
        try {
            if (!this.redisClient) {
                await this.initialize();
            }

            const value = await this.redisClient!.get(key);
            if (value === null) {
                this.stats.misses++;
                this.updateHitRate();
                return null;
            }

            this.stats.hits++;
            this.updateHitRate();
            return JSON.parse(value);
        } catch (error) {
            this.stats.errors++;
            logger.error(`Failed to get cache key: ${key}`, error);
            throw new CacheException(`Failed to get cache key: ${key}`, error);
        }
    }

    public async set(key: string, value: any, ttl?: number): Promise<void> {
        try {
            if (!this.redisClient) {
                await this.initialize();
            }

            const serializedValue = JSON.stringify(value);
            
            if (ttl && ttl > 0) {
                await this.redisClient!.setEx(key, ttl, serializedValue);
            } else {
                await this.redisClient!.set(key, serializedValue);
            }

            this.stats.sets++;
            logger.debug(`Cache key set: ${key}${ttl ? ` (TTL: ${ttl}s)` : ''}`);
        } catch (error) {
            this.stats.errors++;
            logger.error(`Failed to set cache key: ${key}`, error);
            throw new CacheException(`Failed to set cache key: ${key}`, error);
        }
    }

    public async del(key: string): Promise<void> {
        try {
            if (!this.redisClient) {
                await this.initialize();
            }

            const result = await this.redisClient!.del(key);
            if (result > 0) {
                this.stats.deletes += result;
            }
            logger.debug(`Cache key deleted: ${key} (affected: ${result})`);
        } catch (error) {
            this.stats.errors++;
            logger.error(`Failed to delete cache key: ${key}`, error);
            throw new CacheException(`Failed to delete cache key: ${key}`, error);
        }
    }

    public async exists(key: string): Promise<boolean> {
        try {
            if (!this.redisClient) {
                await this.initialize();
            }

            const result = await this.redisClient!.exists(key);
            return result === 1;
        } catch (error) {
            logger.error(`Failed to check cache key existence: ${key}`, error);
            return false;
        }
    }

    public async keys(pattern: string): Promise<string[]> {
        try {
            if (!this.redisClient) {
                await this.initialize();
            }

            return await this.redisClient!.keys(pattern);
        } catch (error) {
            logger.error(`Failed to get cache keys with pattern: ${pattern}`, error);
            throw new CacheException(`Failed to get cache keys with pattern: ${pattern}`, error);
        }
    }

    public async clearNamespace(namespace: string): Promise<void> {
        try {
            const keys = await this.keys(`${namespace}:*`);
            if (keys.length > 0) {
                await this.redisClient!.del(keys);
                logger.info(`Cleared ${keys.length} keys from namespace: ${namespace}`);
            }
        } catch (error) {
            logger.error(`Failed to clear namespace: ${namespace}`, error);
            throw new CacheException(`Failed to clear namespace: ${namespace}`, error);
        }
    }

    public async flushAll(): Promise<void> {
        try {
            if (!this.redisClient) {
                await this.initialize();
            }

            await this.redisClient!.flushAll();
            logger.warn('All cache cleared');
        } catch (error) {
            logger.error('Failed to flush all cache', error);
            throw new CacheException('Failed to flush all cache', error);
        }
    }

    public async getTtl(key: string): Promise<number> {
        try {
            if (!this.redisClient) {
                await this.initialize();
            }

            return await this.redisClient!.ttl(key);
        } catch (error) {
            logger.error(`Failed to get TTL for key: ${key}`, error);
            return -1;
        }
    }

    public async expire(key: string, seconds: number): Promise<boolean> {
        try {
            if (!this.redisClient) {
                await this.initialize();
            }

            const result = await this.redisClient!.expire(key, seconds);
            return result;
        } catch (error) {
            logger.error(`Failed to set expiration for key: ${key}`, error);
            return false;
        }
    }

    /**
     * Session Management Methods
     */
    public async setSession(sessionId: string, data: SessionData, ttlSeconds: number = 3600): Promise<void> {
        const key = `session:${sessionId}`;
        await this.set(key, data, ttlSeconds);
        logger.debug('Session cached', { sessionId, userId: data.userId });
    }

    public async getSession(sessionId: string): Promise<SessionData | null> {
        const key = `session:${sessionId}`;
        const data = await this.get<SessionData>(key);
        logger.debug(data ? 'Session cache hit' : 'Session cache miss', { sessionId });
        return data;
    }

    public async deleteSession(sessionId: string): Promise<void> {
        const key = `session:${sessionId}`;
        await this.del(key);
        logger.debug('Session deleted from cache', { sessionId });
    }

    public async extendSession(sessionId: string, ttlSeconds: number = 3600): Promise<boolean> {
        const key = `session:${sessionId}`;
        return await this.expire(key, ttlSeconds);
    }

    /**
     * Dashboard Data Caching
     */
    public async cacheDashboardData(userId: string, data: DashboardData, ttlSeconds: number = 300): Promise<void> {
        const key = `dashboard:${userId}`;
        const cacheData = {
            ...data,
            generatedAt: new Date()
        };
        await this.set(key, cacheData, ttlSeconds);
        logger.debug('Dashboard data cached', { userId });
    }

    public async getDashboardData(userId: string): Promise<DashboardData | null> {
        const key = `dashboard:${userId}`;
        const data = await this.get<DashboardData>(key);
        logger.debug(data ? 'Dashboard cache hit' : 'Dashboard cache miss', { userId });
        return data;
    }

    /**
     * User-specific cache operations
     */
    public async invalidateUserCache(userId: string): Promise<void> {
        const patterns = [
            `session:*:${userId}`,
            `dashboard:${userId}`,
            `user:${userId}:*`,
            `budget:${userId}:*`,
            `transaction:${userId}:*`
        ];

        for (const pattern of patterns) {
            const keys = await this.keys(pattern);
            if (keys.length > 0) {
                await this.redisClient!.del(keys);
                this.stats.deletes += keys.length;
            }
        }

        logger.info('User cache invalidated', { userId, patterns });
    }

    /**
     * Rate Limiting Support
     */
    public async incrementRateLimit(key: string, windowSeconds: number = 60): Promise<{ count: number; ttl: number }> {
        try {
            if (!this.redisClient) {
                await this.initialize();
            }

            const rateLimitKey = `rate_limit:${key}`;
            const count = await this.redisClient!.incr(rateLimitKey);
            
            if (count === 1) {
                await this.redisClient!.expire(rateLimitKey, windowSeconds);
            }
            
            const ttl = await this.redisClient!.ttl(rateLimitKey);
            
            return { count, ttl };
        } catch (error) {
            this.stats.errors++;
            logger.error('Rate limit increment failed', error, { key });
            throw error;
        }
    }

    /**
     * Health and Statistics
     */
    public async isHealthy(): Promise<boolean> {
        try {
            if (!this.redisClient) {
                return false;
            }
            await this.redisClient.ping();
            return true;
        } catch (error) {
            logger.error('Cache health check failed', error);
            return false;
        }
    }

    public getStats(): CacheStats {
        return { ...this.stats };
    }

    public resetStats(): void {
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0,
            errors: 0,
            hitRate: 0
        };
        logger.info('Cache statistics reset');
    }

    private updateHitRate(): void {
        const total = this.stats.hits + this.stats.misses;
        this.stats.hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;
    }

    /**
     * Cache warming for frequently accessed data
     */
    public async warmCache(userId: string): Promise<void> {
        try {
            logger.info('Starting cache warming for user', { userId });
            
            // Warm up dashboard data would be implemented here
            // For now, we'll just log the intent
            logger.info('Cache warming completed', { userId });
        } catch (error) {
            logger.error('Cache warming failed', error, { userId });
        }
    }
}