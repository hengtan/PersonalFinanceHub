import { z } from 'zod';

const environmentSchema = z.object({
    // Application
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.string().transform(val => parseInt(val, 10)).default('3333'),

    // Database - PostgreSQL
    POSTGRES_HOST: z.string().default('localhost'),
    POSTGRES_PORT: z.string().transform(val => parseInt(val, 10)).default('5432'),
    POSTGRES_DB: z.string().default('personal_finance'),
    POSTGRES_USER: z.string().default('pfh_admin'),
    POSTGRES_PASSWORD: z.string(),

    // Database - PostgreSQL Read Replica
    POSTGRES_READ_HOST: z.string().optional(),
    POSTGRES_READ_PORT: z.string().transform(val => parseInt(val, 10)).optional(),

    // Database - MongoDB
    MONGODB_URI: z.string(),

    // Cache - Redis
    REDIS_HOST: z.string().default('localhost'),
    REDIS_PORT: z.string().transform(val => parseInt(val, 10)).default('6379'),
    REDIS_PASSWORD: z.string().optional(),
    REDIS_READ_HOST: z.string().optional(),
    REDIS_READ_PORT: z.string().transform(val => parseInt(val, 10)).optional(),

    // Messaging - Kafka
    KAFKA_BROKERS: z.string().transform(val => val.split(',')),

    // Storage - MinIO
    MINIO_ENDPOINT: z.string().default('localhost:9000'),
    MINIO_ACCESS_KEY: z.string().default('pfh_admin'),
    MINIO_SECRET_KEY: z.string(),
    MINIO_USE_SSL: z.string().transform(val => val === 'true').default('false'),

    // Security - JWT
    JWT_SECRET: z.string().min(32, 'JWT Secret deve ter pelo menos 32 caracteres'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT Refresh Secret deve ter pelo menos 32 caracteres'),

    // External Services
    PROMETHEUS_ENDPOINT: z.string().optional(),
    JAEGER_ENDPOINT: z.string().optional(),

    // Logging
    LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

    // Features
    ENABLE_SWAGGER: z.string().transform(val => val === 'true').default('true'),
    ENABLE_METRICS: z.string().transform(val => val === 'true').default('true'),
    ENABLE_TRACING: z.string().transform(val => val === 'true').default('true')
});

export type Environment = z.infer<typeof environmentSchema>;

class ConfigService {
    private static instance: ConfigService;
    private readonly config: Environment;

    private constructor() {
        try {
            this.config = environmentSchema.parse(process.env);
        } catch (error) {
            console.error('❌ Configuração inválida:', error.errors);
            process.exit(1);
        }
    }

    static getInstance(): ConfigService {
        if (!ConfigService.instance) {
            ConfigService.instance = new ConfigService();
        }
        return ConfigService.instance;
    }

    get<K extends keyof Environment>(key: K): Environment[K] {
        return this.config[key];
    }

    getAll(): Environment {
        return { ...this.config };
    }

    // Convenience methods
    isDevelopment(): boolean {
        return this.config.NODE_ENV === 'development';
    }

    isProduction(): boolean {
        return this.config.NODE_ENV === 'production';
    }

    isTest(): boolean {
        return this.config.NODE_ENV === 'test';
    }

    getDatabaseUrl(): string {
        return `postgresql://${this.config.POSTGRES_USER}:${this.config.POSTGRES_PASSWORD}@${this.config.POSTGRES_HOST}:${this.config.POSTGRES_PORT}/${this.config.POSTGRES_DB}`;
    }

    getRedisUrl(): string {
        const auth = this.config.REDIS_PASSWORD ? `${this.config.REDIS_PASSWORD}@` : '';
        return `redis://${auth}${this.config.REDIS_HOST}:${this.config.REDIS_PORT}`;
    }
}

export const config = ConfigService.getInstance();