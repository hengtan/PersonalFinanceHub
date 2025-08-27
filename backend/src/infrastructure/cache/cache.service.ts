import { RedisClientType } from 'redis';
import { getRedisClient } from '../database/redis/connection';
import { Logger } from '../../shared/utils/logger.util';
import { CacheException } from '../../shared/exceptions/base.exception';

const logger = Logger.createChildLogger('CacheService');

export class CacheService {
    private static instance: CacheService;
    private redisClient: RedisClientType | null = null;

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
                return null;
            }

            return JSON.parse(value);
        } catch (error) {
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

            logger.debug(`Cache key set: ${key}${ttl ? ` (TTL: ${ttl}s)` : ''}`);
        } catch (error) {
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
            logger.debug(`Cache key deleted: ${key} (affected: ${result})`);
        } catch (error) {
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
}