// =============================================
// 📁 backend/src/infrastructure/database/connections.ts
// Database Connections Manager (CORRIGIDO)
// =============================================

import { Pool, PoolClient, PoolConfig } from 'pg';
import { MongoClient, Db, MongoClientOptions } from 'mongodb';
import {
    createClient,
    RedisClientType,
    RedisDefaultModules,
    RedisFunctions,
    RedisModules,
    RedisScripts
} from 'redis';

import { logger } from '../monitoring/logger.service';

// Types
type RedisClient = RedisClientType<RedisDefaultModules & RedisModules, RedisFunctions, RedisScripts>;
type TransactionCallback<T> = (client: PoolClient) => Promise<T>;

/**
 * Configurações de conexão com PostgreSQL
 */
const getPostgresConfig = (): PoolConfig => ({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'personal_finance',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'password',
    ssl: process.env.POSTGRES_SSL === 'true' ? {
        rejectUnauthorized: false,
    } : false,
    max: parseInt(process.env.POSTGRES_MAX_CONNECTIONS || '20'),
    min: parseInt(process.env.POSTGRES_MIN_CONNECTIONS || '5'),
    idleTimeoutMillis: parseInt(process.env.POSTGRES_IDLE_TIMEOUT || '30000'),
    connectionTimeoutMillis: parseInt(process.env.POSTGRES_CONNECTION_TIMEOUT || '10000'),
    acquireTimeoutMillis: parseInt(process.env.POSTGRES_ACQUIRE_TIMEOUT || '10000'),
    statement_timeout: parseInt(process.env.POSTGRES_STATEMENT_TIMEOUT || '30000'),
    query_timeout: parseInt(process.env.POSTGRES_QUERY_TIMEOUT || '30000'),
    application_name: 'personal-finance-hub',
});

/**
 * Configurações de conexão com PostgreSQL (Read Replica)
 */
const getPostgresReadConfig = (): PoolConfig => {
    const baseConfig = getPostgresConfig();
    return {
        ...baseConfig,
        host: process.env.POSTGRES_READ_HOST || baseConfig.host,
        port: parseInt(process.env.POSTGRES_READ_PORT || baseConfig.port!.toString()),
        max: parseInt(process.env.POSTGRES_READ_MAX_CONNECTIONS || '30'),
        application_name: 'personal-finance-hub-read',
    };
};

/**
 * Configurações de conexão com MongoDB
 */
const getMongoOptions = (): MongoClientOptions => ({
    maxPoolSize: parseInt(process.env.MONGODB_MAX_POOL_SIZE || '20'),
    minPoolSize: parseInt(process.env.MONGODB_MIN_POOL_SIZE || '5'),
    maxIdleTimeMS: parseInt(process.env.MONGODB_MAX_IDLE_TIME || '30000'),
    serverSelectionTimeoutMS: parseInt(process.env.MONGODB_SERVER_SELECTION_TIMEOUT || '10000'),
    socketTimeoutMS: parseInt(process.env.MONGODB_SOCKET_TIMEOUT || '30000'),
    connectTimeoutMS: parseInt(process.env.MONGODB_CONNECT_TIMEOUT || '10000'),
    heartbeatFrequencyMS: parseInt(process.env.MONGODB_HEARTBEAT_FREQUENCY || '10000'),
    retryWrites: true,
    retryReads: true,
    readPreference: 'secondaryPreferred',
    appName: 'personal-finance-hub',
    compressors: ['snappy', 'zlib'],
});

/**
 * Instâncias de conexão
 */
export let pgWritePool: Pool;
export let pgReadPool: Pool;
export let mongoClient: MongoClient;
export let mongoDB: Db;
export let redisClient: RedisClient;
export let redisReadClient: RedisClient;

/**
 * Estado das conexões
 */
interface ConnectionStatus {
    postgres: {
        write: boolean;
        read: boolean;
    };
    mongodb: boolean;
    redis: {
        write: boolean;
        read: boolean;
    };
}

let connectionStatus: ConnectionStatus = {
    postgres: { write: false, read: false },
    mongodb: false,
    redis: { write: false, read: false },
};

/**
 * Conecta a todos os bancos de dados
 */
export async function connectDatabases(): Promise<void> {
    const startTime = Date.now();
    logger.info('🔌 Connecting to databases...');

    const connections: Array<Promise<void>> = [];

    try {
        // Conecta PostgreSQL (Write) - Prioritário
        connections.push(connectPostgreSQL());

        // Conecta PostgreSQL (Read Replica) - Opcional
        connections.push(connectPostgreSQLRead().catch(err => {
            logger.warn('Read replica connection failed, using write pool', { error: err.message });
            pgReadPool = pgWritePool;
            connectionStatus.postgres.read = connectionStatus.postgres.write;
        }));

        // Conecta MongoDB - Paralelo
        connections.push(connectMongoDB());

        // Conecta Redis - Paralelo
        connections.push(connectRedis());

        // Aguarda todas as conexões
        await Promise.allSettled(connections);

        // Verifica se pelo menos as conexões essenciais estão ok
        if (!connectionStatus.postgres.write) {
            throw new Error('PostgreSQL write connection failed - essential for application');
        }

        const duration = Date.now() - startTime;
        logger.info('✅ Database connections established', {
            duration: `${duration}ms`,
            connections: connectionStatus,
        });

        // Setup de event listeners para monitoramento
        setupConnectionMonitoring();

    } catch (error) {
        logger.error('❌ Failed to connect to databases', {
            error: error instanceof Error ? error.message : String(error),
            connectionStatus,
        });
        throw error;
    }
}

/**
 * Conecta ao PostgreSQL (Write)
 */
async function connectPostgreSQL(): Promise<void> {
    try {
        const config = getPostgresConfig();
        pgWritePool = new Pool(config);

        // Testa conexão
        const client = await pgWritePool.connect();
        const result = await client.query('SELECT NOW() as current_time, version() as version');
        client.release();

        connectionStatus.postgres.write = true;

        logger.info('✅ PostgreSQL (Write) connected', {
            host: config.host,
            database: config.database,
            version: result.rows[0].version.split(' ')[1],
            currentTime: result.rows[0].current_time,
        });

    } catch (error) {
        connectionStatus.postgres.write = false;
        logger.error('❌ Failed to connect to PostgreSQL (Write)', {
            error: error instanceof Error ? error.message : String(error),
            config: {
                host: process.env.POSTGRES_HOST,
                port: process.env.POSTGRES_PORT,
                database: process.env.POSTGRES_DB,
                user: process.env.POSTGRES_USER,
            },
        });
        throw error;
    }
}

/**
 * Conecta ao PostgreSQL (Read Replica)
 */
async function connectPostgreSQLRead(): Promise<void> {
    try {
        const config = getPostgresReadConfig();
        pgReadPool = new Pool(config);

        // Testa conexão
        const client = await pgReadPool.connect();
        const result = await client.query('SELECT NOW() as current_time');
        client.release();

        connectionStatus.postgres.read = true;

        logger.info('✅ PostgreSQL (Read) connected', {
            host: config.host,
            database: config.database,
            currentTime: result.rows[0].current_time,
        });

    } catch (error) {
        connectionStatus.postgres.read = false;
        logger.warn('⚠️ Failed to connect to PostgreSQL (Read) - falling back to write pool', {
            error: error instanceof Error ? error.message : String(error),
        });

        // Fallback para o pool de escrita
        pgReadPool = pgWritePool;
        connectionStatus.postgres.read = connectionStatus.postgres.write;

        throw error; // Re-throw to be caught by the caller
    }
}

/**
 * Conecta ao MongoDB
 */
async function connectMongoDB(): Promise<void> {
    try {
        const uri = process.env.MONGODB_URI;
        if (!uri) {
            throw new Error('MONGODB_URI environment variable is required');
        }

        const options = getMongoOptions();
        mongoClient = new MongoClient(uri, options);
        await mongoClient.connect();

        // Testa conexão
        const adminDb = mongoClient.db('admin');
        await adminDb.admin().ping();

        const dbName = process.env.MONGODB_DB_NAME || 'personal_finance_read';
        mongoDB = mongoClient.db(dbName);

        connectionStatus.mongodb = true;

        // Informações da conexão
        const buildInfo = await adminDb.admin().buildInfo();

        logger.info('✅ MongoDB connected', {
            database: dbName,
            version: buildInfo.version,
            maxWireVersion: buildInfo.maxWireVersion,
        });

    } catch (error) {
        connectionStatus.mongodb = false;
        logger.error('❌ Failed to connect to MongoDB', {
            error: error instanceof Error ? error.message : String(error),
            uri: process.env.MONGODB_URI?.replace(/\/\/.*:.*@/, '//***:***@'), // Mascarar credenciais
        });
        throw error;
    }
}

/**
 * Conecta ao Redis
 */
async function connectRedis(): Promise<void> {
    try {
        // Redis principal (Write/Read)
        const redisUrl = process.env.REDIS_URL ||
            `redis://:${process.env.REDIS_PASSWORD}@${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`;

        redisClient = createClient({
            url: redisUrl,
            socket: {
                connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT || '10000'),
                commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT || '5000'),
                reconnectStrategy: (retries: number) => {
                    if (retries > 10) {
                        logger.error('Redis reconnection attempts exceeded');
                        return false;
                    }
                    return Math.min(retries * 50, 1000);
                },
            },
            database: parseInt(process.env.REDIS_DB || '0'),
        });

        // Event listeners
        redisClient.on('error', (error) => {
            logger.error('Redis client error', { error: error.message });
            connectionStatus.redis.write = false;
        });

        redisClient.on('connect', () => {
            logger.debug('Redis client connecting...');
        });

        redisClient.on('ready', () => {
            logger.debug('Redis client ready');
            connectionStatus.redis.write = true;
        });

        redisClient.on('reconnecting', () => {
            logger.warn('Redis client reconnecting...');
            connectionStatus.redis.write = false;
        });

        redisClient.on('end', () => {
            logger.warn('Redis client connection ended');
            connectionStatus.redis.write = false;
        });

        await redisClient.connect();

        // Redis read replica (se configurado)
        const redisReadUrl = process.env.REDIS_READ_URL;
        if (redisReadUrl && redisReadUrl !== redisUrl) {
            redisReadClient = createClient({
                url: redisReadUrl,
                socket: {
                    connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT || '10000'),
                    commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT || '5000'),
                },
                database: parseInt(process.env.REDIS_DB || '0'),
            });

            await redisReadClient.connect();
            connectionStatus.redis.read = true;

            logger.info('✅ Redis (Read) connected');
        } else {
            // Usar o mesmo cliente para leitura
            redisReadClient = redisClient;
            connectionStatus.redis.read = connectionStatus.redis.write;
        }

        // Testa conexão
        const pong = await redisClient.ping();
        const info = await redisClient.info();
        const redisVersion = info.split('\r\n').find(line => line.startsWith('redis_version:'))?.split(':')[1];

        logger.info('✅ Redis connected', {
            ping: pong,
            version: redisVersion,
            database: process.env.REDIS_DB || '0',
        });

    } catch (error) {
        connectionStatus.redis.write = false;
        connectionStatus.redis.read = false;
        logger.error('❌ Failed to connect to Redis', {
            error: error instanceof Error ? error.message : String(error),
            url: process.env.REDIS_URL?.replace(/:.*@/, ':***@'), // Mascarar credenciais
        });
        throw error;
    }
}

/**
 * Setup de monitoramento das conexões
 */
function setupConnectionMonitoring(): void {
    // PostgreSQL Write Pool monitoring
    pgWritePool.on('connect', (client) => {
        logger.debug('PostgreSQL (Write) client connected', {
            totalCount: pgWritePool.totalCount,
            idleCount: pgWritePool.idleCount,
            waitingCount: pgWritePool.waitingCount,
        });
    });

    pgWritePool.on('error', (error) => {
        logger.error('PostgreSQL (Write) pool error', { error: error.message });
        connectionStatus.postgres.write = false;
    });

    pgWritePool.on('remove', () => {
        logger.debug('PostgreSQL (Write) client removed from pool');
    });

    // MongoDB monitoring
    if (mongoClient) {
        mongoClient.on('connectionPoolCreated', () => {
            logger.debug('MongoDB connection pool created');
        });

        mongoClient.on('connectionPoolClosed', () => {
            logger.warn('MongoDB connection pool closed');
            connectionStatus.mongodb = false;
        });

        mongoClient.on('serverHeartbeatFailed', (event) => {
            logger.warn('MongoDB server heartbeat failed', {
                connectionId: event.connectionId,
                failure: event.failure,
            });
        });

        mongoClient.on('topologyDescriptionChanged', (event) => {
            logger.debug('MongoDB topology changed', {
                previousDescription: event.previousDescription.type,
                newDescription: event.newDescription.type,
            });
        });
    }
}

/**
 * Executa transação PostgreSQL
 */
export async function withPostgresTransaction<T>(
    callback: TransactionCallback<T>,
    pool: Pool = pgWritePool
): Promise<T> {
    if (!pool) {
        throw new Error('PostgreSQL pool not initialized');
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch (rollbackError) {
            logger.error('Failed to rollback transaction', {
                error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
            });
        }

        logger.error('PostgreSQL transaction failed', {
            error: error instanceof Error ? error.message : String(error),
        });
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Service de Cache Redis com padrões comuns
 */
export class CacheService {
    /**
     * Define um valor no cache
     */
    static async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
        if (!redisClient) {
            logger.warn('Redis client not available for set operation');
            return;
        }

        try {
            const serialized = JSON.stringify(value);
            if (ttlSeconds) {
                await redisClient.setEx(key, ttlSeconds, serialized);
            } else {
                await redisClient.set(key, serialized);
            }
        } catch (error) {
            logger.warn('Cache set failed', {
                key,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    /**
     * Obtém um valor do cache
     */
    static async get<T = any>(key: string): Promise<T | null> {
        if (!redisReadClient) {
            logger.warn('Redis read client not available for get operation');
            return null;
        }

        try {
            const value = await redisReadClient.get(key);
            return value ? JSON.parse(value) : null;
        } catch (error) {
            logger.warn('Cache get failed', {
                key,
                error: error instanceof Error ? error.message : String(error),
            });
            return null;
        }
    }

    /**
     * Remove um valor do cache
     */
    static async del(key: string): Promise<void> {
        if (!redisClient) {
            logger.warn('Redis client not available for del operation');
            return;
        }

        try {
            await redisClient.del(key);
        } catch (error) {
            logger.warn('Cache del failed', {
                key,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    /**
     * Remove múltiplas chaves do cache
     */
    static async delMany(keys: string[]): Promise<void> {
        if (keys.length === 0) return;

        if (!redisClient) {
            logger.warn('Redis client not available for delMany operation');
            return;
        }

        try {
            await redisClient.del(keys);
        } catch (error) {
            logger.warn('Cache delMany failed', {
                keys: keys.length,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    /**
     * Remove chaves por padrão
     */
    static async delPattern(pattern: string): Promise<void> {
        if (!redisClient || !redisReadClient) {
            logger.warn('Redis clients not available for delPattern operation');
            return;
        }

        try {
            const keys = await redisReadClient.keys(pattern);
            if (keys.length > 0) {
                await redisClient.del(keys);
            }
        } catch (error) {
            logger.warn('Cache delPattern failed', {
                pattern,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    /**
     * Incrementa um valor numérico
     */
    static async incr(key: string): Promise<number> {
        if (!redisClient) {
            logger.warn('Redis client not available for incr operation');
            return 0;
        }

        try {
            return await redisClient.incr(key);
        } catch (error) {
            logger.warn('Cache incr failed', {
                key,
                error: error instanceof Error ? error.message : String(error),
            });
            return 0;
        }
    }

    /**
     * Define TTL para uma chave
     */
    static async expire(key: string, seconds: number): Promise<void> {
        if (!redisClient) {
            logger.warn('Redis client not available for expire operation');
            return;
        }

        try {
            await redisClient.expire(key, seconds);
        } catch (error) {
            logger.warn('Cache expire failed', {
                key,
                seconds,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    /**
     * Busca chaves por padrão
     */
    static async keys(pattern: string): Promise<string[]> {
        if (!redisReadClient) {
            logger.warn('Redis read client not available for keys operation');
            return [];
        }

        try {
            return await redisReadClient.keys(pattern);
        } catch (error) {
            logger.warn('Cache keys failed', {
                pattern,
                error: error instanceof Error ? error.message : String(error),
            });
            return [];
        }
    }

    /**
     * Verifica se uma chave existe
     */
    static async exists(key: string): Promise<boolean> {
        if (!redisReadClient) {
            logger.warn('Redis read client not available for exists operation');
            return false;
        }

        try {
            const result = await redisReadClient.exists(key);
            return result === 1;
        } catch (error) {
            logger.warn('Cache exists failed', {
                key,
                error: error instanceof Error ? error.message : String(error),
            });
            return false;
        }
    }

    /**
     * TTL de uma chave
     */
    static async ttl(key: string): Promise<number> {
        if (!redisReadClient) {
            logger.warn('Redis read client not available for ttl operation');
            return -1;
        }

        try {
            return await redisReadClient.ttl(key);
        } catch (error) {
            logger.warn('Cache ttl failed', {
                key,
                error: error instanceof Error ? error.message : String(error),
            });
            return -1;
        }
    }

    /**
     * Implementa cache-aside pattern
     */
    static async getOrSet<T>(
        key: string,
        factory: () => Promise<T>,
        ttlSeconds?: number
    ): Promise<T> {
        const cached = await this.get<T>(key);
        if (cached !== null) {
            return cached;
        }

        const value = await factory();
        await this.set(key, value, ttlSeconds);
        return value;
    }
}

/**
 * Fecha todas as conexões
 */
export async function closeDatabases(): Promise<void> {
    logger.info('🔌 Closing database connections...');

    const closePromises: Promise<void>[] = [];

    // Fecha PostgreSQL Write
    if (pgWritePool) {
        closePromises.push(
            pgWritePool.end().then(() => {
                logger.info('✅ PostgreSQL (Write) connection closed');
                connectionStatus.postgres.write = false;
            }).catch(error => {
                logger.warn('⚠️ Error closing PostgreSQL (Write)', { error: error.message });
            })
        );
    }

    // Fecha PostgreSQL Read (se diferente do Write)
    if (pgReadPool && pgReadPool !== pgWritePool) {
        closePromises.push(
            pgReadPool.end().then(() => {
                logger.info('✅ PostgreSQL (Read) connection closed');
                connectionStatus.postgres.read = false;
            }).catch(error => {
                logger.warn('⚠️ Error closing PostgreSQL (Read)', { error: error.message });
            })
        );
    }

    // Fecha MongoDB
    if (mongoClient) {
        closePromises.push(
            mongoClient.close().then(() => {
                logger.info('✅ MongoDB connection closed');
                connectionStatus.mongodb = false;
            }).catch(error => {
                logger.warn('⚠️ Error closing MongoDB', { error: error.message });
            })
        );
    }

    // Fecha Redis Write
    if (redisClient) {
        closePromises.push(
            redisClient.quit().then(() => {
                logger.info('✅ Redis connection closed');
                connectionStatus.redis.write = false;
            }).catch(error => {
                logger.warn('⚠️ Error closing Redis', { error: error.message });
            })
        );
    }

    // Fecha Redis Read (se diferente do Write)
    if (redisReadClient && redisReadClient !== redisClient) {
        closePromises.push(
            redisReadClient.quit().then(() => {
                logger.info('✅ Redis (Read) connection closed');
                connectionStatus.redis.read = false;
            }).catch(error => {
                logger.warn('⚠️ Error closing Redis (Read)', { error: error.message });
            })
        );
    }

    await Promise.allSettled(closePromises);
    logger.info('🔌 All database connections closed');
}

/**
 * Retorna status das conexões
 */
export function getConnectionStatus(): ConnectionStatus {
    return { ...connectionStatus };
}

/**
 * Verifica se todas as conexões estão ativas
 */
export function areAllConnectionsHealthy(): boolean {
    return (
        connectionStatus.postgres.write &&
        connectionStatus.postgres.read &&
        connectionStatus.mongodb &&
        connectionStatus.redis.write &&
        connectionStatus.redis.read
    );
}

/**
 * Health check para uso em endpoints
 */
export async function performHealthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    connections: ConnectionStatus;
    details: Record<string, any>;
}> {
    const details: Record<string, any> = {};

    try {
        // Test PostgreSQL Write
        if (pgWritePool) {
            const client = await pgWritePool.connect();
            await client.query('SELECT 1');
            client.release();
            details.postgres_write = 'healthy';
        }

        // Test MongoDB
        if (mongoClient && mongoDB) {
            await mongoClient.db('admin').admin().ping();
            details.mongodb = 'healthy';
        }

        // Test Redis
        if (redisClient) {
            await redisClient.ping();
            details.redis_write = 'healthy';
        }

        if (redisReadClient && redisReadClient !== redisClient) {
            await redisReadClient.ping();
            details.redis_read = 'healthy';
        }

    } catch (error) {
        logger.warn('Health check failed for some connections', {
            error: error instanceof Error ? error.message : String(error),
        });
    }

    const allHealthy = areAllConnectionsHealthy();
    const hasEssentialConnections = connectionStatus.postgres.write;

    return {
        status: allHealthy ? 'healthy' : hasEssentialConnections ? 'degraded' : 'unhealthy',
        connections: getConnectionStatus(),
        details,
    };
}