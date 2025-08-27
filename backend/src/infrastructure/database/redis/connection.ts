// Redis Connection
export async function connectRedis(): Promise<RedisClientType> {
    const config = {
        socket: {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379', 10),
        },
        password: process.env.REDIS_PASSWORD || 'redis_secure_2024',
        database: 0,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
    };

    redisClient = createClient(config);

    // Error handling
    redisClient.on('error', (error) => {
        logger.error({ error }, 'Redis connection error');
    });

    redisClient.on('connect', () => {
        logger.info('Redis connection established');
    });

    redisClient.on('ready', () => {
        logger.info('Redis client ready');
    });

    redisClient.on('end', () => {
        logger.warn('Redis connection closed');
    });

    try {
        await redisClient.connect();

        // Test connection
        await redisClient.ping();
        logger.info('Redis connection tested successfully');
        return redisClient;
    } catch (error) {
        logger.error({ error, config: { ...config, password: '[HIDDEN]' } }, 'Failed to connect to Redis');
        throw error;
    }
}