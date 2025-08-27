// backend/src/infrastructure/database/redis/cache.service.ts
import { createClient, RedisClientType } from 'redis';
import { logger } from '../../monitoring/logger.service';

export class CacheService {
    private static instance: CacheService;
    private client: RedisClientType;
    private isConnected = false;

    private constructor() {
        this.client = createClient({
            url: `redis://:${process.env.REDIS_PASSWORD || ''}@${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`,
            socket: {
                connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT || '10000'),
                commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT || '5000'),
                reconnectStrategy: (retries) => Math.min(retries * 50, 500)
            }
        });

        this.setupEventHandlers();
    }

    public static getInstance(): CacheService {
        if (!CacheService.instance) {
            CacheService.instance = new CacheService();
        }
        return CacheService.instance;
    }

    private setupEventHandlers(): void {
        this.client.on('connect', () => {
            logger.info('Redis client connecting...');
        });

        this.client.on('ready', () => {
            this.isConnected = true;
            logger.info('Redis client connected and ready');
        });

        this.client.on('error', (error) => {
            this.isConnected = false;
            logger.error('Redis client error', error);
        });

        this.client.on('end', () => {
            this.isConnected = false;
            logger.info('Redis client connection ended');
        });

        this.client.on('reconnecting', () => {
            logger.info('Redis client reconnecting...');
        });
    }

    public async connect(): Promise<void> {
        if (!this.isConnected) {
            await this.client.connect();
        }
    }

    public async disconnect(): Promise<void> {
        if (this.isConnected) {
            await this.client.disconnect();
        }
    }

    public async get(key: string): Promise<string | null> {
        try {
            return await this.client.get(key);
        } catch (error) {
            logger.error('Cache get error', error as Error, { key });
            return null;
        }
    }

    public async set(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
        try {
            if (ttlSeconds) {
                await this.client.setEx(key, ttlSeconds, value);
            } else {
                await this.client.set(key, value);
            }
            return true;
        } catch (error) {
            logger.error('Cache set error', error as Error, { key, ttlSeconds });
            return false;
        }
    }

    public async del(key: string): Promise<boolean> {
        try {
            const result = await this.client.del(key);
            return result > 0;
        } catch (error) {
            logger.error('Cache delete error', error as Error, { key });
            return false;
        }
    }

    public async exists(key: string): Promise<boolean> {
        try {
            const result = await this.client.exists(key);
            return result === 1;
        } catch (error) {
            logger.error('Cache exists error', error as Error, { key });
            return false;
        }
    }

    public async expire(key: string, ttlSeconds: number): Promise<boolean> {
        try {
            const result = await this.client.expire(key, ttlSeconds);
            return result === 1;
        } catch (error) {
            logger.error('Cache expire error', error as Error, { key, ttlSeconds });
            return false;
        }
    }

    public async mget(keys: string[]): Promise<(string | null)[]> {
        try {
            return await this.client.mGet(keys);
        } catch (error) {
            logger.error('Cache mget error', error as Error, { keys });
            return new Array(keys.length).fill(null);
        }
    }

    public async mset(keyValues: Record<string, string>): Promise<boolean> {
        try {
            await this.client.mSet(keyValues);
            return true;
        } catch (error) {
            logger.error('Cache mset error', error as Error, { keyValues });
            return false;
        }
    }

    public async incr(key: string): Promise<number> {
        try {
            return await this.client.incr(key);
        } catch (error) {
            logger.error('Cache incr error', error as Error, { key });
            return 0;
        }
    }

    public async decr(key: string): Promise<number> {
        try {
            return await this.client.decr(key);
        } catch (error) {
            logger.error('Cache decr error', error as Error, { key });
            return 0;
        }
    }

    public isHealthy(): boolean {
        return this.isConnected;
    }

    public getClient(): RedisClientType {
        return this.client;
    }
}

// Export singleton instance
export const cacheService = CacheService.getInstance();