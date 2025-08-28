// src/infrastructure/cache/redis-client.ts
import Redis, { RedisOptions } from 'ioredis';
import { logger } from '../monitoring/logger.service';

export interface CacheConfig {
    host: string;
    port: number;
    password?: string;
    db: number;
    keyPrefix?: string;
    ttl: number; // Default TTL in seconds
}

export class RedisClient {
    private redis: Redis;
    private config: CacheConfig;
    private isConnected: boolean = false;

    constructor(config?: Partial<CacheConfig>) {
        this.config = {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD,
            db: parseInt(process.env.REDIS_DB || '0'),
            keyPrefix: process.env.REDIS_KEY_PREFIX || 'pfh:',
            ttl: parseInt(process.env.REDIS_DEFAULT_TTL || '3600'),
            ...config
        };

        const redisOptions: RedisOptions = {
            host: this.config.host,
            port: this.config.port,
            password: this.config.password,
            db: this.config.db,
            keyPrefix: this.config.keyPrefix,
            retryDelayOnFailover: 100,
            maxRetriesPerRequest: 3,
            lazyConnect: true,
            enableOfflineQueue: false
        };

        this.redis = new Redis(redisOptions);
        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        this.redis.on('connect', () => {
            logger.info('Redis connection established', {
                host: this.config.host,
                port: this.config.port,
                db: this.config.db
            });
        });

        this.redis.on('ready', () => {
            this.isConnected = true;
            logger.info('Redis client ready');
        });

        this.redis.on('error', (error) => {
            this.isConnected = false;
            logger.error('Redis connection error', error, {
                host: this.config.host,
                port: this.config.port
            });
        });

        this.redis.on('close', () => {
            this.isConnected = false;
            logger.warn('Redis connection closed');
        });

        this.redis.on('reconnecting', () => {
            logger.info('Attempting to reconnect to Redis...');
        });
    }

    async connect(): Promise<void> {
        try {
            await this.redis.connect();
            logger.info('Redis client connected successfully');
        } catch (error) {
            logger.error('Failed to connect to Redis', error as Error);
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        if (this.redis) {
            await this.redis.disconnect();
            this.isConnected = false;
            logger.info('Redis client disconnected');
        }
    }

    async ping(): Promise<string> {
        return this.redis.ping();
    }

    isReady(): boolean {
        return this.isConnected && this.redis.status === 'ready';
    }

    /**
     * Get a value from cache
     */
    async get<T = any>(key: string): Promise<T | null> {
        try {
            const value = await this.redis.get(key);
            if (value === null) {
                return null;
            }

            // Try to parse as JSON, fallback to string if parsing fails
            try {
                return JSON.parse(value) as T;
            } catch {
                return value as any;
            }
        } catch (error) {
            logger.error('Redis GET error', error as Error, { key });
            return null;
        }
    }

    /**
     * Set a value in cache
     */
    async set(key: string, value: any, ttlSeconds?: number): Promise<boolean> {
        try {
            const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
            const ttl = ttlSeconds || this.config.ttl;

            const result = await this.redis.setex(key, ttl, serializedValue);
            return result === 'OK';
        } catch (error) {
            logger.error('Redis SET error', error as Error, { key, ttl: ttlSeconds });
            return false;
        }
    }

    /**
     * Delete a key from cache
     */
    async del(key: string): Promise<boolean> {
        try {
            const result = await this.redis.del(key);
            return result > 0;
        } catch (error) {
            logger.error('Redis DEL error', error as Error, { key });
            return false;
        }
    }

    /**
     * Delete multiple keys
     */
    async delMany(keys: string[]): Promise<number> {
        if (keys.length === 0) return 0;

        try {
            return await this.redis.del(...keys);
        } catch (error) {
            logger.error('Redis DEL MANY error', error as Error, { keyCount: keys.length });
            return 0;
        }
    }

    /**
     * Check if key exists
     */
    async exists(key: string): Promise<boolean> {
        try {
            const result = await this.redis.exists(key);
            return result === 1;
        } catch (error) {
            logger.error('Redis EXISTS error', error as Error, { key });
            return false;
        }
    }

    /**
     * Set expiration for a key
     */
    async expire(key: string, seconds: number): Promise<boolean> {
        try {
            const result = await this.redis.expire(key, seconds);
            return result === 1;
        } catch (error) {
            logger.error('Redis EXPIRE error', error as Error, { key, seconds });
            return false;
        }
    }

    /**
     * Get TTL for a key
     */
    async ttl(key: string): Promise<number> {
        try {
            return await this.redis.ttl(key);
        } catch (error) {
            logger.error('Redis TTL error', error as Error, { key });
            return -1;
        }
    }

    /**
     * Increment a numeric value
     */
    async incr(key: string): Promise<number> {
        try {
            return await this.redis.incr(key);
        } catch (error) {
            logger.error('Redis INCR error', error as Error, { key });
            throw error;
        }
    }

    /**
     * Increment by a specific amount
     */
    async incrby(key: string, increment: number): Promise<number> {
        try {
            return await this.redis.incrby(key, increment);
        } catch (error) {
            logger.error('Redis INCRBY error', error as Error, { key, increment });
            throw error;
        }
    }

    /**
     * Get keys matching a pattern
     */
    async keys(pattern: string): Promise<string[]> {
        try {
            return await this.redis.keys(pattern);
        } catch (error) {
            logger.error('Redis KEYS error', error as Error, { pattern });
            return [];
        }
    }

    /**
     * Flush all keys in current database
     */
    async flushdb(): Promise<void> {
        try {
            await this.redis.flushdb();
            logger.info('Redis database flushed');
        } catch (error) {
            logger.error('Redis FLUSHDB error', error as Error);
            throw error;
        }
    }

    /**
     * Hash operations
     */
    async hset(key: string, field: string, value: any): Promise<boolean> {
        try {
            const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
            const result = await this.redis.hset(key, field, serializedValue);
            return result === 1;
        } catch (error) {
            logger.error('Redis HSET error', error as Error, { key, field });
            return false;
        }
    }

    async hget<T = any>(key: string, field: string): Promise<T | null> {
        try {
            const value = await this.redis.hget(key, field);
            if (value === null) return null;

            try {
                return JSON.parse(value) as T;
            } catch {
                return value as any;
            }
        } catch (error) {
            logger.error('Redis HGET error', error as Error, { key, field });
            return null;
        }
    }

    async hdel(key: string, field: string): Promise<boolean> {
        try {
            const result = await this.redis.hdel(key, field);
            return result > 0;
        } catch (error) {
            logger.error('Redis HDEL error', error as Error, { key, field });
            return false;
        }
    }

    async hgetall<T = Record<string, any>>(key: string): Promise<T | null> {
        try {
            const hash = await this.redis.hgetall(key);
            if (Object.keys(hash).length === 0) return null;

            const parsed: any = {};
            for (const [field, value] of Object.entries(hash)) {
                try {
                    parsed[field] = JSON.parse(value);
                } catch {
                    parsed[field] = value;
                }
            }

            return parsed as T;
        } catch (error) {
            logger.error('Redis HGETALL error', error as Error, { key });
            return null;
        }
    }

    /**
     * List operations
     */
    async lpush(key: string, ...values: any[]): Promise<number> {
        try {
            const serializedValues = values.map(v => 
                typeof v === 'string' ? v : JSON.stringify(v)
            );
            return await this.redis.lpush(key, ...serializedValues);
        } catch (error) {
            logger.error('Redis LPUSH error', error as Error, { key });
            throw error;
        }
    }

    async rpush(key: string, ...values: any[]): Promise<number> {
        try {
            const serializedValues = values.map(v => 
                typeof v === 'string' ? v : JSON.stringify(v)
            );
            return await this.redis.rpush(key, ...serializedValues);
        } catch (error) {
            logger.error('Redis RPUSH error', error as Error, { key });
            throw error;
        }
    }

    async lrange<T = any>(key: string, start: number, stop: number): Promise<T[]> {
        try {
            const values = await this.redis.lrange(key, start, stop);
            return values.map(v => {
                try {
                    return JSON.parse(v) as T;
                } catch {
                    return v as any;
                }
            });
        } catch (error) {
            logger.error('Redis LRANGE error', error as Error, { key, start, stop });
            return [];
        }
    }

    /**
     * Get Redis client info
     */
    async info(): Promise<string> {
        return this.redis.info();
    }

    /**
     * Execute a custom Redis command
     */
    async executeCommand(command: string, ...args: any[]): Promise<any> {
        try {
            return await (this.redis as any)[command.toLowerCase()](...args);
        } catch (error) {
            logger.error('Redis custom command error', error as Error, { command, args });
            throw error;
        }
    }

    /**
     * Get the underlying Redis instance
     */
    getClient(): Redis {
        return this.redis;
    }
}

// Singleton instance
export const redisClient = new RedisClient();