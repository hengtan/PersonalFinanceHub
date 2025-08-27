// backend/src/shared/utils/logger.util.ts
import winston from 'winston';

const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.printf(({ level, message, timestamp, ...meta }) => {
        return JSON.stringify({
            timestamp,
            level,
            message,
            ...meta
        });
    })
);

export const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    defaultMeta: {
        service: 'personal-finance-hub',
        environment: process.env.NODE_ENV || 'development'
    },
    transports: [
        new winston.transports.Console({
            format: process.env.NODE_ENV === 'development'
                ? winston.format.combine(
                    winston.format.colorize(),
                    winston.format.simple()
                )
                : logFormat
        }),
        new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 10
        }),
        new winston.transports.File({
            filename: 'logs/combined.log',
            maxsize: 5242880, // 5MB
            maxFiles: 10
        })
    ]
});

// backend/src/infrastructure/database/redis/cache.service.ts
import Redis from 'ioredis';
import { logger } from '../../../shared/utils/logger.util';
import { CacheException } from '../../../shared/exceptions/infrastructure.exception';

export interface CacheService {
    get<T>(key: string): Promise<T | null>;
    set(key: string, value: any, ttl?: number): Promise<void>;
    delete(key: string): Promise<void>;
    deletePattern(pattern: string): Promise<void>;
    exists(key: string): Promise<boolean>;
    increment(key: string, value?: number): Promise<number>;
    expire(key: string, ttl: number): Promise<void>;
    clear(): Promise<void>;
}

export class RedisCacheService implements CacheService {
    private readonly redis: Redis;
    private readonly redisRead: Redis;

    constructor() {
        // Master Redis connection (write)
        this.redis = new Redis({
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD,
            retryDelayOnFailover: 100,
            maxRetriesPerRequest: 3,
            lazyConnect: true,
        });

        // Replica Redis connection (read)
        this.redisRead = new Redis({
            host: process.env.REDIS_READ_HOST || process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_READ_PORT || process.env.REDIS_PORT || '6380'),
            password: process.env.REDIS_PASSWORD,
            retryDelayOnFailover: 100,
            maxRetriesPerRequest: 3,
            lazyConnect: true,
        });

        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        this.redis.on('connect', () => {
            logger.info('Redis master connected');
        });

        this.redis.on('error', (error) => {
            logger.error('Redis master error', { error: error.message });
        });

        this.redisRead.on('connect', () => {
            logger.info('Redis replica connected');
        });

        this.redisRead.on('error', (error) => {
            logger.error('Redis replica error', { error: error.message });
        });
    }

    async get<T>(key: string): Promise<T | null> {
        try {
            const value = await this.redisRead.get(key);

            if (!value) {
                return null;
            }

            try {
                return JSON.parse(value);
            } catch {
                return value as T;
            }
        } catch (error) {
            logger.error('Cache get error', { key, error: error.message });
            throw new CacheException(`Failed to get cache key: ${key}`, { key, error: error.message });
        }
    }

    async set(key: string, value: any, ttl?: number): Promise<void> {
        try {
            const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);

            if (ttl) {
                await this.redis.setex(key, ttl, serializedValue);
            } else {
                await this.redis.set(key, serializedValue);
            }

            logger.debug('Cache set', { key, ttl });
        } catch (error) {
            logger.error('Cache set error', { key, error: error.message });
            throw new CacheException(`Failed to set cache key: ${key}`, { key, error: error.message });
        }
    }

    async delete(key: string): Promise<void> {
        try {
            await this.redis.del(key);
            logger.debug('Cache delete', { key });
        } catch (error) {
            logger.error('Cache delete error', { key, error: error.message });
            throw new CacheException(`Failed to delete cache key: ${key}`, { key, error: error.message });
        }
    }

    async deletePattern(pattern: string): Promise<void> {
        try {
            const keys = await this.redis.keys(pattern);

            if (keys.length > 0) {
                await this.redis.del(...keys);
                logger.debug('Cache pattern delete', { pattern, deletedKeys: keys.length });
            }
        } catch (error) {
            logger.error('Cache pattern delete error', { pattern, error: error.message });
            throw new CacheException(`Failed to delete cache pattern: ${pattern}`, { pattern, error: error.message });
        }
    }

    async exists(key: string): Promise<boolean> {
        try {
            const result = await this.redisRead.exists(key);
            return result === 1;
        } catch (error) {
            logger.error('Cache exists error', { key, error: error.message });
            throw new CacheException(`Failed to check cache key existence: ${key}`, { key, error: error.message });
        }
    }

    async increment(key: string, value: number = 1): Promise<number> {
        try {
            const result = await this.redis.incrby(key, value);
            logger.debug('Cache increment', { key, value, result });
            return result;
        } catch (error) {
            logger.error('Cache increment error', { key, value, error: error.message });
            throw new CacheException(`Failed to increment cache key: ${key}`, { key, error: error.message });
        }
    }

    async expire(key: string, ttl: number): Promise<void> {
        try {
            await this.redis.expire(key, ttl);
            logger.debug('Cache expire set', { key, ttl });
        } catch (error) {
            logger.error('Cache expire error', { key, ttl, error: error.message });
            throw new CacheException(`Failed to set expiry for cache key: ${key}`, { key, error: error.message });
        }
    }

    async clear(): Promise<void> {
        try {
            await this.redis.flushall();
            logger.info('Cache cleared');
        } catch (error) {
            logger.error('Cache clear error', { error: error.message });
            throw new CacheException('Failed to clear cache', { error: error.message });
        }
    }

    async disconnect(): Promise<void> {
        try {
            await this.redis.disconnect();
            await this.redisRead.disconnect();
            logger.info('Redis connections closed');
        } catch (error) {
            logger.error('Redis disconnect error', { error: error.message });
        }
    }
}

// backend/src/core/domain/repositories/user.repository.ts
import { BaseEntity } from '../../../shared/types/database.types';
import { ContactInfo, UserPreferences } from '../../../shared/types/common.types';

export interface User extends BaseEntity {
    email: string;
    name: string;
    password: string;
    cpf?: string;
    phone?: string;
    dateOfBirth?: Date;
    isActive: boolean;
    isEmailVerified: boolean;
    role: 'USER' | 'ADMIN' | 'PREMIUM';
    lastLoginAt?: Date;
    preferences: UserPreferences;
    contactInfo: ContactInfo;
}

export interface CreateUserData {
    email: string;
    name: string;
    password: string;
    cpf?: string;
    phone?: string;
    dateOfBirth?: Date;
    preferences?: Partial<UserPreferences>;
}

export interface UpdateUserData {
    name?: string;
    phone?: string;
    dateOfBirth?: Date;
    preferences?: Partial<UserPreferences>;
    contactInfo?: Partial<ContactInfo>;
}

export interface UserRepository {
    findById(id: string): Promise<User | null>;
    findByEmail(email: string): Promise<User | null>;
    findByCpf(cpf: string): Promise<User | null>;
    create(data: CreateUserData): Promise<User>;
    update(id: string, data: UpdateUserData): Promise<User>;
    delete(id: string): Promise<void>;
    activate(id: string): Promise<void>;
    deactivate(id: string): Promise<void>;
    updateLastLogin(id: string): Promise<void>;
    findMany(filters?: any, pagination?: any): Promise<{ users: User[]; total: number }>;
}

// backend/src/api/middlewares/error-handler.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { BaseException } from '../../shared/exceptions/base.exception';
import { ValidationException } from '../../shared/exceptions/validation.exception';
import { BusinessException } from '../../shared/exceptions/business.exception';
import { InfrastructureException } from '../../shared/exceptions/infrastructure.exception';
import { logger } from '../../shared/utils/logger.util';
import { HTTP_STATUS } from '../../shared/constants/status-codes';

export class ErrorHandlerMiddleware {
    static handle(error: Error, req: Request, res: Response, next: NextFunction): void {
        // Log the error
        logger.error('Request error', {
            error: error.message,
            stack: error.stack,
            url: req.url,
            method: req.method,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            userId: req.user?.id
        });

        // Handle known exceptions
        if (error instanceof BaseException) {
            res.status(error.statusCode).json({
                success: false,
                message: error.message,
                code: error.code,
                ...(error.details && { errors: error.details })
            });
            return;
        }

        // Handle validation errors specifically
        if (error instanceof ValidationException) {
            res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: error.message,
                code: 'VALIDATION_ERROR',
                errors: error.validationErrors
            });
            return;
        }

        // Handle business logic errors
        if (error instanceof BusinessException) {
            res.status(error.statusCode).json({
                success: false,
                message: error.message,
                code: 'BUSINESS_ERROR'
            });
            return;
        }

        // Handle infrastructure errors
        if (error instanceof InfrastructureException) {
            res.status(error.statusCode).json({
                success: false,
                message: process.env.NODE_ENV === 'production'
                    ? 'Erro interno do sistema'
                    : error.message,
                code: error.code
            });
            return;
        }

        // Handle JWT errors
        if (error.name === 'JsonWebTokenError') {
            res.status(HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                message: 'Token inválido',
                code: 'INVALID_TOKEN'
            });
            return;
        }

        if (error.name === 'TokenExpiredError') {
            res.status(HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                message: 'Token expirado',
                code: 'EXPIRED_TOKEN'
            });
            return;
        }

        // Handle Multer errors (file upload)
        if (error.name === 'MulterError') {
            res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: 'Erro no upload do arquivo',
                code: 'UPLOAD_ERROR',
                details: error.message
            });
            return;
        }

        // Handle database errors
        if (error.name === 'QueryFailedError' || error.name === 'MongoError') {
            res.status(HTTP_STATUS.INTERNAL_ERROR).json({
                success: false,
                message: process.env.NODE_ENV === 'production'
                    ? 'Erro de banco de dados'
                    : error.message,
                code: 'DATABASE_ERROR'
            });
            return;
        }

        // Default error handler
        res.status(HTTP_STATUS.INTERNAL_ERROR).json({
            success: false,
            message: process.env.NODE_ENV === 'production'
                ? 'Erro interno do servidor'
                : error.message,
            code: 'INTERNAL_ERROR',
            ...(process.env.NODE_ENV === 'development' && {
                stack: error.stack
            })
        });
    }

    static notFound(req: Request, res: Response): void {
        logger.warn('Route not found', {
            url: req.url,
            method: req.method,
            ip: req.ip
        });

        res.status(HTTP_STATUS.NOT_FOUND).json({
            success: false,
            message: `Rota ${req.method} ${req.url} não encontrada`,
            code: 'ROUTE_NOT_FOUND'
        });
    }
}